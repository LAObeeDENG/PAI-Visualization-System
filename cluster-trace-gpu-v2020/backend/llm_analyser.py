import sqlite3
import pandas as pd
import json
from openai import OpenAI

# ===== 静态算法与集群知识库，每次请求都注入 =====
ALGO_KNOWLEDGE = """
【调度算法说明】
SJF (Shortest Job First - Oracle版本)：最短作业优先，使用任务真实运行时长排序，代表理论最优上界。实际生产中无法直接使用，因为事先无法知道任务真实时长，仅作为优化目标的参照基准。
SJU：SJF的实用版本，用用户(User)历史执行记录预测任务时长，适合用户行为稳定的场景。
SJG：在SJU基础上增加Group标签特征。Group通过哈希任务的入口脚本、命令行参数、数据源等元信息生成，能识别"重复任务"。PAI集群中65%的任务会重复执行5次以上，Group特征可显著提升预测精度。
SJGG：在SJG基础上再增加GPU型号(GPU type)特征，是预测精度最高的实用版本，综合考虑了用户习惯、任务重复性和硬件异构性。
FIFO (First In First Out)：先进先出，按提交时间排队，是最简单的基准策略。存在队头阻塞问题，短任务容易被长任务卡住，约9%的短任务等待时间超过其运行时间的50%。

【评估指标说明】
JCT (Job Completion Time)：作业周转时间，从提交到完成的总耗时，越低越好。
Wait Time：排队等待时间，衡量调度效率的核心指标，是JCT中可优化的部分。
Makespan：所有作业全部完成的总时长，衡量集群整体吞吐量。

【集群背景知识】
本系统分析的是阿里巴巴PAI(Platform for AI)平台的GPU集群，共6500+块GPU，分布在约1800台机器上。集群包含T4、P100、V100、V100M32、MISC等多种GPU型号，属于异构集群。集群同时运行训练和推理任务，支持GPU共享（多任务共享同一块GPU时间片），大多数任务只使用GPU的一小部分，中位数GPU利用率仅约4.2%，存在严重的资源超配现象。
"""


class LLMAnalyser:
    def __init__(self, db_path, api_key):
        self.db_path = db_path
        self.client = OpenAI(
            api_key=api_key,
            base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        )

    def _get_cluster_snapshot_text(self):
        """拼装文本格式的集群快照，用于注入系统 prompt"""
        conn = sqlite3.connect(self.db_path)
        try:
            # KPI
            kpi = pd.read_sql("""
                SELECT
                    (SELECT total_gpu FROM v_real_gpu) as total_gpu,
                    (SELECT COUNT(DISTINCT job_name) FROM analysis_wide_table WHERE status = 'Running') as active_jobs,
                    AVG(wait_time) / 60.0 as avg_wait_min,
                    AVG(gpu_over_provisioning) * 100 as avg_overprov
                FROM analysis_wide_table
            """, conn).iloc[0]

            # GPU 利用率分布
            gpu_dist = pd.read_sql(
                "SELECT bucket as name, count as value FROM v_gpu_dist ORDER BY bucket", conn
            )
            total_count = gpu_dist['value'].sum()
            gpu_dist_text = '、'.join([
                f"{row['name']} 占 {round(row['value'] / total_count * 100, 1)}%"
                for _, row in gpu_dist.iterrows()
            ]) if total_count > 0 else "暂无数据"

            # GPU 型号分布
            gpu_models = pd.read_sql("SELECT name, value FROM v_gpu_models", conn)
            total_model = gpu_models['value'].sum()
            gpu_model_text = '、'.join([
                f"{row['name']} 占 {round(row['value'] / total_model * 100, 1)}%"
                for _, row in gpu_models.iterrows()
            ]) if total_model > 0 else "暂无数据"

            # 等待时长分布
            wait_dist = pd.read_sql("SELECT name, value FROM v_wait_buckets", conn)
            total_wait = wait_dist['value'].sum()
            wait_text = '、'.join([
                f"{row['name']} 占 {round(row['value'] / total_wait * 100, 1)}%"
                for _, row in wait_dist.iterrows()
            ]) if total_wait > 0 else "暂无数据"

            # 最近仿真结果
            sim_row = pd.read_sql(
                "SELECT * FROM simulation_history ORDER BY id DESC LIMIT 1", conn
            )
            sim_text = "暂无仿真数据"
            if not sim_row.empty:
                r = sim_row.iloc[0]
                sim_results = json.loads(r['results'])
                algo_lines = '\n'.join([
                    f"  - {s['algo']}: JCT={s['jct']:.0f}s, 等待={s['wait']:.0f}s, Makespan={s.get('makespan', 0):.0f}s"
                    for s in sim_results
                ])
                # 计算相对 FIFO 的改善幅度
                fifo = next((s for s in sim_results if s['algo'] == 'FIFO'), None)
                improve_text = ""
                if fifo:
                    best = min([s for s in sim_results if s['algo'] != 'FIFO'], key=lambda x: x['wait'], default=None)
                    if best:
                        improve_pct = (fifo['wait'] - best['wait']) / fifo['wait'] * 100
                        improve_text = f"\n  最优算法 {best['algo']} 相比 FIFO 排队等待改善 {improve_pct:.1f}%"
                sim_text = (
                    f"仿真时间: {r['created_at']}，作业数: {r['num_jobs']}，"
                    f"到达率: {r['arrival_rate']} jobs/min，GPU总数: {r['num_gpus']}\n"
                    f"{algo_lines}{improve_text}"
                )

            return (
                f"【当前集群状态】\n"
                f"- 总GPU数: {int(kpi['total_gpu'] or 0)} 块\n"
                f"- 历史活跃作业数: {int(kpi['active_jobs'] or 0)} 个\n"
                f"- 平均排队等待: {round(float(kpi['avg_wait_min'] or 0), 1)} 分钟\n"
                f"- 平均GPU超配率: {round(float(kpi['avg_overprov'] or 0), 1)}%\n"
                f"- GPU利用率分布: {gpu_dist_text}\n"
                f"- GPU型号分布: {gpu_model_text}\n"
                f"- 任务等待时长分布: {wait_text}\n\n"
                f"【最近一次仿真结果】\n{sim_text}"
            )
        except Exception as e:
            return f"集群数据获取失败: {str(e)}"
        finally:
            conn.close()

    def get_cluster_snapshot_for_ui(self):
        """返回结构化数据，供前端左侧面板展示"""
        conn = sqlite3.connect(self.db_path)
        try:
            kpi = pd.read_sql("""
                SELECT
                    (SELECT total_gpu FROM v_real_gpu) as total_gpu,
                    (SELECT COUNT(DISTINCT job_name) FROM analysis_wide_table WHERE status = 'Running') as active_jobs,
                    AVG(wait_time) / 60.0 as avg_wait_min,
                    AVG(gpu_over_provisioning) * 100 as avg_overprov
                FROM analysis_wide_table
            """, conn).iloc[0]

            # GPU 利用率分布（用于计算低利用率占比）
            gpu_dist = pd.read_sql(
                "SELECT bucket as name, count as value FROM v_gpu_dist ORDER BY bucket", conn
            )
            total_count = gpu_dist['value'].sum()
            gpu_dist_list = [
                {"name": row['name'], "pct": round(row['value'] / total_count * 100, 1)}
                for _, row in gpu_dist.iterrows()
            ] if total_count > 0 else []
            # 0-20% 低利用率占比
            low_util_pct = gpu_dist_list[0]['pct'] if gpu_dist_list else 0

            # 长等待任务占比（>1小时）
            wait_dist = pd.read_sql("SELECT name, value FROM v_wait_buckets", conn)
            total_wait = wait_dist['value'].sum()
            long_wait_row = wait_dist[wait_dist['name'].str.contains('hour|1 h', case=False, na=False)]
            long_wait_pct = round(
                long_wait_row['value'].sum() / total_wait * 100, 1
            ) if total_wait > 0 else 0

            # 最近仿真结果
            sim_row = pd.read_sql(
                "SELECT * FROM simulation_history ORDER BY id DESC LIMIT 1", conn
            )
            sim_summary = None
            if not sim_row.empty:
                r = sim_row.iloc[0]
                sim_results = json.loads(r['results'])
                fifo = next((s for s in sim_results if s['algo'] == 'FIFO'), None)
                best = None
                improve_pct = None
                if fifo:
                    others = [s for s in sim_results if s['algo'] != 'FIFO']
                    if others:
                        best = min(others, key=lambda x: x['wait'])
                        improve_pct = round((fifo['wait'] - best['wait']) / fifo['wait'] * 100, 1)
                sim_summary = {
                    "created_at": r['created_at'],
                    "num_jobs": int(r['num_jobs']),
                    "arrival_rate": int(r['arrival_rate']),
                    "num_gpus": int(r['num_gpus']),
                    "mode": r['mode'],
                    "results": sim_results,
                    "best_algo": best['algo'] if best else None,
                    "improve_pct": improve_pct
                }

            return {
                "kpi": {
                    "total_gpu": int(kpi['total_gpu'] or 0),
                    "active_jobs": int(kpi['active_jobs'] or 0),
                    "avg_wait_min": round(float(kpi['avg_wait_min'] or 0), 1),
                    "avg_overprov": round(float(kpi['avg_overprov'] or 0), 1),
                    "low_util_pct": low_util_pct,
                    "long_wait_pct": long_wait_pct,
                },
                "sim_summary": sim_summary
            }
        except Exception as e:
            return {"error": str(e)}
        finally:
            conn.close()

    def chat(self, messages: list):
        """
        多轮对话接口
        messages: [{"role": "user"/"assistant", "content": "..."}]
        返回 AI 的回复文本
        """
        try:
            snapshot = self._get_cluster_snapshot_text()
            system_prompt = (
                "你是一位高性能计算和GPU集群调度领域的专家，正在帮助用户分析阿里巴巴PAI平台的GPU集群运行状况。"
                "请基于提供的集群数据给出专业、简明、有针对性的分析和建议。"
                "回答时不要使用markdown语法，用简洁的分段或分点表达，400字以内。\n\n"
                + ALGO_KNOWLEDGE + "\n\n"
                + snapshot + "\n\n"
                "请基于以上数据回答用户的问题。如果用户问的问题超出上述数据范围，请明确说明当前数据不足以回答，并建议用户运行仿真或查看具体指标。"

            )
            full_messages = [{"role": "system", "content": system_prompt}] + messages
            completion = self.client.chat.completions.create(
                model="qwen3.5-27b",
                messages=full_messages,
                temperature=0.7,
                max_tokens=1000
            )
            return completion.choices[0].message.content
        except Exception as e:
            return f"AI 调用失败: {str(e)}"

    # 保留旧接口兼容性（server.py 其他地方可能调用）
    def get_ai_intelligence_context(self, last_sim_results=None):
        return self._get_cluster_snapshot_text()

    def ask_qwen_expert(self, context):
        return self.chat([{"role": "user", "content": "请对以上集群状态进行综合分析。"}])