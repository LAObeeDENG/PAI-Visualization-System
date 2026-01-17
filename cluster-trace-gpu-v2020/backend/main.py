from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import sqlite3
import pandas as pd

app = FastAPI()

# 允许前端跨域访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = "../data_process/pai_data.db"

@app.get("/api/dashboard/stats")
def get_stats():
    conn = sqlite3.connect(DB_PATH)
    # 1. 获取基础统计
    df = pd.read_sql("SELECT AVG(wait_time) as avg_wait, AVG(gpu_over_provisioning) as avg_over FROM analysis_wide_table", conn)
    # 2. 获取 CDF 数据点 (简单示例：取 10 个分位数)
    cdf_df = pd.read_sql("SELECT wait_time FROM analysis_wide_table ORDER BY wait_time", conn)
    # ... 计算 CDF 逻辑 ...
    conn.close()
    return {
        "total_gpu": 6500,
        "avg_wait": df['avg_wait'][0],
        "avg_over_provisioning": df['avg_over'][0]
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)