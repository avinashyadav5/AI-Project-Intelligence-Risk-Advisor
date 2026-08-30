FROM python:3.11-slim

WORKDIR /app

# Install system dependencies (needed for FAISS/C++)
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download the fastembed model during Docker build so it doesn't block Uvicorn startup
# On ephemeral free tiers, downloading this at runtime causes 502 Bad Gateway timeouts.
RUN python -c "from fastembed import TextEmbedding; TextEmbedding(model_name='sentence-transformers/all-MiniLM-L6-v2', threads=1)"

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
