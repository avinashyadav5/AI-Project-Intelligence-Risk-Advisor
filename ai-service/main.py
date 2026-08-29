"""
Development of AI Powered Health Monitoring & Risk Analysis Platform — FastAPI AI Service v3.0.0
================================================================
Architecture decisions:
  - Text extraction runs locally (PyMuPDF / python-docx) — fast, free, private
  - Multi-Agent Pipeline (Risk, Scope, Docs, Health) via Groq
  - Keyword engine is retained as a FALLBACK if Groq is unavailable
  - /analyze returns structured JSON from orchestrator
  - RAG Knowledge base for persistent project memory and Chat API
"""

import os, re, io, uuid, time, json, shutil
from pathlib import Path
from typing import Optional
import scoring
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
    from sentence_transformers import SentenceTransformer
    import scoring
    HAS_RAG = True
except ImportError:
    HAS_RAG = False

import httpx
HAS_GROQ = bool(GROQ_API_KEY)


# ── App bootstrap ─────────────────────────────────────────────────────────────
app = FastAPI(
    title="Development of AI Powered Health Monitoring & Risk Analysis Platform — AI Service",
    version="3.0.0",
)

KB_DIR = Path("knowledge_base")
KB_DIR.mkdir(exist_ok=True)

# ── Global RAG Model Loading ──────────────────────────────────────────────────
embed_model = None
if HAS_RAG:
    try:
        print("Loading local embedding model (all-MiniLM-L6-v2)...")
        embed_model = SentenceTransformer('all-MiniLM-L6-v2')
        print("Embedding model loaded successfully.")
    except Exception as e:
        print(f"Failed to load embedding model: {e}")
        HAS_RAG = False

def chunk_text(text: str, chunk_size: int = 300, overlap: int = 50) -> list:
    """Split text into chunks of `chunk_size` words with `overlap` words."""
    if not text: return []
    words = text.split()
    chunks = []
    i = 0
    step = max(1, chunk_size - overlap)
    while i < len(words):
        chunks.append(" ".join(words[i:i + chunk_size]))
        i += step
    return chunks

def retrieve_context(text: str, k: int = 8) -> tuple[str, float]:
    """Chunks text, embeds it, builds an in-memory FAISS index, and retrieves top K chunks."""
    if not HAS_RAG or not embed_model:
        return text[:12000], 0.0
    
    if len(text) < 12000:
        return text, 0.0
        
    chunks = chunk_text(text, chunk_size=300, overlap=50)
    if not chunks: return ""
        
    embeddings = embed_model.encode(chunks, show_progress_bar=False)
    embeddings = np.array(embeddings).astype('float32')
    
    index = faiss.IndexFlatL2(embeddings.shape[1])
    index.add(embeddings)
    
    query = "Identify financial risks, operational delays, technical vulnerabilities, legal liabilities, compliance issues, and critical roadblocks."
    query_embedding = embed_model.encode([query]).astype('float32')
    
    actual_k = min(k, len(chunks))
    distances, indices = index.search(query_embedding, actual_k)
    
    retrieved_indices = sorted([i for i in indices[0] if i < len(chunks)])
    retrieved_chunks = [chunks[i] for i in retrieved_indices]
    
    avg_distance = float(np.mean(distances[0][:actual_k])) if actual_k > 0 else 0.0
    
    return "\n\n...[Context Gap]...\n\n".join(retrieved_chunks), avg_distance

# ── Knowledge Base Features ───────────────────────────────────────────────────
def add_to_knowledge_base(project_id: str, text: str, doc_id: str):
    if not HAS_RAG or not embed_model or not project_id:
        return
        
    project_kb_dir = KB_DIR / project_id
    project_kb_dir.mkdir(parents=True, exist_ok=True)
    
    index_path = project_kb_dir / "index.faiss"
    chunks_path = project_kb_dir / "chunks.json"
    
    chunks = chunk_text(text, chunk_size=300, overlap=50)
    if not chunks: return
    
    embeddings = embed_model.encode(chunks, show_progress_bar=False).astype('float32')
    
    existing_chunks = []
    if chunks_path.exists():
        try:
            with open(chunks_path, 'r', encoding='utf-8') as f:
                existing_chunks = json.load(f)
        except Exception:
            pass
            
    if index_path.exists():
        index = faiss.read_index(str(index_path))
    else:
        index = faiss.IndexFlatL2(embeddings.shape[1])
        
    index.add(embeddings)
    faiss.write_index(index, str(index_path))
    
    for c in chunks:
        existing_chunks.append({"doc_id": doc_id, "text": c})
        
    with open(chunks_path, 'w', encoding='utf-8') as f:
        json.dump(existing_chunks, f)

def query_knowledge_base(project_id: str, question: str, k: int = 8):
    if not HAS_RAG or not embed_model:
        return []
        
    project_kb_dir = KB_DIR / project_id
    index_path = project_kb_dir / "index.faiss"
    chunks_path = project_kb_dir / "chunks.json"
    
    if not index_path.exists() or not chunks_path.exists():
        return []
        
    try:
        index = faiss.read_index(str(index_path))
        with open(chunks_path, 'r', encoding='utf-8') as f:
            chunks_meta = json.load(f)
    except Exception as e:
        print(f"Error reading knowledge base for {project_id}: {e}")
        return []
        
    query_embedding = embed_model.encode([question]).astype('float32')
    actual_k = min(k, len(chunks_meta))
    if actual_k == 0:
        return []
        
    distances, indices = index.search(query_embedding, actual_k)
    
    results = []
    for dist, idx in zip(distances[0], indices[0]):
        if idx < len(chunks_meta):
            meta = chunks_meta[idx]
            results.append({
                "doc_id": meta["doc_id"],
                "text": meta["text"],
                "distance": float(dist)
            })
    return results


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

# ── Keyword Fallback Engine ───────────────────────────────────────────────────
RISK_KEYWORDS = {
    "critical": {"weight": 10, "keywords": [
        "lawsuit","litigation","fraud","breach","penalty","bankrupt","insolvency",
        "violation","criminal","non-compliance","audit failure","data breach",
        "security breach","unauthorized access","injunction","regulatory action",
        "cease and desist","legal action","termination","contract breach",
    ]},
    "high": {"weight": 6, "keywords": [
        "risk","deadline","overdue","budget overrun","cost overrun","delay",
        "conflict","dispute","liability","debt","loss","shortage","deficiency",
        "warning","escalation","bottleneck","dependency","critical path",
        "resource constraint","scope creep","stakeholder conflict","missed deadline",
    ]},
    "medium": {"weight": 3, "keywords": [
        "concern","issue","problem","challenge","obstacle","uncertainty","unclear",
        "unknown","pending","review","revision","change","mitigation","contingency",
        "assumption","limitation","constraint","gap","missing","incomplete",
    ]},
    "low": {"weight": 1, "keywords": [
        "note","consider","monitor","track","follow-up","reminder","suggestion",
        "recommendation","improvement","optional","future","enhancement",
    ]},
}

def unavailable_response(text: str) -> dict:
    """Fallback state when Groq is unreachable. Returns an 'Unassessed' state."""
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    summary_parts = [s.strip() for s in sentences if len(s.strip()) > 30][:3]
    summary = " ".join(summary_parts)[:500] or "No summary available."
    
    return {
        "summary": summary,
        "risk_level": "Unknown",
        "key_insights": [],
        "recommendations": ["AI analysis unavailable for this document — please retry."],
        "risk_register": {}
    }


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
def call_groq(system_msg: str, user_msg: str, max_tokens: int = 2048) -> dict | None:
    """Centralized function to call Groq API and parse JSON output."""
    if not HAS_GROQ:
        return None
    import time
    import httpx
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
                print(f"--- RAW GROQ RESPONSE (Attempt {attempt}) ---")
                try:
                    print(raw)
                except UnicodeEncodeError:
                    print(raw.encode('ascii', 'replace').decode('ascii'))
                print("---------------------------------------------")
                
                # Strip markdown fences if present
                import re
                raw = raw.strip()
                raw = re.sub(r'^```(?:json)?\s*', '', raw, flags=re.IGNORECASE)
                raw = re.sub(r'\s*```$', '', raw)
                
                try:
                    match = re.search(r'\{.*\}', raw, re.DOTALL)
                    if match:
                        return json.loads(match.group(0))
                    return json.loads(raw)
                except json.JSONDecodeError as e:
                    print(f"JSONDecodeError: {e}")
                    print("Could not parse JSON from raw response.")
                    time.sleep(15 * (attempt + 1))
                    continue
        except Exception as e:
            print(f"ERROR IN call_groq (attempt {attempt}): {e}")
            import traceback
            traceback.print_exc()
            time.sleep(15 * (attempt + 1))
    return None



# ── Multi-Agent Pipeline ──────────────────────────────────────────────────────

# Agent 1: Risk Analyst
# NOTE: The LLM is instructed to extract a maximum of 3 most critical risks per category 
# to cap the risk payload, prevent token overflow, and prevent score dilution.
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
- evidence_quote MUST be cited from the text if is_inferred is false.
- Extract a maximum of 3 most critical risks per category to keep the report concise.
- Return ONLY valid JSON."""

def analyze_with_groq(text: str) -> dict | None:
    retrieved_text, avg_distance = retrieve_context(text, k=10)
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
            
        rr = parsed.get("risk_register", {})
        if isinstance(rr, dict):
            break
        else:
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

def agent_scope_planning(text: str) -> dict | None:
    retrieved_text, _ = retrieve_context(text, k=8)
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

def agent_health(text: str) -> dict | None:
    retrieved_text, _ = retrieve_context(text, k=6)
    prompt = HEALTH_PROMPT.format(text=retrieved_text)
    system_msg = "You are a precise JSON-only health scoring engine. Return ONLY valid JSON."
    
    parsed = None
    for attempt in range(2):
        parsed = call_groq(system_msg, prompt)
        if not parsed:
            continue
            
        hb = parsed.get("health_breakdown", {})
        if isinstance(hb, dict):
            break
            
    return parsed


# Agent 4: Traceability & Missing Docs Agent
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
    {{"requirement": "...", "missing_link": "Task|Testing|Deployment", "reasoning": "..."}}
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
- Never hallucinate traceability gaps if the document is too brief.
"""

def agent_traceability(text: str) -> dict | None:
    retrieved_text, _ = retrieve_context(text, k=6)
    prompt = TRACE_PROMPT.format(text=retrieved_text)
    system_msg = "You are an audit agent. Return ONLY valid JSON."
    return call_groq(system_msg, prompt)


# Agent 3c: Meeting Minutes Agent
MEETING_PROMPT = """You are an AI meeting assistant. Extract meeting minutes, decisions, and action items.

Document content:
\"\"\"
{text}
\"\"\"

Return ONLY valid JSON matching this structure exactly. If this is not a meeting document, return empty arrays.
{{
  "meeting_minutes": "Brief summary of the meeting topics",
  "decisions": ["Key decision 1", "Key decision 2"],
  "action_items": [
    {{"task": "What needs to be done", "owner": "Who is responsible, or 'Unassigned'", "deadline": "When it is due, or 'Unknown'"}}
  ]
}}"""

def agent_meeting(text: str) -> dict | None:
    retrieved_text, _ = retrieve_context(text, k=4)
    prompt = MEETING_PROMPT.format(text=retrieved_text)
    system_msg = "You are a meeting analysis agent. Return ONLY valid JSON."
    return call_groq(system_msg, prompt)


# Agent 4: Health Scorer (Algorithmic & AI Hybrid)
def run_agent_pipeline(text: str) -> dict:
    """Orchestrates the execution of all agents."""
    risk_result = analyze_with_groq(text)
    used_fallback = False
    if not risk_result:
        risk_result = unavailable_response(text)
        used_fallback = True
    
    scope_result = agent_scope_planning(text) or {}
    health_result = agent_health(text) or {"health_breakdown": {"overall": {"score": 0, "reason": "AI analysis unavailable", "evidence": "None", "confidence": None}}}
    trace_result = agent_traceability(text) or {}
    
    
    # Extract AI outputs
    avg_distance = risk_result.pop("_avg_distance", 0.0)
    risks = risk_result.get("risk_register", {})
    if isinstance(risks, list):
        risks = {"technical": risks}
        
    insights = risk_result.get("key_insights", [])
    
    # Compute Risk Score using scoring.py
    flat_risks = []
    mapped_categories = {}
    assessed_count = 0
    
    for cat in ["technical", "timeline", "financial", "operational", "legal"]:
        if cat in risks:
            cat_risks = risks[cat]
            score = scoring.category_score(cat, cat_risks)
            mapped_categories[cat] = score
            if score is not None:
                flat_risks.extend(cat_risks)
                assessed_count += 1
        else:
            mapped_categories[cat] = None
            
    computed_risk_score = scoring.overall_risk_score(mapped_categories)
    risk_coverage_info = {
        "low_coverage": assessed_count < 3,
        "categories_assessed": assessed_count,
        "categories_total": 5
    }
    
    if assessed_count == 0:
        risk_result["risk_level"] = "Unknown"
    else:
        risk_result["risk_level"] = scoring.risk_band(computed_risk_score)
        
    risk_result["risk_score"] = int(computed_risk_score)
    risk_result["risk_register"] = flat_risks
    risks = flat_risks

    # Compute Confidence
    if assessed_count == 0:
        final_confidence = None
    elif not insights:
        final_confidence = scoring.insight_confidence(avg_distance, 0.2) * 100.0
    else:
        conf_sum = 0.0
        for ins in insights:
            cw = scoring.confidence_weight(bool(ins.get("is_inferred")), bool(ins.get("evidence_quote")))
            conf_sum += scoring.insight_confidence(avg_distance, cw)
        final_confidence = (conf_sum / len(insights)) * 100.0
        final_confidence = round(final_confidence)
    # Compute Health Score using scoring.py
    hb = health_result.get("health_breakdown", {})
    axis_scores = {
        "planning": hb.get("planning", {}).get("score") if "planning" in hb else None,
        "documentation": hb.get("documentation", {}).get("score") if "documentation" in hb else None,
        "development": hb.get("development", {}).get("score") if "development" in hb else None,
        "testing": hb.get("testing", {}).get("score") if "testing" in hb else None,
        "risk": max(0, 100 - computed_risk_score) if computed_risk_score is not None else None
    }
    
    llm_axis_keys = ["planning", "documentation", "development", "testing"]
    llm_health_assessed_count = sum(1 for k in llm_axis_keys if axis_scores.get(k) is not None)
    overall_health = scoring.overall_health(axis_scores)
    grade = scoring.grade(overall_health)
    
    health_coverage_info = {
        "low_coverage": llm_health_assessed_count < 3,
        "categories_assessed": llm_health_assessed_count,
        "categories_total": 4
    }
    
    # Merge outputs
    merged = {**risk_result}
    merged["risk_score"] = round(computed_risk_score)
    mapped_categories["_coverage"] = risk_coverage_info
    merged["risk_categories"] = mapped_categories
    merged["confidence_score"] = final_confidence
    merged["project_health"] = {
        "score": round(overall_health),
        "grade": grade,
        "breakdown": hb,
        "health_coverage": health_coverage_info
    }
    
    merged["scope"] = scope_result.get("scope", {"objectives": [], "boundaries": [], "assumptions": []})
    merged["deliverables"] = scope_result.get("deliverables", [])
    merged["blockers"] = scope_result.get("blockers", [])
    merged["schedule_forecast"] = scope_result.get("schedule_forecast", {"risk_level": "low", "delay_factors": [], "recommendations": [], "reasoning": "Missing"})
    
    # New AI Traceability features
    merged["missing_documentation"] = trace_result.get("missing_documentation", [])
    merged["traceability_gaps"] = trace_result.get("traceability_gaps", [])
    merged["sprint_summary"] = trace_result.get("sprint_analysis", {})
    merged["document_summary"] = trace_result.get("document_summary", {})
    
    merged["analysis_source"] = "keyword_fallback" if used_fallback else "groq_pipeline"
    
    return merged



# ── API Endpoints ─────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {
        "status": "running",
        "version": "3.0.0",
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
async def analyze_file(file: UploadFile = File(...), projectId: Optional[str] = Form(None)):
    """
    Core AI analysis endpoint — Multi-Agent Pipeline
    """
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

    # Orchestrate Multi-Agent Pipeline
    result = run_agent_pipeline(extracted_text)
    analysis_source = result.pop("analysis_source", "groq_pipeline" if HAS_GROQ else "keyword_fallback")
    
    # Store in knowledge base
    if projectId:
        add_to_knowledge_base(projectId, extracted_text, 'auto')

    processing_time_ms = round((time.time() - start) * 1000, 2)

    response = {
        "status": "success",
        "filename": file.filename,
        "projectId": projectId,
        "word_count": word_count,
        "processing_time_ms": processing_time_ms,
        "analysis_source": analysis_source,
        "extracted_text": extracted_text[:5000],
    }
    response.update(result)
    return response


class ChatRequest(BaseModel):
    project_id: str
    question: str
    context_override: Optional[str] = None

@app.post("/chat")
def chat(req: ChatRequest):
    """Chat endpoint backed by FAISS knowledge base for project insights."""
    if not HAS_GROQ:
        raise HTTPException(status_code=503, detail="Groq API is required for chat.")
        
    chunks = query_knowledge_base(req.project_id, req.question, k=5)
    
    # If FAISS has no data but backend sent context from the database, use that instead
    if not chunks and req.context_override:
        context_text = req.context_override
        sources = [{"text": req.context_override[:200] + "...", "doc_id": "database", "distance": 0}]
    elif not chunks:
        return {
            "answer": "I don't have enough context from this project's documents to answer that question.",
            "sources": [],
            "grounded": False
        }
    else:
        context_text = "\n\n".join([c["text"] for c in chunks])
        sources = chunks
    
    system_msg = "You are a project intelligence assistant. Answer questions ONLY based on the provided document context. If the context doesn't contain the answer, say so."
    user_msg = f"Context:\n{context_text}\n\nQuestion: {req.question}"
    
    # We use a custom call block because call_groq parses JSON, but we just want text here
    # So we write a small inline POST to groq for a normal text response
    try:
        with httpx.Client(timeout=60.0) as client:
            resp = client.post(
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
                    "temperature": 0.3,
                    "max_tokens": 1024,
                }
            )
            resp.raise_for_status()
            answer = resp.json()["choices"][0]["message"]["content"].strip()
            
            return {
                "answer": answer,
                "sources": sources,
                "grounded": True
            }
    except Exception as e:
        print(f"Groq API failed during /chat: {e}")
        fallback_answer = "⚠️ AI is temporarily unavailable. Here are the most relevant excerpts from your documents for your question."
        return {
            "answer": fallback_answer,
            "sources": sources,
            "grounded": True
        }
class GenerateRequest(BaseModel):
    project_id: str
    doc_type: str
    context_override: Optional[str] = None

@app.post("/generate")
def generate_document(req: GenerateRequest):
    """Generates a cohesive document by synthesizing context from the project knowledge base."""
    try:
        if not HAS_GROQ:
            raise HTTPException(status_code=503, detail="Groq API is required for generation.")
            
        # We query FAISS with a broad generic query to get a wide slice of project context.
        # K=10 limits the token payload to help stay within free-tier limits.
        chunks = query_knowledge_base(req.project_id, "project overview requirements risks scope action items", k=10)
        
        if not chunks and req.context_override:
            context_text = req.context_override
        elif not chunks:
            raise HTTPException(status_code=404, detail="No project context found to generate document.")
        else:
            context_text = "\n\n".join([c["text"] for c in chunks])
            
        system_msg = "You are an expert project manager and technical writer. Generate a comprehensive, professional document based ONLY on the provided project context. Output ONLY Markdown."
        
        prompts = {
            "user_stories": "Synthesize all requirements, features, and scope from the context into a comprehensive Master User Story Backlog. Format as a Markdown document with clear Epics (H2) and User Stories (bullet points in format 'As a [role], I want to [action] so that [benefit]'). Include acceptance criteria if possible.",
            "risk_register": "Synthesize all risks, warnings, blockers, and constraints from the context into a Master Risk Register. Format as a Markdown document with a summary, followed by a detailed list or table of risks (ID, Description, Category, Probability, Impact, Mitigation, Owner).",
            "action_items": "Synthesize all pending tasks, next steps, and action items from the context into a Master Action Item List. Format as a Markdown document grouped by category or owner, with clear checkboxes or bullet points.",
            "srs": "Synthesize all context into a formal Software Requirements Specification (SRS) outline. Include sections for: 1. Introduction & Purpose, 2. Overall Description, 3. System Features, 4. Non-Functional Requirements. Format as a clean Markdown document."
        }
        
        task_prompt = prompts.get(req.doc_type, "Summarize the project context into a clear executive summary.")
        user_msg = f"Context:\n{context_text}\n\nTask: {task_prompt}"
        
        max_retries = 3
        for attempt in range(max_retries):
            try:
                with httpx.Client(timeout=120.0) as client:
                    resp = client.post(
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
                            "temperature": 0.2,
                            "max_tokens": 3000,
                        }
                    )
                    resp.raise_for_status()
                    content = resp.json()["choices"][0]["message"]["content"].strip()
                    return {"markdown": content}
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 429 and attempt < max_retries - 1:
                    print(f"Rate limit hit (429). Retrying in 5 seconds (Attempt {attempt + 1}/{max_retries})...")
                    time.sleep(5)
                else:
                    raise e
            except Exception as e:
                if attempt < max_retries - 1:
                    print(f"Error calling Groq: {e}. Retrying in 5 seconds (Attempt {attempt + 1}/{max_retries})...")
                    time.sleep(5)
                else:
                    raise e
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in /generate: {str(e)}")
        fallback_content = "⚠️ AI synthesis unavailable — showing raw relevant source excerpts instead.\n\n"
        if chunks:
            fallback_content += "---\n\n".join([f"**Excerpt:**\n{c['text']}" for c in chunks])
        else:
            fallback_content += context_text
        return {"markdown": fallback_content}
