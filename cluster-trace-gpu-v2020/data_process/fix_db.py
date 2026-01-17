# 添加一个索引
import sqlite3
conn = sqlite3.connect('pai_data.db')
conn.execute("CREATE INDEX IF NOT EXISTS idx_wait_time ON analysis_wide_table(wait_time);")
conn.close()
print("索引添加成功")