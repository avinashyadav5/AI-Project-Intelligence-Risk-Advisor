"""
test_engines.py — Verifies the deterministic parts of the pipeline.

The previous test_determinism.py did not parse (escaped triple quotes, a BOM)
and called run_agent_pipeline with a `plan` argument that no longer exists, so
it had never run.

This replaces it. It exercises the components that must be reproducible —
CSV parsing, schedule forecasting, keyword fallback and scoring — and asserts
identical output across repeated runs. No API key and no network needed.

Run from the ai-service directory:  python test_engines.py
"""

import sys
import json
from datetime import date

import csv_tasks
import schedule as schedule_engine
import keyword_engine
import scoring

FIXED_TODAY = date(2026, 8, 29)

TASK_CSV = """Task,Assignee,Status,Due Date,Progress,Depends On,Priority
Design auth schema,Priya,Done,2026-07-01,100,,High
Build login API,Rahul,In Progress,2026-08-10,60,Design auth schema,High
Write API tests,Sara,Not Started,2026-08-20,0,Build login API,Medium
Deploy to staging,Rahul,Blocked,2026-08-25,0,Write API tests,High
Update SRS doc,Priya,Not Started,,0,,Low
"""

PROSE = (
    "The vendor contract is in dispute and a lawsuit is pending. "
    "We are two weeks behind schedule due to a delay. "
    "Budget overrun of 15 percent is confirmed. "
    "Testing documentation is incomplete."
)

passed = 0
failed = 0


def check(label, condition, detail=""):
    global passed, failed
    if condition:
        passed += 1
        print(f"  PASS  {label}")
    else:
        failed += 1
        print(f"  FAIL  {label}" + (f" — {detail}" if detail else ""))


# ── CSV parsing ───────────────────────────────────────────────────────────────
print("\nCSV task parsing")
parsed = csv_tasks.parse_tasks(TASK_CSV)
tasks = parsed["tasks"]
by_name = {t["name"]: t for t in tasks}

check("status is 'parsed'", parsed["parse_status"] == "parsed", parsed["parse_status"])
check("all five rows parsed", len(tasks) == 5, f"got {len(tasks)}")
check("columns detected", "due_date" in parsed["detected_columns"])
check("'Done' maps to completed", by_name["Design auth schema"]["status"] == "completed")
check("'In Progress' maps to in_progress", by_name["Build login API"]["status"] == "in_progress")
# "not started" contains the substring "started"; the parser must not read it as active work.
check("'Not Started' maps to not_started", by_name["Write API tests"]["status"] == "not_started",
      by_name["Write API tests"]["status"])
check("'Blocked' maps to blocked", by_name["Deploy to staging"]["status"] == "blocked")
check("dates parsed", by_name["Build login API"]["due_date"] == "2026-08-10")
check("empty due date stays None", by_name["Update SRS doc"]["due_date"] is None)
check("dependencies parsed", by_name["Write API tests"]["depends_on"] == ["Build login API"])
check("prose is not parsed as a task list",
      csv_tasks.parse_tasks(PROSE)["parse_status"] == "not_a_task_list")


# ── Schedule forecasting ──────────────────────────────────────────────────────
print("\nSchedule forecasting")
forecast = schedule_engine.forecast(tasks, today=FIXED_TODAY)

check("status is 'computed'", forecast["status"] == "computed")
check("three tasks are overdue", len(forecast["overdue"]) == 3, str(len(forecast["overdue"])))
check("worst overdue is first", forecast["overdue"][0]["name"] == "Build login API")
check("overdue days are correct", forecast["overdue"][0]["days_overdue"] == 19,
      str(forecast["overdue"][0]["days_overdue"]))
check("one blocked task", len(forecast["blocked_tasks"]) == 1)
check("undated task flagged", forecast["unscheduled"] == ["Update SRS doc"])
check("critical path spans four tasks", len(forecast["critical_path"]["path"]) == 4,
      str(forecast["critical_path"]["path"]))
check("critical path uses real durations", forecast["critical_path"]["length_days"] > 1,
      str(forecast["critical_path"]["length_days"]))
check("projected finish is after the baseline",
      forecast["projected_completion"] > forecast["baseline_completion"])
check("risk score is in range", 0 <= forecast["schedule_risk_score"] <= 100)
check("risk level is a known band",
      forecast["risk_level"] in {"Low", "Medium", "High", "Critical"})

empty = schedule_engine.forecast([], today=FIXED_TODAY)
check("no tasks yields insufficient_data", empty["status"] == "insufficient_data")
check("no tasks yields no score", empty["schedule_risk_score"] is None)

# The forecast must be reproducible — this is the property the old test was for.
again = schedule_engine.forecast(tasks, today=FIXED_TODAY)
check("forecast is deterministic across runs", again == forecast)


# ── LLM merge ─────────────────────────────────────────────────────────────────
print("\nDeterministic + LLM merge")
llm = {
    "risk_level": "low",
    "delay_factors": ["Vendor contract renewal is unsigned."],
    "recommendations": ["Escalate the contract to procurement."],
    "reasoning": "Based on the meeting notes.",
}
merged = schedule_engine.merge_with_llm(forecast, llm)

# The model must not be able to talk the computed numbers down.
check("computed risk level survives the merge", merged["risk_level"] == forecast["risk_level"])
check("computed score survives the merge",
      merged["schedule_risk_score"] == forecast["schedule_risk_score"])
check("LLM delay factor is appended",
      "Vendor contract renewal is unsigned." in merged["delay_factors"])
check("merge is labelled", merged["source"] == "deterministic+llm")


# ── Keyword fallback ──────────────────────────────────────────────────────────
print("\nKeyword fallback engine")
fallback = keyword_engine.analyze(PROSE)
register = fallback["risk_register"]

check("all five categories present", set(register.keys()) ==
      {"technical", "timeline", "financial", "operational", "legal"})
check("legal risk detected", len(register["legal"]) > 0)
check("timeline risk detected", len(register["timeline"]) > 0)
check("financial risk detected", len(register["financial"]) > 0)
check("every risk cites evidence",
      all(r["evidence_quote"] for cat in register.values() for r in cat))
check("no risk is marked inferred",
      all(r["is_inferred"] is False for cat in register.values() for r in cat))
check("fallback is deterministic", keyword_engine.analyze(PROSE) == fallback)


# ── Scoring ───────────────────────────────────────────────────────────────────
print("\nScoring")
category_scores = {c: scoring.category_score(c, v) for c, v in register.items()}
overall = scoring.overall_risk_score(category_scores)

check("overall risk is in range", 0 <= overall <= 100, str(overall))
check("band matches the score", scoring.risk_band(overall) in {"Low", "Medium", "High", "Critical"})
check("a quoted risk outweighs an unsupported one",
      scoring.confidence_weight(False, True) > scoring.confidence_weight(False, False))
check("high/high is the maximum severity", scoring.severity("high", "high") == 100.0)
check("low/low is the minimum severity", round(scoring.severity("low", "low"), 2) == 11.11)
check("empty category scores None", scoring.category_score("legal", []) is None)
check("health ignores unassessed axes",
      scoring.overall_health({"planning": 80, "documentation": None,
                              "development": None, "testing": None, "risk": None}) == 80.0)
check("grade boundaries hold",
      (scoring.grade(90), scoring.grade(89), scoring.grade(59)) == ("A", "B", "F"))


# ── Summary ───────────────────────────────────────────────────────────────────
print(f"\n{'-' * 52}")
print(f"{passed} passed, {failed} failed")

if failed == 0:
    print("\nSample forecast:")
    print(json.dumps({
        "risk_level": forecast["risk_level"],
        "schedule_risk_score": forecast["schedule_risk_score"],
        "overdue": len(forecast["overdue"]),
        "blocked": len(forecast["blocked_tasks"]),
        "critical_path": forecast["critical_path"]["path"],
        "baseline_completion": forecast["baseline_completion"],
        "projected_completion": forecast["projected_completion"],
        "projected_slip_days": forecast["projected_slip_days"],
    }, indent=2))

sys.exit(1 if failed else 0)
