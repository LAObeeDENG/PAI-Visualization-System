import pandas as pd
from sqlalchemy import create_engine
import os

current_dir = os.path.dirname(os.path.abspath(__file__))
db_path = os.path.join(current_dir, 'pai_data.db')
engine = create_engine(f'sqlite:///{db_path}')


def create_wide_table():
    print("正在执行三级关联查询...")

    # 核心 SQL 修正说明：
    # 1. 任务类型列 -> t.gpu_type
    # 2. 实例名称列 -> i.inst_name
    # 3. 作业提交时间 -> j.start_time
    # 4. 排队延迟 = 实例开始时间(i.start_time) - 作业提交时间(j.start_time)

    sql_query = """
    SELECT 
        j.job_name,
        j.user,
        t.task_name,
        t.gpu_type,
        t.plan_cpu,
        t.plan_gpu,
        t.plan_mem,
        i.inst_name,
        i.worker_name,
        i.status,
        i.start_time as inst_start,
        i.end_time as inst_end,
        j.start_time as job_arrive,
        (i.start_time - j.start_time) as wait_time
    FROM jobs j
    LEFT JOIN tasks t ON j.job_name = t.job_name
    LEFT JOIN instances i ON t.job_name = i.job_name AND t.task_name = i.task_name
    WHERE i.start_time IS NOT NULL 
      AND j.start_time IS NOT NULL;
    """

    try:
        df_wide = pd.read_sql(sql_query, con=engine)

        # 数据清洗：修正负数 wait_time（由于系统时钟漂移可能产生极小负值）
        df_wide['wait_time'] = df_wide['wait_time'].apply(lambda x: max(x, 0) if pd.notnull(x) else 0)

        # 存入宽表
        df_wide.to_sql('analysis_wide_table', con=engine, index=False, if_exists='replace')
        print(f"三级关联成功！宽表行数: {len(df_wide)}")

    except Exception as e:
        print(f"运行失败，错误详情: {e}")


def calculate_resource_util():
    print("正在关联传感器数据并计算超配指标...")

    # 1. 从 sensors 采样数据中计算每个 worker 的平均 GPU 利用率
    # 假设列名为 gpu_wrk_util（这是 PAI 默认名，如果不对请查一下 sensors 表）
    sql_sensors = "SELECT worker_name, AVG(gpu_wrk_util) as avg_gpu_util FROM sensors GROUP BY worker_name"
    df_sensors = pd.read_sql(sql_sensors, con=engine)

    # 2. 读取刚才生成的宽表
    df_wide = pd.read_sql("SELECT * FROM analysis_wide_table", engine)

    # 3. 合并并计算
    df_final = pd.merge(df_wide, df_sensors, on='worker_name', how='left')

    # 超配率 = (申请量 - 实际使用量) / 申请量
    # 注意：avg_gpu_util 通常是 0-100 的百分数，转换一下
    df_final['gpu_over_provisioning'] = (df_final['plan_gpu'] - (df_final['avg_gpu_util'] / 100.0)) / df_final[
        'plan_gpu']

    # 4. 写回数据库
    df_final.to_sql('analysis_wide_table', con=engine, index=False, if_exists='replace')
    print("全量分析宽表已就绪！包含：基本信息、排队时长、GPU 利用率、超配指标。")


def create_dashboard_views():
    print("正在生成大屏聚合视图...")

    # 1. GPU 利用率分布区间统计 (0-20, 20-40...)
    sql_dist = """
    SELECT 
        CASE 
            WHEN gpu_wrk_util < 20 THEN '0-20%'
            WHEN gpu_wrk_util < 40 THEN '20-40%'
            WHEN gpu_wrk_util < 60 THEN '40-60%'
            WHEN gpu_wrk_util < 80 THEN '60-80%'
            ELSE '80-100%'
        END as bucket,
        COUNT(*) as count
    FROM sensors
    GROUP BY bucket
    """
    pd.read_sql(sql_dist, engine).to_sql('v_gpu_dist', con=engine, if_exists='replace', index=False)

    # 2. 机器/GPU 型号占比统计
    sql_models = """
    SELECT gpu_type as name, COUNT(*) as value 
    FROM tasks 
    WHERE gpu_type IS NOT NULL 
    GROUP BY gpu_type
    """
    pd.read_sql(sql_models, engine).to_sql('v_gpu_models', con=engine, if_exists='replace', index=False)

    # 3. 等待时长区间分布
    sql_wait = """
    SELECT 
        CASE 
            WHEN wait_time < 60 THEN '< 1 min'
            WHEN wait_time < 600 THEN '1-10 min'
            WHEN wait_time < 3600 THEN '10-60 min'
            ELSE '> 1 hour'
        END as name,
        COUNT(*) as value
    FROM analysis_wide_table
    GROUP BY name
    """
    pd.read_sql(sql_wait, engine).to_sql('v_wait_buckets', con=engine, if_exists='replace', index=False)
    # === 物理卡数 & 申请总量 ===
    # 1. 集群真实卡数
    sql_real = "SELECT SUM(cap_gpu) AS total_gpu FROM machine_spec"
    pd.read_sql(sql_real, engine).to_sql('v_real_gpu', con=engine, if_exists='replace', index=False)

    # 2. 任务申请总量（百分比总和，可留可删）
    sql_req = "SELECT SUM(plan_gpu) AS total_gpu_req FROM tasks"
    pd.read_sql(sql_req, engine).to_sql('v_req_gpu', con=engine, if_exists='replace', index=False)

    # ===== 按周内小时统计 task 提交数 =====
    sql_hourly = """
    SELECT 
        hour_of_week,
        ROUND(task_count * 1.0 / num_weeks) AS task_count
    FROM (
        SELECT 
            (CAST(strftime('%w', datetime(job_arrive, 'unixepoch', '+8 hours')) AS INTEGER) * 24 +
             CAST(strftime('%H', datetime(job_arrive, 'unixepoch', '+8 hours')) AS INTEGER)) AS hour_of_week,
            COUNT(DISTINCT job_name) AS task_count
        FROM analysis_wide_table
        WHERE job_arrive IS NOT NULL
        GROUP BY hour_of_week
    ) t
    CROSS JOIN (
        SELECT COUNT(DISTINCT 
            strftime('%Y-%W', datetime(job_arrive, 'unixepoch', '+8 hours'))
        ) AS num_weeks
        FROM analysis_wide_table
        WHERE job_arrive IS NOT NULL
    ) w
    ORDER BY hour_of_week
    """
    pd.read_sql(sql_hourly, engine).to_sql(
        'v_hourly_tasks', con=engine, if_exists='replace', index=False
    )
    print("v_hourly_tasks 视图已生成")

    # ===== 新增：实例运行时长（用于CDF）=====
    sql_runtime = """
        SELECT (inst_end - inst_start) AS runtime
        FROM analysis_wide_table
        WHERE inst_end IS NOT NULL
          AND inst_start IS NOT NULL
          AND (inst_end - inst_start) > 0
        """
    pd.read_sql(sql_runtime, engine).to_sql(
        'v_instance_runtime', con=engine, if_exists='replace', index=False
    )

    # ===== 新增：GPU申请量 vs 实际使用量（用于CDF）=====
    sql_gpu = """
        SELECT plan_gpu, avg_gpu_util
        FROM analysis_wide_table
        WHERE plan_gpu IS NOT NULL
          AND avg_gpu_util IS NOT NULL
          AND plan_gpu > 0
        """
    pd.read_sql(sql_gpu, engine).to_sql(
        'v_gpu_cdf_data', con=engine, if_exists='replace', index=False
    )
    print("CDF 相关视图已生成")
if __name__ == "__main__":
    # create_wide_table()
    #calculate_resource_util()
    create_dashboard_views()
    # 运行这个看看前 5 行，确认指标是否看起来正常
print(pd.read_sql("SELECT job_name, wait_time, gpu_over_provisioning FROM analysis_wide_table LIMIT 5", engine))