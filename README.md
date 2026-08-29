# Development of AI Powered Health Monitoring & Risk Analysis Platform

A FastAPI + Streamlit starter framework for the Development of AI Powered Health Monitoring & Risk Analysis Platform.

## Architecture

Streamlit UI
    ↓
FastAPI Backend
    ↓
Uploaded Project Artifacts
    ↓
Future: Document Processing → Chunking → Embeddings → Vector Database → RAG
    ↓
Future: Multi-Agent Project Intelligence
    ↓
Risks / Blockers / Scope / Schedule / Project Health / Chat Assistant

## Supported files

- PDF
- DOC
- DOCX
- TXT
- CSV

## Run

Create and activate a virtual environment, then:

```bash
pip install -r requirements.txt
```

Start FastAPI from the project root:

```bash
uvicorn backend.main:app --reload
```

In another terminal:

```bash
streamlit run frontend/app.py
```

Open the Streamlit URL shown in the terminal.

FastAPI docs are available at:

```text
http://127.0.0.1:8000/docs
```

## Current functionality

- Project title heading
- Streamlit file upload interface
- Multiple-file upload
- Uploaded files displayed in the UI
- File type and size shown
- FastAPI upload endpoint
- Files saved in the backend `uploads/` folder
- Basic file validation

## Next project layers

1. Extract text from PDF/DOCX/TXT/CSV
2. Clean and normalize documents
3. Chunk documents
4. Generate embeddings
5. Store embeddings in a vector database
6. Build RAG retrieval
7. Add agents for scope, risks, blockers, schedule forecasting, documentation generation, and project health
8. Add conversational project assistant
