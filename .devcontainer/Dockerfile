FROM mcr.microsoft.com/devcontainers/typescript-node:22-bookworm

# 安裝 Python 3、pip 及測試與 PDF 處理所需系統套件
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    curl \
    git \
    procps \
    && rm -rf /var/lib/apt/lists/*

# 避開 Debian 12 (bookworm) PEP 668 externally-managed-environment 限制
ENV PIP_BREAK_SYSTEM_PACKAGES=1

# 預設工作目錄
WORKDIR /workspace
