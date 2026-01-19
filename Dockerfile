# --- 阶段 1: 构建阶段 ---
FROM python:3.11-slim as builder

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

# 安装构建工具（如果某些 pip 包需要编译）
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# 创建虚拟环境并安装依赖，减少最终镜像体积
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# --- 阶段 2: 运行阶段 ---
FROM python:3.11-slim

WORKDIR /app

# 从构建阶段复制安装好的依赖库
COPY --from=builder /opt/venv /opt/venv

# 将虚拟环境路径加入 PATH
ENV PATH="/opt/venv/bin:$PATH"
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1
ENV LANG C.UTF-8
ENV LC_ALL C.UTF-8
ENV FLASK_APP app.py

# 仅复制运行应用所需的代码（.dockerignore 会过滤掉 imgs 和 git 等大文件夹）
COPY . .

EXPOSE 5000

# 使用 gunicorn 运行，增加超时时间以支持 AI 处理
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--timeout", "300", "app:app"]
