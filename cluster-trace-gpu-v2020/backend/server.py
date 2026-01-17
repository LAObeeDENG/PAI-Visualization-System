from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import sqlite3
import pandas as pd
import numpy as np
import os
from llm_analyser import LLMAnalyser

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
    # TOP 10 机器 (截断 ID 解决挤压问题)
    query_top10 = """
    SELECT SUBSTR(worker_name, -8) as name, AVG(gpu_wrk_util) as val 
    FROM sensors 
    GROUP BY worker_name 
    ORDER BY val DESC 
    LIMIT 10
    """
    top10 = pd.read_sql(query_top10, conn).to_dict(orient='records')

    # 等待时长分桶
    wait_buckets = pd.read_sql("SELECT name, value FROM v_wait_buckets", conn).to_dict(orient='records')
    conn.close()
    return {
        "top10": top10,
        "waitBuckets": wait_buckets
    }

# 仿真脚本所在的绝对路径（根据 Windows 实际路径修改）
SIMULATOR_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "simulator"))
import subprocess
import io
import pandas as pd
import glob
import time  # 记得导入 time 模块

@app.post("/api/simulator/run")
def run_simulation():
    try:
        # 0. 记录当前时间，用于后续过滤“真正最新”的文件
        start_time = time.time()

        # 1. 执行仿真
        # 使用 check=True 强制要求脚本运行成功才向下走
        result = subprocess.run(
            ['python', 'run_simulator.py', '-n', '9000', '-r', '1000'],
            cwd=SIMULATOR_DIR,
            shell=True,
            capture_output=True,
            text=True,
            check=True
        )

        # 2. 等待并定位日志文件
        # Windows 写入大文件可能有延迟，我们循环检测 5 次
        latest_log = None
        for _ in range(5):
            log_pattern = os.path.join(SIMULATOR_DIR, "logs", "*.log")
            list_of_files = glob.glob(log_pattern)

            if list_of_files:
                # 找出在点击按钮之后生成的、且最新的文件
                possible_files = [f for f in list_of_files if os.path.getctime(f) > start_time - 5]
                if possible_files:
                    latest_log = max(possible_files, key=os.path.getctime)
                    break

            time.sleep(2)  # 每隔 2 秒检查一次

        if not latest_log:
            # 调试信息：如果找不到，把 subprocess 的错误输出打印出来看看
            return {
                "error": "未找到本次仿真生成的日志文件",
                "stdout_snippet": result.stdout[:200],
                "stderr": result.stderr
            }

        # 3. 确保文件已经写完（等待一小会儿）
        time.sleep(1)

        # 4. 读取与解析
        with open(latest_log, 'r', encoding='utf-8') as f:
            content = f.read()

        if "# Sort by JCT" in content:
            csv_part = content.split("# Sort by JCT")[1].strip()
            csv_lines = csv_part.split('\n')[1:]
            csv_data = "\n".join(csv_lines)

            df = pd.read_csv(io.StringIO(csv_data), header=None,
                             names=["policy", "preempt", "avg_jct", "wait_time", "makespan", "jobs_done", "runtime"])

            results = []
            for _, row in df.iterrows():
                raw_policy = str(row['policy'])
                clean_name = raw_policy.replace('(', '').replace(')', '').split(',')[0].strip()

                results.append({
                    "key": clean_name,
                    "algo": clean_name,
                    "jct": float(row['avg_jct']),
                    "wait": float(row['wait_time']),
                    "status": "Optimal" if "SJF" in clean_name else "Baseline"
                })

            # ======= 关键修改处：将结果同步到全局变量 =======
            global latest_sim_results
            latest_sim_results = results
            # ============================================

            return {"success": True, "data": results}
        else:
            return {"error": "日志文件内容尚未刷新，请稍后再试"}

    except subprocess.CalledProcessError as e:
        return {"error": f"仿真脚本运行崩溃: {e.stderr}"}
    except Exception as e:
        return {"error": str(e)}


# 增加：Straggler (掉队者) 检测接口
# 更新数据目录路径
STRAGGLER_DATA_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "mini-batch-time", "data"))

@app.get("/api/analysis/stragglers")
def detect_stragglers():
    try:
        # 1. 模拟从数据库/日志读取 Job 的 mini-batch-time 序列
        # 在真实场景中，你会从 analysis_wide_table 按照 job_name 分组查询 inst_start/inst_end
        # 这里保留你的原始分析逻辑
        analysis_results = []
        for i in range(1, 4):  # 假设分析前3个 Job
            try:
                # 模拟数据：每个 Job 有 50 个 mini-batch 的耗时
                batch_times = np.random.normal(loc=1.0, scale=0.1, size=50)
                if i == 2:  # 故意让第二个 Job 产生波动
                    batch_times[25] = 5.0

                avg_t = np.mean(batch_times)
                std_t = np.std(batch_times)
                final_cov = std_t / avg_t

                # 找到最慢的那个点（模拟）
                max_idx = np.argmax(batch_times)
                max_time_point = f"Batch_{max_idx}"
                max_cov = batch_times[max_idx] / avg_t
                slowest_worker_id = np.random.randint(1000, 9999)

                status = "Healthy" if final_cov < 0.3 else "Warning"
                if final_cov > 0.6: status = "Critical"

                analysis_results.append({
                    "job_id": f"Job {i}",
                    "status": status,
                    "cov": round(float(final_cov), 3),
                    "max_cov": round(float(max_cov), 3),
                    "reason": f"在时间点 {max_time_point} 波动最大，Worker {int(slowest_worker_id)} 严重拖慢进度",
                    "suggestion": "检查该节点 GPU 频率或网络 IO 瓶颈" if status != "Healthy" else "运行平稳"
                })
            except Exception as e:
                print(f"解析 Job {i} 失败: {e}")
                continue

        # 2. 读取作者预计算好的 coefficient_variation.csv (可选)
        # 如果你想展示汇总数据，也可以把这个文件的内容读出来返回给前端

        return {
            "success": True,
            "summary": f"基于 mini-batch-time 分析，发现 {len([x for x in analysis_results if x['status'] != 'Healthy'])} 个作业存在 Straggler 风险。",
            "details": analysis_results
        }
    except Exception as e:
        return {"error": str(e)}


# --- 关键：将 AI 接口移出函数体，确保路由独立注册 ---
@app.post("/api/analysis/ai-report")
async def get_ai_report():
    """
    一键 AI 专家诊断接口
    """
    # 1. 聚合情报 (通过 DB_PATH 获取最新 KPI 和异常线索)
    # latest_sim_results 会读取在 run_simulation 中更新后的全局变量
    context = analyser.get_ai_intelligence_context(latest_sim_results)

    # 2. 调用通义千问大模型进行专家级研判
    report = analyser.ask_qwen_expert(context)

    return {"analysis": report}

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)