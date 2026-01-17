# 基础环境
import sys, pandas, numpy, matplotlib, seaborn,sqlalchemy,openai
print("Python =", sys.version.split()[0])
print("pandas =", pandas.__version__)
print("numpy =", numpy.__version__)
print("matplotlib =", matplotlib.__version__)
print("seaborn =", seaborn.__version__)
print("sqlalchemy =", sqlalchemy.__version__)
print("openai =", openai.__version__)
# print("scikit-learn:", sklearn.__version__)

# Web 框架（如已装）
try:
    import fastapi, uvicorn, requests
    print("FastAPI     :", fastapi.__version__)
    print("uvicorn     :", uvicorn.__version__)
    print("requests    :", requests.__version__)
except ImportError as e:
    print("Web 库缺失  :", e)

# 阿里大模型 SDK（如已装）
try:
    import dashscope
    print("dashscope   :", dashscope.__version__)
except ImportError:
    print("dashscope   : 未安装")