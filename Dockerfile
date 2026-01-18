# 使用轻量级 Python 基础镜像
FROM python:3.11-slim

# 设置工作目录
WORKDIR /app

# 设置环境变量
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1
ENV FLASK_APP app.py
ENV FLASK_RUN_HOST 0.0.0.0

# 安装系统依赖（如需要）
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# 安装 Python 依赖
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制项目代码
COPY . .

# 暴露端口（与 app.run 中的端口保持一致，或者使用环境变量）
EXPOSE 5000

# 使用 gunicorn 作为生产服务器运行
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "app:app"]
