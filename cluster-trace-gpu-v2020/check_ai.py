from openai import OpenAI
client = OpenAI(
    api_key="",
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1"
)
print(client.chat.completions.create(
    model="qwen-plus",
    messages=[{"role": "user", "content": "hi"}]
).choices[0].message.content)