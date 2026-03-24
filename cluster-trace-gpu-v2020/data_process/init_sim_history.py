# data_process/init_sim_history.py
#创建仿真器历史记录用
from sqlalchemy import create_engine, text
import os

current_dir = os.path.dirname(os.path.abspath(__file__))
#数据库放在上一级或指定的 data 目录下，避免路径混乱
db_path = os.path.join(current_dir, 'pai_data.db')
engine = create_engine(f'sqlite:///{db_path}')

# 使用 begin() 自动处理事务提交
with engine.begin() as conn:
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS simulation_history (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at   TEXT    NOT NULL,
            num_jobs     INTEGER NOT NULL,
            arrival_rate INTEGER NOT NULL,
            num_gpus     INTEGER NOT NULL,
            mode         TEXT    NOT NULL,
            algorithms   TEXT    NOT NULL,
            results      TEXT    NOT NULL
        )
    """))
    # 不需要 conn.commit()，退出 with 块时会自动提交

print("simulation_history 表创建成功")