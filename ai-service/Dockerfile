FROM python:3.11-slim

# Install system dependencies (needed for FAISS/C++)
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Hugging Face Spaces requires running as a non-root user
RUN useradd -m -u 1000 user
USER user

# Set home and PATH for the non-root user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

WORKDIR $HOME/app

# Copy requirements first to leverage Docker cache
COPY --chown=user:user requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application
COPY --chown=user:user . .

# Pre-create writable directories required by the AI service
RUN mkdir -p knowledge_base uploads

# Hugging Face Spaces routes traffic to port 7860 by default
EXPOSE 7860

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
