# backend/llm_analyser.py
import sqlite3
import pandas as pd
from openai import OpenAI

class LLMAnalyser:
    def __init__(self, db_path, api_key):
        self.db_path = db_path
        # 初始化通义千问客户端（兼容 OpenAI 格式）
        self.client = OpenAI(
            api_key="api接口（需要替换）",
            base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        )

    def get_ai_intelligence_context(self, last_sim_results=None):
        """数据聚合：将数据库指标和仿真结果转化为情报简报"""
        conn = sqlite3.connect(self.db_path)
        try:
            # 1. 聚合核心 KPI
            kpi_query = """
                SELECT 
                    AVG(wait_time) / 60.0 as avg_wait_min,
                    AVG(gpu_over_provisioning) * 100 as avg_overprov
                FROM analysis_wide_table
            """
            kpi_df = pd.read_sql(kpi_query, conn)
            avg_wait = kpi_df.iloc[0]['avg_wait_min'] or 0
            avg_over = kpi_df.iloc[0]['avg_overprov'] or 0

            # 2. 提取异常作业线索 (Straggler 逻辑)
            straggler_query = """
                SELECT job_name, 
                       (MAX(inst_end - inst_start) - MIN(inst_end - inst_start)) / 
                       NULLIF(AVG(inst_end - inst_start), 0.001) as cov
                FROM analysis_wide_table
                GROUP BY job_name
                HAVING cov > 0.5
                ORDER BY cov DESC LIMIT 2
            """
            stragglers = pd.read_sql(straggler_query, conn).to_dict(orient='records')
            strag_text = ", ".join([f"{s['job_name']}(CoV:{s['cov']:.2f})" for s in stragglers]) if stragglers else "无明显异常"

            # 3. 提取仿真结论
            sim_summary = "暂无仿真对比数据"
            if last_sim_results:
                best = min(last_sim_results, key=lambda x: x['wait'])
                worst = max(last_sim_results, key=lambda x: x['wait'])
                improvement = ((worst['wait'] - best['wait']) / (worst['wait'] + 0.1)) * 100
                sim_summary = f"仿真显示 {best['algo']} 表现最优，相较于 FIFO 降低排队延迟 {improvement:.1f}%"

            return (f"### 集群运行情报 ###\n"
                    f"- 负载状态：平均排队 {avg_wait:.1f}min，GPU 超配率 {avg_over:.1f}%\n"
                    f"- 异常线索：{strag_text}\n"
                    f"- 仿真结论：{sim_summary}\n")
        finally:
            conn.close()

    def ask_qwen_expert(self, context):
        """发送给通义千问进行专家分析"""
        try:
            completion = self.client.chat.completions.create(
                model="qwen-plus", # 建议使用 qwen-plus 或 qwen-max
                messages=[
                    {"role": "system", "content": "你是一位高性能计算和智算集群调度专家。请根据提供的集群情报给出简明扼要的诊断建议。"},
                    {"role": "user", "content": f"以下是当前集群的运行数据，请进行简要分析并给出优化方向：\n{context}"
                                                f"要求：不使用markdown语法，简要分段或分点，400字以内"}
                ],
                temperature=0.7,
                max_tokens=800
            )
            print('[QWEN_REQ]', context)
            raw = completion.choices[0].message.content
            print('[QWEN_RAW]', raw)
            # ============================
            return raw
        except Exception as e:
            return f"AI 诊断调用失败: {str(e)}"


import sqlite3
import pandas as pd


def get_ai_intelligence_context(db_path, last_sim_results=None):
    """
    数据聚合函数：将多维监控指标转化为 AI 可读的结构化上下文
    :param db_path: SQLite 数据库路径
    :param last_sim_results: 内存中存储的最近一次仿真结果列表
    :return: 结构化字符串 (Context)
    """
    conn = sqlite3.connect(db_path)

    try:
        # 1. 聚合核心 KPI (反映集群当前总体压力)
        # 从分析宽表中提取平均排队时长和 GPU 平均超配率
        kpi_query = """
            SELECT 
                AVG(wait_time) / 60.0 as avg_wait_min,
                AVG(gpu_over_provisioning) * 100 as avg_overprov
            FROM analysis_wide_table
        """
        kpi_df = pd.read_sql(kpi_query, conn)
        avg_wait = kpi_df.iloc[0]['avg_wait_min'] or 0
        avg_over = kpi_df.iloc[0]['avg_overprov'] or 0

        # 2. 提取异常作业线索 (Straggler 粗筛)
        # 寻找运行时间波动最大（离散系数 CoV 较高）的前 2 个作业
        straggler_query = """
            SELECT job_name, 
                   (MAX(inst_end - inst_start) - MIN(inst_end - inst_start)) / 
                   NULLIF(AVG(inst_end - inst_start), 0) as cov
            FROM analysis_wide_table
            GROUP BY job_name
            HAVING cov > 0.5
            ORDER BY cov DESC
            LIMIT 2
        """
        stragglers = pd.read_sql(straggler_query, conn).to_dict(orient='records')
        strag_text = ", ".join([f"{s['job_name']}(CoV:{s['cov']:.2f})" for s in stragglers]) if stragglers else "无明显异常"

        # 3. 提取仿真结论 (算法对比)
        sim_summary = "暂无仿真对比数据"
        if last_sim_results and len(last_sim_results) > 0:
            # 找到等待时间最短(Optimal)和最长(FIFO)的算法
            best = min(last_sim_results, key=lambda x: x['wait'])
            worst = max(last_sim_results, key=lambda x: x['wait'])
            improvement = ((worst['wait'] - best['wait']) / worst['wait']) * 100
            sim_summary = f"仿真显示 {best['algo']} 表现最优，相较于 FIFO 降低延迟 {improvement:.1f}%"

        # 4. 组装情报快照
        context = (
            f"### 集群运行情报 ###\n"
            f"- 负载状态：平均排队 {avg_wait:.1f}min，GPU 超配率 {avg_over:.1f}%\n"
            f"- 异常线索：{strag_text}\n"
            f"- 仿真结论：{sim_summary}\n"
        )
        return context

    except Exception as e:
        return f"数据聚合失败: {str(e)}"
    finally:
        conn.close()