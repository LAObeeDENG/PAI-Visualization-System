from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import sqlite3
import pandas as pd
import numpy as np
import os
from pydantic import BaseModel
from llm_analyser import LLMAnalyser
import json
from datetime import datetime
# 全局存储最近一次仿真结果，供 AI 接口读取
latest_sim_results = []
analyser = LLMAnalyser(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                    "..", "data_process", "pai_data.db"),
                       "sk-d6986b7fa33b488782df768e64728e96")
app = FastAPI()

# 允许本地前端 (localhost:5173) 访问本地后端 (localhost:8000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 获取数据库的绝对路径，确保在 Windows 下能找到文件
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "..", "data_process", "pai_data.db")


# 1. 顶部 KPI 接口
@app.get("/api/dashboard/kpi")
def get_kpi():
    conn = sqlite3.connect(DB_PATH)
    # 核心指标计算
    query = """
    SELECT 
        (SELECT total_gpu FROM v_real_gpu) as total_gpu,
        (SELECT COUNT(DISTINCT job_name) FROM analysis_wide_table WHERE status = 'Running') as active_jobs,
        AVG(wait_time) as avg_wait,
        AVG(gpu_over_provisioning) * 100 as overprov
    FROM analysis_wide_table
    """
    res = pd.read_sql(query, conn).iloc[0]
    conn.close()

    return {
        "total_gpu": int(res['total_gpu'] or 0),
        "active_jobs": int(res['active_jobs'] or 0),
        "avg_wait": f"{round((res['avg_wait'] or 0) / 60, 1)}m",
        "overprov": round(res['overprov'] or 0, 1)
    }


# 2. 中间层图表接口 (分布 & 型号)
@app.get("/api/dashboard/charts/middle")
def get_middle_charts():
    conn = sqlite3.connect(DB_PATH)

    # GPU 利用率分布 → 名称+数值（饼图格式）
    gpu_dist = pd.read_sql("""
        SELECT bucket as name, count as value
        FROM v_gpu_dist
        ORDER BY bucket
    """, conn).to_dict(orient='records')

    # 机器型号占比（保持原样）
    gpu_models = pd.read_sql(
        "SELECT name, value FROM v_gpu_models", conn
    ).to_dict(orient='records')

    conn.close()
    return {
        "gpuDist": gpu_dist or [{"name": "0-20%", "value": 0}] * 5,
        "gpuModels": gpu_models
    }


# 3. 底部层图表接口 (TOP10 & 等待时长)
@app.get("/api/dashboard/charts/bottom")
def get_bottom_charts():
    conn = sqlite3.connect(DB_PATH)

    # 按周内小时统计任务数（0~167，对应周日0点到周六23点）
    hourly_tasks = pd.read_sql(
        "SELECT hour_of_week, task_count FROM v_hourly_tasks ORDER BY hour_of_week",
        conn
    ).to_dict(orient='records')

    wait_buckets = pd.read_sql(
        "SELECT name, value FROM v_wait_buckets", conn
    ).to_dict(orient='records')

    conn.close()
    return {
        "hourlyTasks": hourly_tasks,
        "waitBuckets": wait_buckets
    }

# 仿真脚本所在的绝对路径（根据 Windows 实际路径修改）
SIMULATOR_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "simulator"))
import subprocess
import io
import pandas as pd
import glob
import time  # 记得导入 time 模块

#cdf图表绘制接口
@app.get("/api/dashboard/charts/cdf")
def get_cdf_charts():
    conn = sqlite3.connect(DB_PATH)
    NUM_POINTS = 200  # CDF 采样点数

    # --- 实例运行时长 CDF ---
    df_runtime = pd.read_sql(
        "SELECT runtime FROM v_instance_runtime", conn
    )
    runtime_arr = np.sort(df_runtime['runtime'].dropna().values)
    n = len(runtime_arr)
    indices = np.linspace(0, n - 1, NUM_POINTS, dtype=int)
    runtime_cdf = [
        {"value": float(runtime_arr[i]), "cdf": round(float(i / (n - 1) * 100), 2)}
        for i in indices
    ]

    # --- GPU 申请量 CDF ---
    df_gpu = pd.read_sql(
        "SELECT plan_gpu, avg_gpu_util FROM v_gpu_cdf_data", conn
    )
    plan_arr = np.sort(df_gpu['plan_gpu'].dropna().values)
    np_plan = len(plan_arr)
    idx_plan = np.linspace(0, np_plan - 1, NUM_POINTS, dtype=int)
    plan_cdf = [
        {"value": float(plan_arr[i]), "cdf": round(float(i / (np_plan - 1) * 100), 2)}
        for i in idx_plan
    ]

    # --- GPU 实际使用量 CDF ---
    util_arr = np.sort(df_gpu['avg_gpu_util'].dropna().values)
    np_util = len(util_arr)
    idx_util = np.linspace(0, np_util - 1, NUM_POINTS, dtype=int)
    util_cdf = [
        {"value": float(util_arr[i]), "cdf": round(float(i / (np_util - 1) * 100), 2)}
        for i in idx_util
    ]

    conn.close()
    return {
        "runtimeCdf": runtime_cdf,
        "planCdf": plan_cdf,
        "utilCdf": util_cdf
    }


# =====请求体模型 =====
class SimRequest(BaseModel):
    algorithms: list = [0, 8]       # 选中的算法 id 列表
    num_jobs: int = 9000
    arrival_rate: int = 1000
    num_gpus: int = 6500
@app.post("/api/simulator/run")
def run_simulation(req: SimRequest):
    try:
        start_time = time.time()

        env = os.environ.copy()
        env['SELECTED_ALGOS'] = ','.join(str(a) for a in req.algorithms)

        result = subprocess.run(
            [
                'python', 'run_simulator.py',
                '-n', str(req.num_jobs),
                '-r', str(req.arrival_rate),
                '-g', str(req.num_gpus)
            ],
            cwd=SIMULATOR_DIR,
            shell=True,
            capture_output=True,
            text=True,
            check=True,
            env=env
        )

        latest_log = None
        for _ in range(5):
            log_pattern = os.path.join(SIMULATOR_DIR, "logs", "*.log")
            list_of_files = glob.glob(log_pattern)
            if list_of_files:
                possible_files = [f for f in list_of_files if os.path.getctime(f) > start_time - 5]
                if possible_files:
                    latest_log = max(possible_files, key=os.path.getctime)
                    break
            time.sleep(2)

        if not latest_log:
            return {
                "error": "未找到本次仿真生成的日志文件",
                "stdout_snippet": result.stdout[:200],
                "stderr": result.stderr
            }

        time.sleep(1)

        with open(latest_log, 'r', encoding='utf-8') as f:
            content = f.read()

        if "# Sort by JCT" in content:
            csv_part = content.split("# Sort by JCT")[1].strip()
            csv_lines = csv_part.split('\n')[1:]
            csv_data = "\n".join(csv_lines)

            df = pd.read_csv(
                io.StringIO(csv_data), header=None,
                names=["policy", "preempt", "avg_jct", "wait_time", "makespan", "jobs_done", "runtime"]
            )

            results = []
            for _, row in df.iterrows():
                raw_policy = str(row['policy'])
                clean_name = raw_policy.replace('(', '').replace(')', '').split(',')[0].strip()
                results.append({
                    "key": clean_name,
                    "algo": clean_name,
                    "jct": float(row['avg_jct']),
                    "wait": float(row['wait_time']),
                    "makespan": float(row['makespan']),
                    "status": "Optimal" if "SJF" in clean_name else "Baseline"
                })

            global latest_sim_results
            latest_sim_results = results

            # ===== 写入历史记录（在仿真成功、results 已赋值之后）=====
            try:
                algo_names = ','.join(r['algo'] for r in results)
                # 1. 获取当前完整时间：2026-03-25 17:10:11
                full_time_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                # 2. 判断模式标签
                mode_label = "单项" if len(req.algorithms) == 1 else "对比"
                # 3. 构造格式：[对比] 2026-03-25 17:10:11
                auto_name = f"[{mode_label}] {full_time_str}"

                conn_hist = sqlite3.connect(DB_PATH)
                conn_hist.execute("""
                    INSERT INTO simulation_history 
                    (created_at, num_jobs, arrival_rate, num_gpus, mode, algorithms, results)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (
                    auto_name,
                    req.num_jobs,
                    req.arrival_rate,
                    req.num_gpus,
                    'single' if len(req.algorithms) == 1 else 'compare',
                    algo_names,
                    json.dumps(results, ensure_ascii=False)
                ))
                conn_hist.commit()
                conn_hist.close()
            except Exception as e:
                print(f"历史记录写入失败: {e}")
            # =====

            return {
                "success": True,
                "data": results,
                "config": {
                    "num_jobs": req.num_jobs,
                    "arrival_rate": req.arrival_rate,
                    "num_gpus": req.num_gpus
                }
            }
        else:
            return {"error": "日志文件内容尚未刷新，请稍后再试"}

    except subprocess.CalledProcessError as e:
        return {"error": f"仿真脚本运行崩溃: {e.stderr}"}
    except Exception as e:
        return {"error": str(e)}


# 获取历史记录列表（只返回摘要，不返回完整 results）
@app.get("/api/simulator/history")
def get_sim_history():
    conn = sqlite3.connect(DB_PATH)
    rows = pd.read_sql("""
        SELECT id, created_at, num_jobs, arrival_rate, num_gpus, mode, algorithms
        FROM simulation_history
        ORDER BY id DESC
        LIMIT 20
    """, conn).to_dict(orient='records')
    conn.close()
    return {"history": rows}


# 获取某条历史记录的完整结果
@app.get("/api/simulator/history/{record_id}")
def get_sim_history_detail(record_id: int):
    import json
    conn = sqlite3.connect(DB_PATH)
    row = pd.read_sql(
        "SELECT * FROM simulation_history WHERE id = ?",
        conn, params=(record_id,)
    )
    conn.close()
    if row.empty:
        return {"error": "记录不存在"}
    record = row.iloc[0].to_dict()
    record['results'] = json.loads(record['results'])
    # 显式构造一个 config 对象发给前端
    record['config'] = {
        "num_jobs": record['num_jobs'],
        "arrival_rate": record['arrival_rate'],
        "num_gpus": record['num_gpus']
    }
    return {"record": record}

# 删除某条历史记录
@app.delete("/api/simulator/history/{record_id}")
def delete_sim_history(record_id: int):
    conn = sqlite3.connect(DB_PATH)
    conn.execute("DELETE FROM simulation_history WHERE id = ?", (record_id,))
    conn.commit()
    conn.close()
    return {"success": True}

# =====集群快照接口，供前端左侧面板展示 =====
@app.get("/api/analysis/cluster-snapshot")
def get_cluster_snapshot():
    data = analyser.get_cluster_snapshot_for_ui()
    return data


# ===== 新增：对话请求体模型 =====
class ChatRequest(BaseModel):
    messages: list   # [{"role": "user"/"assistant", "content": "..."}]


# ===== AI 对话接口（支持多轮） =====
@app.post("/api/analysis/ai-report")
async def get_ai_report(req: ChatRequest):
    reply = analyser.chat(req.messages)
    return {"reply": reply}

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)