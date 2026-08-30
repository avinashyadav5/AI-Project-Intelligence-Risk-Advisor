"""
AI Project Intelligence & Risk Advisor — FastAPI AI Service v3.1.0
==================================================================
Teams upload their existing project artifacts (proposals, SRS documents,
meeting notes, progress updates, task-list CSVs). This service builds a unified
per-project knowledge base with RAG and runs a multi-agent pipeline over it.

Architecture decisions:
  - Text extraction runs locally (PyMuPDF / python-docx) — fast, free, private
  - Task-list CSVs are parsed into structured rows (csv_tasks.py), not prose
  - Schedule forecasting is deterministic date maths (schedule.py); the LLM only
    adds qualitative delay factors on top
  - Multi-agent pipeline (Risk, Scope, Health, Traceability, Meeting, Stories)
    via Groq, with a real keyword fallback (keyword_engine.py) when Groq is down
  - Scoring is deterministic (scoring.py) so the same analysis is reproducible
  - /analyze scores a single document; /analyze-project runs the same pipeline
    across the unified project knowledge base
"""

import os, re, io, uuid, time, json, shutil
from pathlib import Path
from typing import Optional, List

import scoring
import csv_tasks
import schedule as schedule_engine
import keyword_engine

from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL   = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

# ── Optional heavy deps (graceful degradation) ────────────────────────────────
try:
    import fitz
    HAS_PYMUPDF = True
except ImportError:
    HAS_PYMUPDF = False

try:
    from docx import Document as DocxDocument
    HAS_DOCX = True
except ImportError:
    HAS_DOCX = False

import numpy as np
try:
    import faiss
    from fastembed import TextEmbedding
    HAS_RAG = True
except ImportError:
    HAS_RAG = False

import httpx
HAS_GROQ = bool(GROQ_API_KEY)


# ── App bootstrap ─────────────────────────────────────────────────────────────
app = FastAPI(
    title="AI Project Intelligence & Risk Advisor — AI Service",
    version="3.1.0",
)

KB_DIR = Path("knowledge_base")
KB_DIR.mkdir(exist_ok=True)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)
ALLOWED_EXTENSIONS = {".pdf", ".doc", ".docx", ".txt", ".csv"}

# ── Global RAG Model Loading ──────────────────────────────────────────────────
embed_model = None
if HAS_RAG:
    try:
        print("Loading local embedding model (all-MiniLM-L6-v2) via fastembed...")
        embed_model = TextEmbedding(model_name="sentence-transformers/all-MiniLM-L6-v2")
        print("Embedding model loaded successfully.")
    except Exception as e:
        print(f"Failed to load embedding model: {e}")
        HAS_RAG = False


def chunk_text(text: str, chunk_size: int = 300, overlap: int = 50) -> list:
    """Split text into chunks of `chunk_size` words with `overlap` words."""
    if not text:
        return []
    words = text.split()
    chunks = []
    i = 0
    step = max(1, chunk_size - overlap)
    while i < len(words):
        chunks.append(" ".join(words[i:i + chunk_size]))
        i += step
    return chunks


_retrieve_cache = {}

def retrieve_context(text: str, k: int = 8) -> tuple:
    """
    Chunk, embed and retrieve the top-K most risk-relevant passages.
    
    Memoized to avoid re-embedding the entire document 5 times for the 5 agents
    since the risk query is currently identical for all of them.
    """
    if not HAS_RAG or not embed_model:
        return text[:12000], 0.0

    if len(text) < 12000:
        return text, 0.0

    cache_key = hash(text)
    if cache_key in _retrieve_cache:
        cached_chunks, cached_index = _retrieve_cache[cache_key]
        chunks = cached_chunks
        index = cached_index
    else:
        chunks = chunk_text(text, chunk_size=300, overlap=50)
        if not chunks:
            return text[:12000], 0.0

        embeddings = np.array(list(embed_model.embed(chunks))).astype('float32')
        index = faiss.IndexFlatL2(embeddings.shape[1])
        index.add(embeddings)
        
        # Keep cache small (prevent memory leaks over time)
        if len(_retrieve_cache) > 10:
            _retrieve_cache.clear()
        _retrieve_cache[cache_key] = (chunks, index)

    query = ("Identify financial risks, operational delays, technical vulnerabilities, "
             "legal liabilities, compliance issues, and critical roadblocks.")
    query_embedding = np.array(list(embed_model.embed([query]))).astype('float32')

    actual_k = min(k, len(chunks))
    distances, indices = index.search(query_embedding, actual_k)

    retrieved_indices = sorted([i for i in indices[0] if i < len(chunks)])
    retrieved_chunks = [chunks[i] for i in retrieved_indices]

    avg_distance = float(np.mean(distances[0][:actual_k])) if actual_k > 0 else 0.0

    return "\n\n...[Context Gap]...\n\n".join(retrieved_chunks), avg_distance


# ── Knowledge Base ────────────────────────────────────────────────────────────
# Chunk metadata is a list aligned 1:1 with FAISS index positions. Each entry
# records which document it came from, so chat answers can cite a real filename
# instead of a placeholder.

def _kb_paths(project_id: str):
    project_kb_dir = KB_DIR / project_id
    return project_kb_dir, project_kb_dir / "index.faiss", project_kb_dir / "chunks.json"


def _load_chunks(chunks_path: Path) -> list:
    if not chunks_path.exists():
        return []
    try:
        with open(chunks_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return []


def _rebuild_index(project_id: str, chunks_meta: list):
    """Re-encode all remaining chunks and overwrite the index. Used after a delete."""
    project_kb_dir, index_path, chunks_path = _kb_paths(project_id)
    project_kb_dir.mkdir(parents=True, exist_ok=True)

    if not chunks_meta:
        if index_path.exists():
            index_path.unlink()
        with open(chunks_path, 'w', encoding='utf-8') as f:
            json.dump([], f)
        return

    embeddings = np.array(list(embed_model.embed([c["text"] for c in chunks_meta]))).astype('float32')
    index = faiss.IndexFlatL2(embeddings.shape[1])
    index.add(embeddings)
    faiss.write_index(index, str(index_path))
    with open(chunks_path, 'w', encoding='utf-8') as f:
        json.dump(chunks_meta, f)


def add_to_knowledge_base(project_id: str, text: str, doc_id: str, doc_name: str = ""):
    """
    Add a document's chunks to the project knowledge base.

    Re-uploading the same document replaces its chunks rather than duplicating
    them, so the KB never accumulates stale copies of a revised file.
    """
    if not HAS_RAG or not embed_model or not project_id or not text:
        return

    project_kb_dir, index_path, chunks_path = _kb_paths(project_id)
    project_kb_dir.mkdir(parents=True, exist_ok=True)

    chunks = chunk_text(text, chunk_size=300, overlap=50)
    if not chunks:
        return

    existing_chunks = _load_chunks(chunks_path)
    had_this_doc = any(c.get("doc_id") == doc_id for c in existing_chunks)

    new_meta = [{"doc_id": doc_id, "doc_name": doc_name or doc_id, "text": c} for c in chunks]

    if had_this_doc:
        # Replace: drop the old chunks for this document, then rebuild.
        kept = [c for c in existing_chunks if c.get("doc_id") != doc_id]
        _rebuild_index(project_id, kept + new_meta)
        return

    embeddings = np.array(list(embed_model.embed(chunks))).astype('float32')

    if index_path.exists():
        index = faiss.read_index(str(index_path))
    else:
        index = faiss.IndexFlatL2(embeddings.shape[1])

    index.add(embeddings)
    faiss.write_index(index, str(index_path))

    with open(chunks_path, 'w', encoding='utf-8') as f:
        json.dump(existing_chunks + new_meta, f)


def delete_document_from_kb(project_id: str, doc_id: str) -> int:
    """Remove one document's chunks from the KB. Returns how many were removed."""
    if not HAS_RAG or not embed_model:
        return 0
    _, _, chunks_path = _kb_paths(project_id)
    existing = _load_chunks(chunks_path)
    if not existing:
        return 0
    kept = [c for c in existing if c.get("doc_id") != doc_id]
    removed = len(existing) - len(kept)
    if removed:
        _rebuild_index(project_id, kept)
    return removed


def delete_project_kb(project_id: str) -> bool:
    """Remove the whole knowledge base for a project."""
    project_kb_dir, _, _ = _kb_paths(project_id)
    if project_kb_dir.exists():
        shutil.rmtree(project_kb_dir, ignore_errors=True)
        return True
    return False


def query_knowledge_base(project_id: str, question: str, k: int = 8):
    if not HAS_RAG or not embed_model:
        return []

    project_kb_dir, index_path, chunks_path = _kb_paths(project_id)
    if not index_path.exists() or not chunks_path.exists():
        return []

    try:
        index = faiss.read_index(str(index_path))
        chunks_meta = _load_chunks(chunks_path)
    except Exception as e:
        print(f"Error reading knowledge base for {project_id}: {e}")
        return []

    if not chunks_meta:
        return []

    query_embedding = np.array(list(embed_model.embed([question]))).astype('float32')
    actual_k = min(k, len(chunks_meta))
    if actual_k == 0:
        return []

    distances, indices = index.search(query_embedding, actual_k)

    results = []
    for dist, idx in zip(distances[0], indices[0]):
        if 0 <= idx < len(chunks_meta):
            meta = chunks_meta[idx]
            results.append({
                "doc_id": meta.get("doc_id", "unknown"),
                "doc_name": meta.get("doc_name", meta.get("doc_id", "Document")),
                "text": meta["text"],
                "distance": float(dist)
            })
    return results


# Broad queries used to assemble a project-wide context. Each targets a
# different agent's needs so one retrieval pass serves the whole pipeline.
PROJECT_CONTEXT_QUERIES = [
    "project objectives scope deliverables and requirements",
    "risks blockers issues and constraints",
    "schedule milestones deadlines and dependencies",
    "meeting decisions action items and owners",
    "testing documentation quality and progress status",
]


def build_project_context(project_id: str, per_query_k: int = 6, char_budget: int = 24000) -> tuple:
    """
    Assemble a unified context across every document in the project.

    This is what makes the pipeline project-level rather than per-document:
    the agents see the combined artifacts, not one file at a time.
    """
    seen_texts = set()
    ordered_chunks = []
    distances = []

    for query in PROJECT_CONTEXT_QUERIES:
        for chunk in query_knowledge_base(project_id, query, k=per_query_k):
            key = chunk["text"][:120]
            if key in seen_texts:
                continue
            seen_texts.add(key)
            ordered_chunks.append(chunk)
            distances.append(chunk["distance"])

    if not ordered_chunks:
        return "", 0.0, []

    parts, used, doc_names = [], 0, []
    for chunk in ordered_chunks:
        block = f"[Source: {chunk['doc_name']}]\n{chunk['text']}"
        if used + len(block) > char_budget:
            break
        parts.append(block)
        used += len(block)
        if chunk["doc_name"] not in doc_names:
            doc_names.append(chunk["doc_name"])

    avg_distance = float(np.mean(distances)) if distances else 0.0
    return "\n\n---\n\n".join(parts), avg_distance, doc_names


# ── Text Extraction ───────────────────────────────────────────────────────────
def extract_text(file_bytes: bytes, ext: str) -> str:
    ext = ext.lower()
    if ext == ".pdf":
        if not HAS_PYMUPDF:
            return ""
        try:
            doc = fitz.open(stream=file_bytes, filetype="pdf")
            text = "\n".join(p.get_text() for p in doc)
            doc.close()
            return text
        except Exception as e:
            return f"[PDF extraction error: {e}]"
    elif ext in (".docx", ".doc"):
        if not HAS_DOCX:
            return ""
        try:
            doc = DocxDocument(io.BytesIO(file_bytes))
            return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
        except Exception as e:
            return f"[DOCX extraction error: {e}]"
    elif ext in (".txt", ".csv"):
        try:
            return file_bytes.decode("utf-8")
        except UnicodeDecodeError:
            return file_bytes.decode("latin-1", errors="replace")
    return ""


# ── Helper for Groq ───────────────────────────────────────────────────────────
def call_groq(system_msg: str, user_msg: str, max_tokens: int = 2048) -> Optional[dict]:
    """Centralized function to call Groq API and parse JSON output."""
    if not HAS_GROQ:
        return None
    for attempt in range(3):
        try:
            with httpx.Client(timeout=60.0) as client:
                response = client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {GROQ_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": GROQ_MODEL,
                        "messages": [
                            {"role": "system", "content": system_msg},
                            {"role": "user", "content": user_msg}
                        ],
                        "temperature": 0.0,
                        "max_tokens": max_tokens,
                        "top_p": 0.9,
                    }
                )

                if response.status_code == 429:
                    print(f"Rate limited (429). Sleeping {30 * (attempt + 1)} seconds...")
                    time.sleep(30 * (attempt + 1))
                    continue

                response.raise_for_status()
                raw = response.json()["choices"][0]["message"]["content"].strip()

                raw = re.sub(r'^```(?:json)?\s*', '', raw, flags=re.IGNORECASE)
                raw = re.sub(r'\s*```$', '', raw)

                try:
                    match = re.search(r'\{.*\}', raw, re.DOTALL)
                    if match:
                        return json.loads(match.group(0))
                    return json.loads(raw)
                except json.JSONDecodeError as e:
                    print(f"JSONDecodeError: {e} — could not parse JSON from response.")
                    time.sleep(15 * (attempt + 1))
                    continue
        except Exception as e:
            print(f"ERROR IN call_groq (attempt {attempt}): {e}")
            time.sleep(15 * (attempt + 1))
    return None


def call_groq_text(system_msg: str, user_msg: str, max_tokens: int = 1024,
                   temperature: float = 0.3, history: Optional[list] = None) -> str:
    """Plain-text Groq call (no JSON parsing), with optional conversation history."""
    messages = [{"role": "system", "content": system_msg}]
    for turn in (history or []):
        role = turn.get("role")
        content = turn.get("content")
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": user_msg})

    with httpx.Client(timeout=60.0) as client:
        resp = client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": GROQ_MODEL,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
            }
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"].strip()


# ── Multi-Agent Pipeline ──────────────────────────────────────────────────────

# Agent 1: Risk Analyst
# The LLM is capped at 3 risks per category to bound the payload and stop score
# dilution from a long tail of trivial findings.
ANALYSIS_PROMPT = """You are an expert AI project risk analyst. Analyze the following document and return ONLY a valid JSON object.

Document content:
\"\"\"
{text}
\"\"\"

Return this exact JSON structure:
{{
  "summary": "A clear 2-3 sentence summary of the document's main content and purpose",
  "risk_level": "<Low | Medium | High | Critical>",
  "key_insights": [
    {{"severity": "<critical|high|medium|low>", "text": "Specific insight found in the document", "evidence_quote": "Exact quote or null", "is_inferred": false}}
  ],
  "recommendations": [
    "Actionable recommendation 1"
  ],
  "risk_register": {{
    "technical": [
      {{
        "title": "Short title of risk",
        "description": "Detailed description",
        "category": "technical",
        "probability": "low|medium|high",
        "impact": "low|medium|high",
        "evidence_quote": "Exact quote from text, or null if inferred",
        "is_inferred": false,
        "affected_tasks": ["Task A", "Task B"],
        "affected_requirements": ["Req 1", "Req 2"],
        "recommendation": "Mitigation strategy",
        "source_documents": ["Reference to document type or section"]
      }}
    ],
    "timeline": [],
    "financial": [],
    "operational": [],
    "legal": []
  }}
}}

Rules:
- Never fabricate risks. Only report evidence-backed risks.
- If no risks exist for a category, return an empty array [] for that category. Do not omit the key.
- The "category" field of every risk MUST exactly match the key it is listed under (technical, timeline, financial, operational or legal).
- evidence_quote MUST be cited from the text if is_inferred is false.
- Extract a maximum of 3 most critical risks per category to keep the report concise.
- Return ONLY valid JSON."""


def analyze_with_groq(text: str) -> Optional[dict]:
    if not HAS_GROQ:
        # No API key: don't embed, don't retry, just let the caller fall back.
        return None

    retrieved_text, avg_distance = retrieve_context(text, k=6)
    prompt = ANALYSIS_PROMPT.format(text=retrieved_text)
    system_msg = "You are a precise JSON-only risk analysis engine. Always respond with valid JSON and nothing else."

    parsed = None
    for attempt in range(2):
        parsed = call_groq(system_msg, prompt, max_tokens=4096)
        if not parsed:
            print(f"Attempt {attempt}: call_groq returned None")
            continue

        required = ["summary", "risk_level", "risk_register"]
        if not all(k in parsed for k in required):
            print(f"Attempt {attempt}: Missing keys: {list(parsed.keys())}")
            parsed = None
            continue

        parsed.setdefault("key_insights", [])
        parsed.setdefault("recommendations", [])

        if isinstance(parsed.get("risk_register", {}), dict):
            break
        print(f"Attempt {attempt}: risk_register is not a dict")
        parsed = None

    if not parsed:
        return None

    parsed["_avg_distance"] = avg_distance
    return parsed


# Agent 2: Scope & Planning Analyst
SCOPE_PROMPT = """You are an expert project scope and planning analyst.

Document content:
\"\"\"
{text}
\"\"\"

Return ONLY valid JSON matching this structure exactly:
{{
  "scope": {{
    "objectives": ["list of project objectives"],
    "boundaries": ["what is out of scope"],
    "assumptions": ["key assumptions"]
  }},
  "deliverables": [
    {{"name": "...", "description": "...", "priority": "high|medium|low", "status": "identified", "evidence": "...", "confidence": <0-100>}}
  ],
  "blockers": [
    {{"description": "...", "severity": "critical|high|medium|low", "impact": "...", "mitigation": "...", "evidence": "...", "confidence": <0-100>}}
  ],
  "schedule_forecast": {{
    "risk_level": "high|medium|low",
    "delay_factors": ["list of factors that could cause delays"],
    "recommendations": ["how to mitigate schedule risks"],
    "reasoning": "Explain the forecast based on evidence"
  }}
}}

Rules:
- Never invent blockers. If none are supported by evidence, return one blocker: {{"description": "No blockers detected.", "severity": "low", "impact": "None", "mitigation": "None", "evidence": "No evidence of blockers.", "confidence": 100}}.
- Forecast schedule ONLY when evidence exists. If milestones or deadlines are missing, set delay_factors to ["Schedule cannot be predicted."] and reasoning to "Missing milestone information."
"""


def agent_scope_planning(text: str) -> Optional[dict]:
    if not HAS_GROQ:
        return None
    retrieved_text, _ = retrieve_context(text, k=4)
    prompt = SCOPE_PROMPT.format(text=retrieved_text)
    system_msg = "You are a precise JSON-only scope and planning engine. Return ONLY valid JSON."
    return call_groq(system_msg, prompt)


# Agent 3: Health Analyst
HEALTH_PROMPT = """You are a Project Health Analyst AI. Assess the project's health across different dimensions based on the text.

Document content:
\"\"\"
{text}
\"\"\"

Return ONLY valid JSON matching this structure exactly:
{{
  "health_breakdown": {{
    "planning": {{"score": <0-100>, "reason": "...", "evidence": "...", "confidence": <0-100>}},
    "documentation": {{"score": <0-100>, "reason": "...", "evidence": "...", "confidence": <0-100>}},
    "development": {{"score": <0-100>, "reason": "...", "evidence": "...", "confidence": <0-100>}},
    "testing": {{"score": <0-100>, "reason": "...", "evidence": "...", "confidence": <0-100>}}
  }}
}}

Rules:
- Every score must explain Why, cite Evidence, and provide a Confidence level.
- If a dimension (e.g. testing) is not mentioned in the text, set score to 0, confidence to 0, and reason to "No evidence found in current documents."
"""


def agent_health(text: str) -> Optional[dict]:
    if not HAS_GROQ:
        return None
    retrieved_text, _ = retrieve_context(text, k=3)
    prompt = HEALTH_PROMPT.format(text=retrieved_text)
    system_msg = "You are a precise JSON-only health scoring engine. Return ONLY valid JSON."

    parsed = None
    for attempt in range(2):
        parsed = call_groq(system_msg, prompt)
        if not parsed:
            continue
        if isinstance(parsed.get("health_breakdown", {}), dict):
            break
    return parsed


# Agent 4: Traceability & Missing Docs
TRACE_PROMPT = """You are a project auditor and scrum master. Analyze the document for traceability, missing documentation, and sprint analysis.

Document content:
\"\"\"
{text}
\"\"\"

Return ONLY valid JSON matching this structure exactly:
{{
  "missing_documentation": [
    {{"document_type": "...", "reason": "Why it is missing but implied", "confidence": <0-100>}}
  ],
  "traceability_gaps": [
    {{"requirement": "...", "missing_link": "Task|Testing|Deployment", "reasoning": "...", "satisfied": false}}
  ],
  "sprint_analysis": {{
    "sprint_goals": ["..."],
    "completed_work": ["..."],
    "pending_work": ["..."],
    "velocity": "...",
    "risks": ["..."],
    "action_items": ["..."],
    "status": "Detected | Missing"
  }},
  "document_summary": {{
    "document_type": "...",
    "purpose": "...",
    "primary_domain": "...",
    "detected_technologies": ["..."],
    "quality_score": <0-100>,
    "overall_assessment": "..."
  }}
}}

Rules:
- If sprint data/artifacts are not detected, set sprint_analysis.status to "Sprint artifacts not detected." and leave arrays empty.
- Every traceability gap MUST include "satisfied": false. Only set it true if the requirement is fully traced.
- Never hallucinate traceability gaps if the document is too brief.
"""


def agent_traceability(text: str) -> Optional[dict]:
    if not HAS_GROQ:
        return None
    retrieved_text, _ = retrieve_context(text, k=3)
    prompt = TRACE_PROMPT.format(text=retrieved_text)
    system_msg = "You are an audit agent. Return ONLY valid JSON."
    return call_groq(system_msg, prompt)


# Agent 5: Meeting Minutes
MEETING_PROMPT = """You are an AI meeting assistant. Extract meeting minutes, decisions, and action items.

Document content:
\"\"\"
{text}
\"\"\"

Return ONLY valid JSON matching this structure exactly. If this is not a meeting document, return an empty string for meeting_minutes and empty arrays.
{{
  "meeting_minutes": "Brief summary of the meeting topics",
  "decisions": ["Key decision 1", "Key decision 2"],
  "action_items": [
    {{"task": "What needs to be done", "owner": "Who is responsible, or 'Unassigned'", "deadline": "When it is due, or 'Unknown'"}}
  ]
}}"""


def agent_meeting(text: str) -> Optional[dict]:
    if not HAS_GROQ:
        return None
    retrieved_text, _ = retrieve_context(text, k=3)
    prompt = MEETING_PROMPT.format(text=retrieved_text)
    system_msg = "You are a meeting analysis agent. Return ONLY valid JSON."
    return call_groq(system_msg, prompt)


# Agent 6: User Story Writer — generates the documentation the project is missing
STORY_PROMPT = """You are an agile business analyst. Convert the requirements and features described in this document into user stories.

Document content:
\"\"\"
{text}
\"\"\"

Return ONLY valid JSON matching this structure exactly:
{{
  "user_stories": [
    {{
      "id": "US-1",
      "epic": "Epic or feature area this belongs to",
      "story": "As a [role], I want to [action] so that [benefit]",
      "acceptance_criteria": ["Given/When/Then criterion 1", "criterion 2"],
      "priority": "high|medium|low",
      "evidence": "The requirement text this was derived from",
      "confidence": <0-100>
    }}
  ]
}}

Rules:
- Derive stories ONLY from requirements, features or capabilities actually described in the document.
- If the document contains no requirements at all, return {{"user_stories": []}}.
- Produce at most 12 stories, prioritising the most substantial requirements.
"""


def agent_user_stories(text: str) -> Optional[dict]:
    if not HAS_GROQ:
        return None
    retrieved_text, _ = retrieve_context(text, k=4)
    prompt = STORY_PROMPT.format(text=retrieved_text)
    system_msg = "You are an agile analyst. Return ONLY valid JSON."
    return call_groq(system_msg, prompt, max_tokens=3000)


# ── Orchestrator ──────────────────────────────────────────────────────────────
RISK_CATEGORIES = ["technical", "timeline", "financial", "operational", "legal"]

# Every agent is one Groq call. Running all six on every upload triples the
# rate-limit pressure on the free tier for no benefit — a task-list CSV has no
# meeting minutes to extract, and a set of meeting notes rarely contains
# formal requirements. These signals decide which optional agents to run.
# Set RUN_ALL_AGENTS=1 to force the full pipeline regardless.
RUN_ALL_AGENTS = os.getenv("RUN_ALL_AGENTS", "").strip().lower() in {"1", "true", "yes"}

MEETING_SIGNALS = [
    "agenda", "attendees", "attended", "minutes", "meeting", "discussed",
    "action item", "action items", "next steps", "stand-up", "standup",
    "retrospective", "retro", "sync", "call notes", "present:", "apologies",
    "decision", "decided", "follow-up", "follow up", "sprint review",
]

REQUIREMENT_SIGNALS = [
    "shall", "must", "requirement", "requirements", "srs", "user story",
    "user stories", "acceptance criteria", "feature", "features", "functional",
    "non-functional", "use case", "scope", "deliverable", "specification",
    "the system", "epic", "backlog", "as a user",
]


def _signal_count(text: str, signals: list) -> int:
    """How many distinct signal phrases appear. Cheap, deterministic, no LLM."""
    sample = (text or "")[:20000].lower()
    return sum(1 for phrase in signals if phrase in sample)


def looks_like_meeting_notes(text: str) -> bool:
    return _signal_count(text, MEETING_SIGNALS) >= 2


def has_requirements(text: str) -> bool:
    return _signal_count(text, REQUIREMENT_SIGNALS) >= 3


def _normalise_register(risks) -> dict:
    """
    Coerce whatever the LLM returned into the five-category dict, and stamp each
    risk with the category key it was filed under.

    Previously a risk whose own "category" field disagreed with its bucket was
    silently dropped from the saved register. Now the bucket wins, so no
    evidence is lost.
    """
    register = {c: [] for c in RISK_CATEGORIES}

    if isinstance(risks, list):
        for r in risks:
            if not isinstance(r, dict):
                continue
            cat = str(r.get("category", "technical")).lower()
            if cat not in register:
                cat = "technical"
            r["category"] = cat
            register[cat].append(r)
        return register

    if isinstance(risks, dict):
        for key, items in risks.items():
            cat = str(key).lower()
            if cat not in register or not isinstance(items, list):
                continue
            for r in items:
                if not isinstance(r, dict):
                    continue
                r["category"] = cat   # bucket is authoritative
                register[cat].append(r)
    return register


def run_agent_pipeline(text: str, tasks: Optional[list] = None,
                       run_stories: bool = True,
                       force_all_agents: bool = False) -> dict:
    """
    Orchestrate every agent over the supplied text.

    `tasks` is structured task data (from a CSV upload or from the project's
    milestones). When present, the schedule forecast is computed with real date
    arithmetic and the LLM narrative is merged on top.
    """
    risk_result = analyze_with_groq(text)
    used_fallback = False
    if not risk_result:
        # Groq unavailable — run the real keyword engine rather than giving up.
        risk_result = keyword_engine.analyze(text)
        risk_result["_avg_distance"] = 0.0
        used_fallback = True

    agents_run = ["risk"]
    agents_skipped = []

    if used_fallback:
        scope_result, trace_result, meeting_result, story_result = {}, {}, {}, {}
        health_result = {"health_breakdown": {}}
        agents_skipped = ["scope", "health", "traceability", "meeting", "user_stories"]
    else:
        scope_result = agent_scope_planning(text) or {}
        health_result = agent_health(text) or {"health_breakdown": {}}
        trace_result = agent_traceability(text) or {}
        agents_run += ["scope", "health", "traceability"]

        # Optional agents: skip the call when the document plainly has nothing
        # for them, unless the caller asked for the full pipeline.
        if RUN_ALL_AGENTS or force_all_agents or looks_like_meeting_notes(text):
            meeting_result = agent_meeting(text) or {}
            agents_run.append("meeting")
        else:
            meeting_result = {}
            agents_skipped.append("meeting")

        if run_stories and (RUN_ALL_AGENTS or force_all_agents or has_requirements(text)):
            story_result = agent_user_stories(text) or {}
            agents_run.append("user_stories")
        else:
            story_result = {}
            agents_skipped.append("user_stories")

    # ── Risk scoring ──────────────────────────────────────────────────────────
    avg_distance = risk_result.pop("_avg_distance", 0.0)
    register = _normalise_register(risk_result.get("risk_register", {}))
    insights = risk_result.get("key_insights", [])

    flat_risks = []
    mapped_categories = {}
    assessed_count = 0

    for cat in RISK_CATEGORIES:
        cat_risks = register.get(cat, [])
        # Every risk in the bucket is kept, whether or not it scores.
        flat_risks.extend(cat_risks)
        score = scoring.category_score(cat, cat_risks)
        mapped_categories[cat] = score
        if score is not None:
            assessed_count += 1

    computed_risk_score = scoring.overall_risk_score(mapped_categories)
    risk_coverage_info = {
        "low_coverage": assessed_count < 3,
        "categories_assessed": assessed_count,
        "categories_total": 5
    }

    risk_result["risk_level"] = ("Unknown" if assessed_count == 0
                                 else scoring.risk_band(computed_risk_score))
    risk_result["risk_score"] = int(computed_risk_score)
    risk_result["risk_register"] = flat_risks

    # ── Confidence ────────────────────────────────────────────────────────────
    if assessed_count == 0:
        final_confidence = None
    elif not insights:
        final_confidence = round(scoring.insight_confidence(avg_distance, 0.2) * 100.0)
    else:
        conf_sum = 0.0
        for ins in insights:
            cw = scoring.confidence_weight(bool(ins.get("is_inferred")), bool(ins.get("evidence_quote")))
            conf_sum += scoring.insight_confidence(avg_distance, cw)
        final_confidence = round((conf_sum / len(insights)) * 100.0)

    # ── Health scoring ────────────────────────────────────────────────────────
    hb = health_result.get("health_breakdown", {}) if isinstance(health_result, dict) else {}
    if not isinstance(hb, dict):
        hb = {}

    def axis(name):
        entry = hb.get(name)
        return entry.get("score") if isinstance(entry, dict) else None

    axis_scores = {
        "planning": axis("planning"),
        "documentation": axis("documentation"),
        "development": axis("development"),
        "testing": axis("testing"),
        "risk": max(0, 100 - computed_risk_score) if computed_risk_score is not None else None,
    }

    llm_axis_keys = ["planning", "documentation", "development", "testing"]
    llm_health_assessed_count = sum(1 for k in llm_axis_keys if axis_scores.get(k) is not None)
    overall_health = scoring.overall_health(axis_scores)
    grade = scoring.grade(overall_health)

    # ── Schedule forecast: deterministic first, LLM narrative second ──────────
    computed_schedule = schedule_engine.forecast(tasks or [])
    llm_schedule = scope_result.get("schedule_forecast", {})
    schedule_forecast = schedule_engine.merge_with_llm(computed_schedule, llm_schedule)

    # ── Merge ─────────────────────────────────────────────────────────────────
    merged = {**risk_result}
    merged["risk_score"] = round(computed_risk_score)
    mapped_categories["_coverage"] = risk_coverage_info
    merged["risk_categories"] = mapped_categories
    merged["confidence_score"] = final_confidence
    merged["project_health"] = {
        "score": round(overall_health),
        "grade": grade,
        "breakdown": hb,
        "health_coverage": {
            "low_coverage": llm_health_assessed_count < 3,
            "categories_assessed": llm_health_assessed_count,
            "categories_total": 4
        }
    }

    merged["scope"] = scope_result.get("scope", {"objectives": [], "boundaries": [], "assumptions": []})
    merged["deliverables"] = scope_result.get("deliverables", [])
    merged["blockers"] = scope_result.get("blockers", [])
    merged["schedule_forecast"] = schedule_forecast

    merged["missing_documentation"] = trace_result.get("missing_documentation", [])
    merged["traceability_gaps"] = trace_result.get("traceability_gaps", [])
    merged["sprint_summary"] = trace_result.get("sprint_analysis", {})
    merged["document_summary"] = trace_result.get("document_summary", {})

    # Meeting agent — now actually invoked, so meeting notes produce output.
    merged["meeting_minutes"] = meeting_result.get("meeting_minutes") or None
    merged["decisions"] = meeting_result.get("decisions", [])
    merged["action_items"] = meeting_result.get("action_items", [])

    # User stories — generated as part of the pipeline, not only on demand.
    merged["user_stories"] = story_result.get("user_stories", [])

    merged["tasks"] = tasks or []
    merged["agents_run"] = agents_run
    merged["agents_skipped"] = agents_skipped
    merged["analysis_source"] = "keyword_fallback" if used_fallback else "groq_pipeline"

    return merged


# ── API Endpoints ─────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {
        "status": "running",
        "version": "3.1.0",
        "groq_enabled": HAS_GROQ,
        "groq_model": GROQ_MODEL if HAS_GROQ else None,
        "pdf_extraction": HAS_PYMUPDF,
        "docx_extraction": HAS_DOCX,
        "rag_enabled": HAS_RAG,
    }


@app.post("/process")
async def process_file(file: UploadFile = File(...), projectId: Optional[str] = None):
    """v1 backward-compat endpoint."""
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported file type.")
    file_id = str(uuid.uuid4())
    path = UPLOAD_DIR / f"{file_id}_{Path(file.filename).name}"
    with path.open("wb") as buf:
        shutil.copyfileobj(file.file, buf)
    return {"status": "success", "file_id": file_id, "filename": file.filename, "projectId": projectId}


@app.post("/analyze")
async def analyze_file(
    file: UploadFile = File(...),
    projectId: Optional[str] = Form(None),
    documentId: Optional[str] = Form(None),
):
    """Core AI analysis endpoint — multi-agent pipeline over a single document."""
    start = time.time()

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )

    file_bytes = await file.read()
    extracted_text = extract_text(file_bytes, ext)
    word_count = len(re.findall(r'\b\w+\b', extracted_text)) if extracted_text else 0

    # Task lists become structured rows, and the clean rendering is what the
    # agents read — a CSV is no longer treated as prose.
    parsed_tasks = csv_tasks.parse_tasks(extracted_text)
    tasks = parsed_tasks.get("tasks", [])
    analysis_text = extracted_text
    if tasks:
        analysis_text = csv_tasks.tasks_to_text(parsed_tasks) + "\n\n" + extracted_text
        
    # Render's proxy has a strict 100s timeout. Large PDFs running through 5 agents
    # can exceed this. Truncate the text sent to the LLM to stay within the limit.
    safe_analysis_text = analysis_text[:30000] if analysis_text else ""

    result = run_agent_pipeline(safe_analysis_text, tasks=tasks)
    analysis_source = result.pop("analysis_source", "groq_pipeline" if HAS_GROQ else "keyword_fallback")

    # Store in the project knowledge base under the real document id, so chat
    # answers can cite the filename this text came from.
    if projectId:
        add_to_knowledge_base(
            projectId,
            extracted_text,
            documentId or str(uuid.uuid4()),
            file.filename,
        )

    processing_time_ms = round((time.time() - start) * 1000, 2)

    response = {
        "status": "success",
        "filename": file.filename,
        "projectId": projectId,
        "documentId": documentId,
        "word_count": word_count,
        "processing_time_ms": processing_time_ms,
        "analysis_source": analysis_source,
        "extracted_text": extracted_text[:5000],
        "task_parse_status": parsed_tasks.get("parse_status"),
    }
    response.update(result)
    return response


class ProjectAnalyzeRequest(BaseModel):
    project_id: str
    milestones: Optional[List[dict]] = None
    context_override: Optional[str] = None


@app.post("/analyze-project")
def analyze_project(req: ProjectAnalyzeRequest):
    """
    Run the multi-agent pipeline across the WHOLE project knowledge base.

    This is the project-level intelligence layer: instead of scoring one file at
    a time, the agents reason over the combined artifacts, and the schedule
    forecast uses the project's real milestones and dependencies.
    """
    start = time.time()

    context_text, avg_distance, doc_names = build_project_context(req.project_id)

    if not context_text and req.context_override:
        context_text = req.context_override
        doc_names = ["Project documents (database)"]
    if not context_text:
        raise HTTPException(
            status_code=404,
            detail="No project context found. Upload and analyse at least one document first."
        )

    tasks = []
    for m in (req.milestones or []):
        tasks.append({
            "id": m.get("id"),
            "name": m.get("name"),
            "owner": m.get("owner") or "Unassigned",
            "status": m.get("status") or "not_started",
            "progress": m.get("progress", 0),
            "due_date": m.get("dueDate") or m.get("due_date"),
            "start_date": m.get("startDate") or m.get("start_date"),
            "depends_on": m.get("depends_on") or m.get("dependsOn") or [],
            "effort": m.get("effort"),
        })
        })

    # Render proxy timeout safeguard
    safe_context_text = context_text[:40000] if context_text else ""

    result = run_agent_pipeline(safe_context_text, tasks=tasks, force_all_agents=True)
    analysis_source = result.pop("analysis_source", "groq_pipeline")

    result.update({
        "status": "success",
        "project_id": req.project_id,
        "source_documents": doc_names,
        "documents_covered": len(doc_names),
        "milestones_used": len(tasks),
        "analysis_source": analysis_source,
        "processing_time_ms": round((time.time() - start) * 1000, 2),
    })
    return result


class ChatRequest(BaseModel):
    project_id: str
    question: str
    history: Optional[List[dict]] = None
    context_override: Optional[str] = None


@app.post("/chat")
def chat(req: ChatRequest):
    """Chat endpoint backed by the FAISS knowledge base, with conversation memory."""
    if not HAS_GROQ:
        raise HTTPException(status_code=503, detail="Groq API is required for chat.")

    chunks = query_knowledge_base(req.project_id, req.question, k=5)

    if not chunks and req.context_override:
        context_text = req.context_override
        sources = [{
            "text": req.context_override[:200] + "...",
            "doc_id": "database",
            "doc_name": "Project documents (database)",
            "distance": 0
        }]
    elif not chunks:
        return {
            "answer": "I don't have enough context from this project's documents to answer that question.",
            "sources": [],
            "grounded": False
        }
    else:
        context_text = "\n\n".join([f"[Source: {c['doc_name']}]\n{c['text']}" for c in chunks])
        sources = chunks

    system_msg = (
        "You are a project intelligence assistant. Answer questions ONLY based on the provided "
        "document context. Cite the source document name when you use it. If the context doesn't "
        "contain the answer, say so plainly. Earlier turns of the conversation are provided for "
        "continuity — use them to resolve references like 'that risk' or 'the second one'."
    )
    user_msg = f"Context:\n{context_text}\n\nQuestion: {req.question}"

    # History is now part of the request model, so follow-up questions keep
    # their thread instead of being answered cold.
    history = (req.history or [])[-8:]

    try:
        answer = call_groq_text(system_msg, user_msg, max_tokens=1024,
                                temperature=0.3, history=history)
        return {"answer": answer, "sources": sources, "grounded": True}
    except Exception as e:
        print(f"Groq API failed during /chat: {e}")
        return {
            "answer": "AI is temporarily unavailable. Here are the most relevant excerpts from your "
                      "documents for your question.",
            "sources": sources,
            "grounded": True
        }


class GenerateRequest(BaseModel):
    project_id: str
    doc_type: str
    context_override: Optional[str] = None


GENERATION_PROMPTS = {
    "user_stories": "Synthesize all requirements, features, and scope from the context into a comprehensive Master User Story Backlog. Format as a Markdown document with clear Epics (H2) and User Stories (bullet points in format 'As a [role], I want to [action] so that [benefit]'). Include acceptance criteria if possible.",
    "risk_register": "Synthesize all risks, warnings, blockers, and constraints from the context into a Master Risk Register. Format as a Markdown document with a summary, followed by a detailed table of risks (ID, Description, Category, Probability, Impact, Mitigation, Owner).",
    "action_items": "Synthesize all pending tasks, next steps, and action items from the context into a Master Action Item List. Format as a Markdown document grouped by owner, with checkboxes and deadlines where known.",
    "srs": "Synthesize all context into a formal Software Requirements Specification (SRS) outline. Include sections for: 1. Introduction & Purpose, 2. Overall Description, 3. System Features, 4. Non-Functional Requirements. Format as a clean Markdown document.",
    "test_plan": "Synthesize the context into a Test Plan covering scope, test strategy, test cases traced to requirements, entry/exit criteria and known gaps. Format as clean Markdown.",
    "status_report": "Synthesize the context into a concise project status report: overall health, what changed, risks needing attention, upcoming deadlines and asks. Format as clean Markdown.",
    # The client offered this type while the service had no prompt for it, so
    # it silently fell through to the generic executive-summary instruction.
    "api_specs": "Synthesize the context into an API specification: for each endpoint give the method, path, purpose, request payload, response shape, auth requirement and error cases. Note explicitly where the documents do not specify a detail rather than inventing one. Format as clean Markdown with a table of endpoints followed by per-endpoint detail.",
}


@app.post("/generate")
def generate_document(req: GenerateRequest):
    """Generate missing documentation by synthesizing the project knowledge base."""
    if not HAS_GROQ:
        raise HTTPException(status_code=503, detail="Groq API is required for generation.")

    chunks = query_knowledge_base(
        req.project_id, "project overview requirements risks scope action items", k=10
    )

    if chunks:
        context_text = "\n\n".join([f"[Source: {c['doc_name']}]\n{c['text']}" for c in chunks])
    elif req.context_override:
        context_text = req.context_override
    else:
        raise HTTPException(status_code=404, detail="No project context found to generate document.")

    system_msg = ("You are an expert project manager and technical writer. Generate a comprehensive, "
                  "professional document based ONLY on the provided project context. Output ONLY Markdown.")
    task_prompt = GENERATION_PROMPTS.get(
        req.doc_type, "Summarize the project context into a clear executive summary."
    )
    user_msg = f"Context:\n{context_text}\n\nTask: {task_prompt}"

    last_error = None
    for attempt in range(3):
        try:
            content = call_groq_text(system_msg, user_msg, max_tokens=3000, temperature=0.2)
            return {"markdown": content, "sources": [c["doc_name"] for c in chunks]}
        except httpx.HTTPStatusError as e:
            last_error = e
            if e.response.status_code == 429 and attempt < 2:
                print(f"Rate limit hit (429). Retrying in 5s (attempt {attempt + 1}/3)...")
                time.sleep(5)
            else:
                break
        except Exception as e:
            last_error = e
            if attempt < 2:
                print(f"Error calling Groq: {e}. Retrying in 5s (attempt {attempt + 1}/3)...")
                time.sleep(5)
            else:
                break

    # Every retry failed — return the retrieved source material rather than an error.
    print(f"Error in /generate: {last_error}")
    fallback = "> AI synthesis is unavailable. These are the most relevant excerpts from your documents.\n\n"
    if chunks:
        fallback += "\n\n---\n\n".join([f"**From {c['doc_name']}:**\n\n{c['text']}" for c in chunks])
    else:
        fallback += context_text
    return {"markdown": fallback, "sources": [c["doc_name"] for c in chunks]}


# ── Knowledge base maintenance ────────────────────────────────────────────────
@app.get("/kb/{project_id}")
def kb_status(project_id: str):
    """Report what the project knowledge base currently holds."""
    _, index_path, chunks_path = _kb_paths(project_id)
    chunks_meta = _load_chunks(chunks_path)
    documents = {}
    for c in chunks_meta:
        name = c.get("doc_name", c.get("doc_id", "unknown"))
        documents[name] = documents.get(name, 0) + 1
    return {
        "project_id": project_id,
        "indexed": index_path.exists(),
        "chunks": len(chunks_meta),
        "documents": [{"name": n, "chunks": c} for n, c in documents.items()],
    }


@app.delete("/kb/{project_id}/document/{doc_id}")
def kb_delete_document(project_id: str, doc_id: str):
    """Remove one document's chunks when that document is deleted."""
    removed = delete_document_from_kb(project_id, doc_id)
    return {"project_id": project_id, "doc_id": doc_id, "chunks_removed": removed}


@app.delete("/kb/{project_id}")
def kb_delete_project(project_id: str):
    """Remove the whole knowledge base when a project is deleted."""
    deleted = delete_project_kb(project_id)
    return {"project_id": project_id, "deleted": deleted}
