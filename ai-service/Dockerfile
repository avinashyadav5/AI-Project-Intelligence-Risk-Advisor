FROM python:3.11-slim

WORKDIR /app

# Install system dependencies (needed for PyMuPDF)
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Pre-create writable directories
RUN mkdir -p knowledge_base uploads

# Render binds to port 10000 by default
EXPOSE 10000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "10000"]
