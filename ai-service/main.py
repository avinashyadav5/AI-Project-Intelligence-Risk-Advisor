"""
AI Project Intelligence & Risk Advisor — FastAPI AI Service v3.2.0
==================================================================
RENDER FREE TIER REWRITE:
- Completely synchronous pipeline (no background tasks, no polling)
- Only 2 sequential Groq calls instead of 5 (Risk + Health merged, Scope merged)
- Text capped at 8000 characters (≈2000 tokens per call, well under 6000 TPM)
- No FAISS, no fastembed (saves 250MB RAM)
- Keyword fallback always available
"""

import os, re, io, uuid, time, json, shutil
from pathlib import Path
from typing import Optional, List

os.environ["OMP_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"

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

# ── Optional heavy deps ───────────────────────────────────────────────────────
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
import httpx

HAS_RAG  = False  # disabled to save RAM
HAS_GROQ = bool(GROQ_API_KEY)

# ── App bootstrap ─────────────────────────────────────────────────────────────
app = FastAPI(title="AI Project Intelligence & Risk Advisor — AI Service", version="3.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)
KB_DIR = Path("knowledge_base")
KB_DIR.mkdir(exist_ok=True)
ALLOWED_EXTENSIONS = {".pdf", ".doc", ".docx", ".txt", ".csv"}

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


# ── Knowledge Base (JSON-only, no FAISS) ──────────────────────────────────────
def _kb_paths(project_id: str):
    d = KB_DIR / project_id
    return d, d / "chunks.json"

def _load_chunks(chunks_path: Path) -> list:
    if not chunks_path.exists():
        return []
    try:
        with open(chunks_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []

def chunk_text(text: str, chunk_size: int = 300, overlap: int = 50) -> list:
    if not text or not text.strip():
        return []
    words = text.split()
    chunks, i, step = [], 0, max(1, chunk_size - overlap)
    while i < len(words):
        chunks.append(" ".join(words[i:i + chunk_size]))
        i += step
    return chunks

def add_to_knowledge_base(project_id: str, text: str, doc_id: str, doc_name: str = ""):
    if not project_id or not text:
        return
    kb_dir, chunks_path = _kb_paths(project_id)
    kb_dir.mkdir(parents=True, exist_ok=True)
    chunks = chunk_text(text, chunk_size=300, overlap=50)
    if not chunks:
        return
    existing = _load_chunks(chunks_path)
    kept = [c for c in existing if c.get("doc_id") != doc_id]
    new_meta = [{"doc_id": doc_id, "doc_name": doc_name or doc_id, "text": c} for c in chunks]
    with open(chunks_path, "w", encoding="utf-8") as f:
        json.dump(kept + new_meta, f)

def delete_document_from_kb(project_id: str, doc_id: str) -> int:
    _, chunks_path = _kb_paths(project_id)
    existing = _load_chunks(chunks_path)
    kept = [c for c in existing if c.get("doc_id") != doc_id]
    removed = len(existing) - len(kept)
    if removed:
        with open(chunks_path, "w", encoding="utf-8") as f:
            json.dump(kept, f)
    return removed

def delete_project_kb(project_id: str) -> bool:
    kb_dir, _ = _kb_paths(project_id)
    if kb_dir.exists():
        shutil.rmtree(kb_dir, ignore_errors=True)
        return True
    return False

def query_knowledge_base(project_id: str, question: str, k: int = 5) -> list:
    _, chunks_path = _kb_paths(project_id)
    chunks = _load_chunks(chunks_path)
    if not chunks:
        return []
    # Simple keyword scoring (no FAISS needed)
    q_words = set(re.sub(r"[^\w\s]", "", question.lower()).split())
    scored = []
    for c in chunks:
        score = sum(c["text"].lower().count(w) for w in q_words)
        scored.append((score, c))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [c for _, c in scored[:k]]

def build_project_context(project_id: str, char_budget: int = 20000):
    queries = [
        "project objectives scope deliverables requirements",
        "risks blockers issues constraints",
        "schedule milestones deadlines",
        "testing documentation quality status",
    ]
    seen, parts, doc_names = set(), [], []
    for q in queries:
        for chunk in query_knowledge_base(project_id, q, k=3):
            key = chunk["text"][:80]
            if key in seen:
                continue
            seen.add(key)
            block = f"[Source: {chunk['doc_name']}]\n{chunk['text']}"
            if sum(len(p) for p in parts) + len(block) > char_budget:
                break
            parts.append(block)
            if chunk["doc_name"] not in doc_names:
                doc_names.append(chunk["doc_name"])
    return "\n\n---\n\n".join(parts), 0.0, doc_names


# ── Groq helper ───────────────────────────────────────────────────────────────
def call_groq(system_msg: str, user_msg: str, max_tokens: int = 2048) -> Optional[dict]:
    if not HAS_GROQ:
        return None
    for attempt in range(2):
        try:
            with httpx.Client(timeout=55.0) as client:
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
                            {"role": "user",   "content": user_msg},
                        ],
                        "temperature": 0.0,
                        "max_tokens": max_tokens,
                        "top_p": 0.9,
                    },
                )
                if response.status_code == 429:
                    wait = 20 * (attempt + 1)
                    print(f"Groq 429 — sleeping {wait}s")
                    time.sleep(wait)
                    continue
                response.raise_for_status()
                raw = response.json()["choices"][0]["message"]["content"].strip()
                raw = re.sub(r'^```(?:json)?\s*', '', raw, flags=re.IGNORECASE)
                raw = re.sub(r'\s*```$', '', raw)
                try:
                    m = re.search(r'\{.*\}', raw, re.DOTALL)
                    return json.loads(m.group(0)) if m else json.loads(raw)
                except json.JSONDecodeError:
                    time.sleep(10)
                    continue
        except Exception as e:
            print(f"call_groq attempt {attempt}: {e}")
            time.sleep(10)
    return None

def call_groq_text(system_msg: str, user_msg: str, max_tokens: int = 1024,
                   temperature: float = 0.3, history: Optional[list] = None) -> str:
    messages = [{"role": "system", "content": system_msg}]
    for t in (history or []):
        if t.get("role") in ("user", "assistant") and t.get("content"):
            messages.append(t)
    messages.append({"role": "user", "content": user_msg})
    with httpx.Client(timeout=55.0) as client:
        resp = client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
            json={"model": GROQ_MODEL, "messages": messages, "temperature": temperature, "max_tokens": max_tokens},
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"].strip()


# ── Single combined prompt (2 Groq calls total instead of 5) ─────────────────
FULL_ANALYSIS_PROMPT = """You are an expert AI project risk and health analyst.

Document content (first 8000 characters):
\"\"\"
{text}
\"\"\"

Return ONLY valid JSON matching this EXACT structure:
{{
  "summary": "2-3 sentence summary of the document",
  "risk_level": "Low|Medium|High|Critical",
  "key_insights": [
    {{"severity": "critical|high|medium|low", "text": "insight", "evidence_quote": "quote or null", "is_inferred": false}}
  ],
  "recommendations": ["Actionable recommendation 1", "Actionable recommendation 2"],
  "risk_register": {{
    "technical": [{{"title": "...", "description": "...", "category": "technical", "probability": "low|medium|high", "impact": "low|medium|high", "evidence_quote": null, "is_inferred": true, "affected_tasks": [], "affected_requirements": [], "recommendation": "...", "source_documents": []}}],
    "timeline": [],
    "financial": [],
    "operational": [],
    "legal": []
  }},
  "scope": {{
    "objectives": ["objective 1"],
    "boundaries": ["boundary 1"],
    "assumptions": ["assumption 1"]
  }},
  "deliverables": [{{"name": "...", "description": "...", "priority": "high|medium|low", "status": "identified", "evidence": "...", "confidence": 80}}],
  "health_breakdown": {{
    "planning": {{"score": 50, "reason": "...", "evidence": "...", "confidence": 50}},
    "documentation": {{"score": 50, "reason": "...", "evidence": "...", "confidence": 50}},
    "development": {{"score": 50, "reason": "...", "evidence": "...", "confidence": 50}},
    "testing": {{"score": 50, "reason": "...", "evidence": "...", "confidence": 50}}
  }}
}}

Rules:
- Max 3 risks per category. No fabricated risks.
- If a section has no evidence, use empty arrays or default scores of 50 with reason "No evidence found."
- Return ONLY valid JSON, nothing else."""


SCOPE_PROMPT = """You are an expert project analyst.

Document content:
\"\"\"
{text}
\"\"\"

Return ONLY valid JSON:
{{
  "blockers": [{{"description": "...", "severity": "critical|high|medium|low", "impact": "...", "mitigation": "...", "evidence": "...", "confidence": 80}}],
  "missing_documentation": [{{"document_type": "...", "reason": "...", "confidence": 80}}],
  "traceability_gaps": [{{"requirement": "...", "missing_link": "Task|Testing|Deployment", "reasoning": "...", "satisfied": false}}],
  "document_summary": {{"document_type": "...", "purpose": "...", "primary_domain": "...", "detected_technologies": [], "quality_score": 70, "overall_assessment": "..."}}
}}

Rules:
- If no blockers found, return [{{"description": "No blockers detected.", "severity": "low", "impact": "None", "mitigation": "None", "evidence": "None", "confidence": 100}}]
- Return ONLY valid JSON."""


RISK_CATEGORIES = ["technical", "timeline", "financial", "operational", "legal"]

def _normalise_register(risks) -> dict:
    register = {c: [] for c in RISK_CATEGORIES}
    if isinstance(risks, list):
        for r in risks:
            if not isinstance(r, dict): continue
            cat = str(r.get("category", "technical")).lower()
            if cat not in register: cat = "technical"
            r["category"] = cat
            register[cat].append(r)
        return register
    if isinstance(risks, dict):
        for key, items in risks.items():
            cat = str(key).lower()
            if cat not in register or not isinstance(items, list): continue
            for r in items:
                if not isinstance(r, dict): continue
                r["category"] = cat
                register[cat].append(r)
    return register


def run_agent_pipeline(text: str, tasks: Optional[list] = None, force_all_agents: bool = False) -> dict:
    """
    Slim 2-call pipeline that fits in Render free tier:
    Call 1: Risk + Health + Scope objectives
    Call 2: Blockers + Traceability + Document summary
    """
    # ── Call 1: Main analysis ─────────────────────────────────────────────────
    analysis = None
    used_fallback = False
    if HAS_GROQ:
        prompt1 = FULL_ANALYSIS_PROMPT.format(text=text[:8000])
        analysis = call_groq(
            "You are a precise JSON-only analysis engine. Return ONLY valid JSON.",
            prompt1,
            max_tokens=3000,
        )

    if not analysis:
        analysis = keyword_engine.analyze(text)
        analysis["_avg_distance"] = 0.0
        analysis.setdefault("scope", {"objectives": [], "boundaries": [], "assumptions": []})
        analysis.setdefault("deliverables", [])
        analysis.setdefault("health_breakdown", {})
        used_fallback = True

    # ── Call 2: Blockers + Traceability ──────────────────────────────────────
    scope2 = {}
    if HAS_GROQ and not used_fallback:
        prompt2 = SCOPE_PROMPT.format(text=text[:8000])
        scope2 = call_groq(
            "You are a precise JSON-only project auditor. Return ONLY valid JSON.",
            prompt2,
            max_tokens=2000,
        ) or {}

    # ── Scoring ───────────────────────────────────────────────────────────────
    avg_distance = analysis.pop("_avg_distance", 0.0)
    register = _normalise_register(analysis.get("risk_register", {}))
    insights = analysis.get("key_insights", [])

    flat_risks, mapped_categories, assessed_count = [], {}, 0
    for cat in RISK_CATEGORIES:
        cat_risks = register.get(cat, [])
        flat_risks.extend(cat_risks)
        score = scoring.category_score(cat, cat_risks)
        mapped_categories[cat] = score
        if score is not None:
            assessed_count += 1

    computed_risk_score = scoring.overall_risk_score(mapped_categories)

    # ── Health scoring ────────────────────────────────────────────────────────
    hb = analysis.get("health_breakdown", {})
    if not isinstance(hb, dict): hb = {}
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
    overall_health = scoring.overall_health(axis_scores)
    grade = scoring.grade(overall_health)
    llm_health_count = sum(1 for k in ["planning","documentation","development","testing"] if axis_scores.get(k) is not None)

    # ── Schedule ──────────────────────────────────────────────────────────────
    computed_schedule = schedule_engine.forecast(tasks or [])
    schedule_forecast = schedule_engine.merge_with_llm(computed_schedule, {})

    # ── Confidence ────────────────────────────────────────────────────────────
    if assessed_count == 0:
        final_confidence = None
    elif not insights:
        final_confidence = round(scoring.insight_confidence(avg_distance, 0.2) * 100.0)
    else:
        conf_sum = sum(
            scoring.insight_confidence(avg_distance, scoring.confidence_weight(bool(i.get("is_inferred")), bool(i.get("evidence_quote"))))
            for i in insights
        )
        final_confidence = round((conf_sum / len(insights)) * 100.0)

    # ── Merge ─────────────────────────────────────────────────────────────────
    merged = {**analysis}
    merged["risk_score"]     = round(computed_risk_score) if computed_risk_score else 0
    merged["risk_level"]     = "Unknown" if assessed_count == 0 else scoring.risk_band(computed_risk_score)
    merged["risk_register"]  = flat_risks
    merged["risk_categories"] = {**mapped_categories, "_coverage": {
        "low_coverage": assessed_count < 3, "categories_assessed": assessed_count, "categories_total": 5
    }}
    merged["confidence_score"] = final_confidence
    merged["project_health"] = {
        "score": round(overall_health),
        "grade": grade,
        "breakdown": hb,
        "health_coverage": {"low_coverage": llm_health_count < 3, "categories_assessed": llm_health_count, "categories_total": 4}
    }
    merged["scope"]             = analysis.get("scope", {"objectives": [], "boundaries": [], "assumptions": []})
    merged["deliverables"]      = analysis.get("deliverables", [])
    merged["schedule_forecast"] = schedule_forecast
    merged["blockers"]          = scope2.get("blockers", [])
    merged["missing_documentation"] = scope2.get("missing_documentation", [])
    merged["traceability_gaps"] = scope2.get("traceability_gaps", [])
    merged["document_summary"]  = scope2.get("document_summary", {})
    merged["sprint_summary"]    = {}
    merged["meeting_minutes"]   = None
    merged["decisions"]         = []
    merged["action_items"]      = []
    merged["user_stories"]      = []
    merged["tasks"]             = tasks or []
    merged["agents_run"]        = ["risk+health+scope", "blockers+traceability"] if not used_fallback else ["keyword_fallback"]
    merged["agents_skipped"]    = ["meeting", "user_stories"]
    merged["analysis_source"]   = "keyword_fallback" if used_fallback else "groq_pipeline"
    return merged


# ── API Endpoints ─────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {
        "status": "running",
        "version": "3.2.0",
        "groq_enabled": HAS_GROQ,
        "groq_model": GROQ_MODEL if HAS_GROQ else None,
        "pdf_extraction": HAS_PYMUPDF,
        "docx_extraction": HAS_DOCX,
        "rag_enabled": HAS_RAG,
    }


@app.post("/analyze")
async def analyze_file(
    file: UploadFile = File(...),
    projectId: Optional[str] = Form(None),
    documentId: Optional[str] = Form(None),
):
    """Synchronous analysis — 2 Groq calls, completes in ~30-60s on free tier."""
    start = time.time()
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file type '{ext}'.")

    file_bytes = await file.read()
    extracted_text = extract_text(file_bytes, ext)
    word_count = len(re.findall(r'\b\w+\b', extracted_text)) if extracted_text else 0

    parsed_tasks = csv_tasks.parse_tasks(extracted_text)
    tasks = parsed_tasks.get("tasks", [])
    analysis_text = extracted_text
    if tasks:
        analysis_text = csv_tasks.tasks_to_text(parsed_tasks) + "\n\n" + extracted_text

    result = run_agent_pipeline(analysis_text, tasks=tasks)
    analysis_source = result.pop("analysis_source", "groq_pipeline" if HAS_GROQ else "keyword_fallback")

    if projectId:
        add_to_knowledge_base(projectId, extracted_text, documentId or str(uuid.uuid4()), file.filename)

    response = {
        "status": "success",
        "filename": file.filename,
        "projectId": projectId,
        "documentId": documentId,
        "word_count": word_count,
        "processing_time_ms": round((time.time() - start) * 1000, 2),
        "analysis_source": analysis_source,
        "extracted_text": extracted_text[:5000],
        "task_parse_status": parsed_tasks.get("parse_status"),
    }
    response.update(result)
    return response


# ── backward-compat process endpoint ─────────────────────────────────────────
@app.post("/process")
async def process_file(file: UploadFile = File(...), projectId: Optional[str] = None):
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported file type.")
    file_id = str(uuid.uuid4())
    path = UPLOAD_DIR / f"{file_id}_{Path(file.filename).name}"
    content = await file.read()
    path.write_bytes(content)
    return {"status": "success", "file_id": file_id, "filename": file.filename, "projectId": projectId}


# ── Project-level analysis ────────────────────────────────────────────────────
class ProjectAnalyzeRequest(BaseModel):
    project_id: str
    milestones: Optional[List[dict]] = None
    context_override: Optional[str] = None

@app.post("/analyze-project")
def analyze_project(req: ProjectAnalyzeRequest):
    start = time.time()
    context_text, avg_distance, doc_names = build_project_context(req.project_id)
    if not context_text and req.context_override:
        context_text = req.context_override
        doc_names = ["Project documents (database)"]
    if not context_text:
        raise HTTPException(status_code=404, detail="No project context found. Upload and analyse at least one document first.")

    tasks = []
    for m in (req.milestones or []):
        tasks.append({
            "id": m.get("id"), "name": m.get("name"), "owner": m.get("owner") or "Unassigned",
            "status": m.get("status") or "not_started", "progress": m.get("progress", 0),
            "due_date": m.get("dueDate") or m.get("due_date"),
            "start_date": m.get("startDate") or m.get("start_date"),
            "depends_on": m.get("depends_on") or m.get("dependsOn") or [],
            "effort": m.get("effort"),
        })

    result = run_agent_pipeline(context_text[:16000], tasks=tasks, force_all_agents=True)
    analysis_source = result.pop("analysis_source", "groq_pipeline")
    result.update({
        "status": "success", "project_id": req.project_id,
        "source_documents": doc_names, "documents_covered": len(doc_names),
        "milestones_used": len(tasks), "analysis_source": analysis_source,
        "processing_time_ms": round((time.time() - start) * 1000, 2),
    })
    return result


# ── Chat endpoint ─────────────────────────────────────────────────────────────
class ChatRequest(BaseModel):
    project_id: str
    question: str
    history: Optional[List[dict]] = None
    context_override: Optional[str] = None

@app.post("/chat")
def chat(req: ChatRequest):
    if not HAS_GROQ:
        raise HTTPException(status_code=503, detail="Groq API is required for chat.")

    chunks = query_knowledge_base(req.project_id, req.question, k=5)
    if not chunks and req.context_override:
        context_text = req.context_override
        sources = [{"text": req.context_override[:200] + "...", "doc_id": "database", "doc_name": "Project documents", "distance": 0}]
    elif not chunks:
        return {"answer": "I don't have enough context from this project's documents to answer that question.", "sources": [], "grounded": False}
    else:
        context_text = "\n\n---\n\n".join(f"[Source: {c['doc_name']}]\n{c['text']}" for c in chunks)
        sources = [{"doc_id": c["doc_id"], "doc_name": c["doc_name"], "text": c["text"][:200], "distance": c.get("distance", 0)} for c in chunks]

    system = (
        "You are an AI project intelligence assistant. Answer based ONLY on the provided context. "
        "Be concise and specific. If you cannot answer from the context, say so clearly."
    )
    user_msg = f"Context:\n\n{context_text}\n\nQuestion: {req.question}"
    answer = call_groq_text(system, user_msg, max_tokens=1024, temperature=0.3, history=req.history)
    return {"answer": answer, "sources": sources, "grounded": bool(chunks)}


# ── KB management endpoints ────────────────────────────────────────────────────
@app.delete("/kb/{project_id}/document/{doc_id}")
def delete_doc_from_kb(project_id: str, doc_id: str):
    removed = delete_document_from_kb(project_id, doc_id)
    return {"status": "ok", "chunks_removed": removed}

@app.delete("/kb/{project_id}")
def delete_project_knowledge_base(project_id: str):
    ok = delete_project_kb(project_id)
    return {"status": "ok" if ok else "not_found"}
