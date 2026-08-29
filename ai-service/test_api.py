"""
test_api.py — Runs the real FastAPI endpoints.

test_engines.py covers the deterministic maths. This covers the HTTP layer:
routing, validation, request models, graceful degradation and the fallback
paths. It uses FastAPI's TestClient, so no server process is needed.

Groq and FAISS are deliberately absent here, which is the point — this proves
the service still returns useful output when the AI is unreachable and the
optional heavy dependencies are not installed.

Run from the ai-service directory:  python test_api.py
"""

import io
import os
import sys

os.environ.pop("GROQ_API_KEY", None)  # force the offline path

from fastapi.testclient import TestClient  # noqa: E402
import main  # noqa: E402

client = TestClient(main.app)

passed = 0
failed = 0


def check(label, condition, detail=""):
    global passed, failed
    if condition:
        passed += 1
        print("  PASS  " + label)
    else:
        failed += 1
        print("  FAIL  " + label + ((" — " + str(detail)) if detail else ""))


TASK_CSV = b"""Task,Assignee,Status,Due Date,Progress,Depends On
Design schema,Priya,Done,2026-07-01,100,
Build API,Rahul,In Progress,2026-08-10,60,Design schema
Write tests,Sara,Not Started,2026-08-20,0,Build API
"""

MEETING_NOTES = b"""Sprint sync meeting
Attendees: Priya, Rahul, Sara
Agenda: vendor delay, budget

Discussed the vendor contract dispute. We are two weeks behind schedule.
Decision: escalate to procurement.
Action item: Priya to call the vendor by Friday.
"""


# ── Health ──────────────────────────────────────────────────────────────────
print("\nHealth endpoint")
r = client.get("/health")
check("returns 200", r.status_code == 200, r.status_code)
body = r.json()
check("reports running", body.get("status") == "running")
check("reports the version", body.get("version") == "3.1.0", body.get("version"))
check("reports groq disabled", body.get("groq_enabled") is False)
check("declares capability flags", all(
    k in body for k in ("pdf_extraction", "docx_extraction", "rag_enabled")))


# ── Upload validation ───────────────────────────────────────────────────────
print("\nUpload validation")
r = client.post("/analyze", files={"file": ("virus.exe", b"MZ", "application/octet-stream")})
check("rejects an unsupported extension", r.status_code == 400, r.status_code)
check("explains which types are allowed", "Allowed" in r.json().get("detail", ""))

r = client.post("/analyze")
check("requires a file", r.status_code == 422, r.status_code)


# ── Analysis: keyword fallback path ─────────────────────────────────────────
print("\nAnalysis without Groq (keyword fallback)")
r = client.post(
    "/analyze",
    files={"file": ("notes.txt", MEETING_NOTES, "text/plain")},
    data={"projectId": "p-test"},
)
check("returns 200", r.status_code == 200, r.status_code)
data = r.json()
check("labels the fallback honestly", data.get("analysis_source") == "keyword_fallback",
      data.get("analysis_source"))
check("still produces a summary", bool(data.get("summary")))
check("counts words", data.get("word_count", 0) > 10, data.get("word_count"))
check("returns a risk score", isinstance(data.get("risk_score"), int))
check("finds evidence-backed risks", len(data.get("risk_register", [])) > 0)
check("every fallback risk cites a quote",
      all(risk.get("evidence_quote") for risk in data.get("risk_register", [])))
check("includes the five risk categories",
      all(c in data.get("risk_categories", {})
          for c in ("technical", "timeline", "financial", "operational", "legal")))
check("reports coverage", "_coverage" in data.get("risk_categories", {}))
check("health block present", "project_health" in data)
check("schedule present", "schedule_forecast" in data)
check("prose has no tasks, so the schedule says so",
      data["schedule_forecast"].get("status") == "insufficient_data",
      data["schedule_forecast"].get("status"))
check("names the agents that ran", isinstance(data.get("agents_run"), list))
check("keys are stable for the client",
      all(k in data for k in ("risk_level", "recommendations", "key_insights",
                              "deliverables", "blockers", "user_stories",
                              "missing_documentation", "traceability_gaps")))


# ── CSV: structured task parsing end to end ─────────────────────────────────
print("\nTask-list CSV through the API")
r = client.post(
    "/analyze",
    files={"file": ("tasks.csv", TASK_CSV, "text/csv")},
    data={"projectId": "p-test", "documentId": "doc-1"},
)
check("returns 200", r.status_code == 200, r.status_code)
data = r.json()
check("parses the task list", data.get("task_parse_status") == "parsed",
      data.get("task_parse_status"))
check("returns structured tasks", len(data.get("tasks", [])) == 3, len(data.get("tasks", [])))
sched = data.get("schedule_forecast", {})
check("computes a schedule from the CSV", sched.get("status") == "computed", sched.get("status"))
check("detects overdue work", len(sched.get("overdue", [])) > 0)
check("computes a critical path", len(sched.get("critical_path", {}).get("path", [])) > 1)
check("projects a completion date", bool(sched.get("projected_completion")))
check("echoes the document id", data.get("documentId") == "doc-1")


# ── Chat and generate require Groq ──────────────────────────────────────────
print("\nEndpoints that need Groq")
r = client.post("/chat", json={"project_id": "p-test", "question": "What are the risks?"})
check("chat reports the dependency clearly", r.status_code == 503, r.status_code)

r = client.post("/chat", json={"project_id": "p-test"})
check("chat validates its body", r.status_code == 422, r.status_code)

r = client.post("/chat", json={
    "project_id": "p", "question": "q",
    "history": [{"role": "user", "content": "earlier"}],
})
# History is now part of the model, so it must not be rejected as an extra field.
check("chat accepts conversation history", r.status_code == 503, r.status_code)

r = client.post("/generate", json={"project_id": "p-test", "doc_type": "srs"})
check("generate reports the dependency", r.status_code == 503, r.status_code)

r = client.post("/analyze-project", json={"project_id": "no-such-project"})
check("project analysis 404s without context", r.status_code == 404, r.status_code)


# ── Knowledge base endpoints ────────────────────────────────────────────────
print("\nKnowledge base")
r = client.get("/kb/p-test")
check("kb status returns 200", r.status_code == 200, r.status_code)
kb = r.json()
check("reports the project", kb.get("project_id") == "p-test")
check("reports a chunk count", "chunks" in kb)
check("lists documents", isinstance(kb.get("documents"), list))

r = client.delete("/kb/p-test/document/doc-1")
check("deleting a document chunk set returns 200", r.status_code == 200, r.status_code)
check("reports how many chunks went", "chunks_removed" in r.json())

r = client.delete("/kb/p-test")
check("deleting a project kb returns 200", r.status_code == 200, r.status_code)


# ── Agent gating ────────────────────────────────────────────────────────────
print("\nAgent gating heuristics")
check("meeting notes trigger the meeting agent",
      main.looks_like_meeting_notes(MEETING_NOTES.decode()) is True)
check("a task CSV does not", main.looks_like_meeting_notes(TASK_CSV.decode()) is False)
check("an SRS triggers the story agent",
      main.has_requirements("The system shall log in users. Requirement 2: the system must "
                            "audit events. Acceptance criteria are listed per feature.") is True)
check("small talk does not", main.has_requirements("Hello there, nice weather today.") is False)


# ── Register normalisation ──────────────────────────────────────────────────
print("\nRisk register normalisation")
# A risk filed under "timeline" but self-labelled "schedule" used to be dropped
# from the saved register entirely.
mismatched = {"timeline": [{"title": "Slip", "category": "schedule",
                            "probability": "high", "impact": "high",
                            "evidence_quote": "we are late"}]}
normalised = main._normalise_register(mismatched)
check("keeps a mislabelled risk", len(normalised["timeline"]) == 1)
check("rewrites the category to its bucket",
      normalised["timeline"][0]["category"] == "timeline",
      normalised["timeline"][0]["category"])

as_list = main._normalise_register([{"title": "X", "category": "legal"}])
check("accepts a flat list too", len(as_list["legal"]) == 1)
check("never loses the five keys",
      set(main._normalise_register({}).keys()) ==
      {"technical", "timeline", "financial", "operational", "legal"})


# ── Summary ─────────────────────────────────────────────────────────────────
print("\n" + "-" * 52)
print("{} passed, {} failed".format(passed, failed))
sys.exit(1 if failed else 0)
