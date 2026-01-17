import pandas as pd
from sqlalchemy import create_engine
import sys
import os

# --- 核心路径处理 ---
# 获取当前脚本所在目录 (data_process)
current_dir = os.path.dirname(os.path.abspath(__file__))
# 获取项目根目录 (your_project)
project_root = os.path.join(current_dir, '..')

# 1. 动态添加作者工具包的搜索路径，不改变其原始代码
sys.path.append(os.path.join(project_root, 'analysis'))
from utils import get_df

# 2. 定义数据库路径（就在当前 data_possess 目录下）
db_path = os.path.join(current_dir, 'pai_data.db')
engine = create_engine(f'sqlite:///{db_path}')


def start_ingestion():
    # 待处理的表列表
    # 格式：(CSV文件名, 数据库表名, 是否需要采样)
    tables_to_import = [
        ('pai_job_table', 'jobs', False),
        ('pai_task_table', 'tasks', False),
        ('pai_instance_table', 'instances', False),
        ('pai_group_tag_table', 'group_tags', False),
        ('pai_sensor_table', 'sensors', True),  # Sensor表太大，必须采样
        ('pai_machine_spec', 'machine_spec', False),
    ]

    for file_base, table_name, should_sample in tables_to_import:
        # 准确定位根目录下的 data 文件夹
        file_path = os.path.join(project_root, 'data', f'{file_base}.csv')

        print(f"--- 正在处理: {file_base} ---")

        if not os.path.exists(file_path):
            print(f"错误：找不到文件 {file_path}")
            continue

        # 使用 get_df 读取（它会自动在 data 目录下寻找对应的 .header）
        df = get_df(file_path)

        if should_sample:
            print(f"正在进行 1% 采样...")
            df = df.sample(frac=0.01, random_state=42)

        # 写入数据库
        df.to_sql(table_name, con=engine, index=False, if_exists='replace')
        print(f"成功导入表: {table_name}, 行数: {len(df)}")


if __name__ == "__main__":
    start_ingestion()