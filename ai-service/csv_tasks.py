"""
csv_tasks.py — Structured task-list ingestion.

Fixes the gap where uploaded task-list CSVs were decoded as a flat string and
handed to the LLM as prose. Task lists are one of the five input types the
project must support, so they are parsed into structured rows here and fed to
the deterministic schedule engine (schedule.py).

Nothing in this module calls an LLM. It is pure parsing, so results are stable
and explainable.
"""

import csv
import io
import re
from datetime import datetime, date
from typing import Optional

# ── Column detection ──────────────────────────────────────────────────────────
# Header aliases seen in real exports (Jira, Trello, Asana, MS Project, plain
# spreadsheets). Matching is case-insensitive on normalised header text.
COLUMN_ALIASES = {
    "name": ["task", "task name", "title", "summary", "activity", "item",
             "deliverable", "work item", "milestone", "story", "subject"],
    "owner": ["owner", "assignee", "assigned to", "responsible", "resource",
              "developer", "person", "lead"],
    "status": ["status", "state", "progress status", "stage", "workflow status"],
    "due_date": ["due", "due date", "deadline", "end date", "finish",
                 "finish date", "target date", "completion date", "end"],
    "start_date": ["start", "start date", "begin", "begin date", "planned start"],
    "progress": ["progress", "percent", "percent complete", "% complete",
                 "completion", "pct", "done %"],
    "priority": ["priority", "severity", "importance", "urgency"],
    "depends_on": ["depends on", "dependency", "dependencies", "blocked by",
                   "predecessor", "predecessors", "parent"],
    "effort": ["effort", "estimate", "story points", "points", "duration",
               "days", "hours"],
}

DATE_FORMATS = [
    "%Y-%m-%d", "%d-%m-%Y", "%m/%d/%Y", "%d/%m/%Y", "%Y/%m/%d",
    "%d %b %Y", "%d %B %Y", "%b %d, %Y", "%B %d, %Y",
    "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%d-%b-%Y", "%m/%d/%y",
]

DONE_WORDS = {"done", "complete", "completed", "closed", "finished", "shipped",
              "resolved", "delivered", "merged", "accepted"}
ACTIVE_WORDS = {"in progress", "in-progress", "wip", "doing", "started",
                "active", "ongoing", "in review", "review", "testing"}
BLOCKED_WORDS = {"blocked", "on hold", "hold", "stalled", "waiting", "impeded",
                 "at risk", "paused"}
# Checked before ACTIVE_WORDS: "not started" contains "started", and "backlog"
# style statuses must not be read as work in flight.
NOT_STARTED_WORDS = {"not started", "not-started", "notstarted", "todo", "to do",
                     "to-do", "backlog", "new", "open", "planned", "pending start",
                     "not begun", "queued", "upcoming", "unstarted"}


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9% ]+", " ", (s or "").strip().lower()).strip()


def _match_column(header: str) -> Optional[str]:
    """Map a raw CSV header to a canonical field name, or None."""
    h = _norm(header)
    if not h:
        return None
    for field, aliases in COLUMN_ALIASES.items():
        if h == field or h in aliases:
            return field
    # Loose contains-match as a second pass, longest alias wins.
    best, best_len = None, 0
    for field, aliases in COLUMN_ALIASES.items():
        for alias in aliases + [field]:
            if alias in h and len(alias) > best_len:
                best, best_len = field, len(alias)
    return best


def parse_date(value: str) -> Optional[date]:
    """Parse a date cell using the formats that actually appear in exports."""
    if not value:
        return None
    v = str(value).strip()
    if not v or v.lower() in {"n/a", "na", "none", "tbd", "-", "unknown", ""}:
        return None
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(v, fmt).date()
        except ValueError:
            continue
    # ISO-ish string with a timezone or milliseconds attached
    m = re.match(r"(\d{4}-\d{2}-\d{2})", v)
    if m:
        try:
            return datetime.strptime(m.group(1), "%Y-%m-%d").date()
        except ValueError:
            return None
    return None


def _parse_progress(value: str) -> Optional[int]:
    if value is None:
        return None
    m = re.search(r"(\d{1,3})\s*%?", str(value))
    if not m:
        return None
    n = int(m.group(1))
    return max(0, min(100, n))


def normalise_status(raw_status: str, progress: Optional[int]) -> str:
    """Collapse free-text status into: completed | in_progress | blocked | not_started."""
    s = _norm(raw_status)
    if s:
        if any(w in s for w in BLOCKED_WORDS):
            return "blocked"
        # Negated statuses first — "not started" would otherwise match "started",
        # and "not complete" would otherwise match "complete".
        if any(w in s for w in NOT_STARTED_WORDS) or s.startswith("not "):
            return "not_started"
        if any(w in s for w in DONE_WORDS):
            return "completed"
        if any(w in s for w in ACTIVE_WORDS):
            return "in_progress"
    if progress is not None:
        if progress >= 100:
            return "completed"
        if progress > 0:
            return "in_progress"
    return "not_started"


def _split_dependencies(value: str) -> list:
    if not value:
        return []
    parts = re.split(r"[,;/|]| and ", str(value))
    return [p.strip() for p in parts if p.strip() and p.strip().lower() not in {"none", "n/a", "-"}]


def looks_like_csv(text: str) -> bool:
    """Cheap check so we don't try to parse a prose document as a table."""
    if not text:
        return False
    head = "\n".join(text.strip().splitlines()[:5])
    if not head:
        return False
    for delim in [",", "\t", ";"]:
        counts = [line.count(delim) for line in head.splitlines() if line.strip()]
        if counts and min(counts) >= 1 and len(set(counts)) <= 2:
            return True
    return False


def parse_tasks(text: str) -> dict:
    """
    Parse CSV/TSV text into structured tasks.

    Returns {"tasks": [...], "detected_columns": {...}, "parse_status": "..."}.
    Never raises — a document that isn't a task list simply yields zero tasks.
    """
    empty = {"tasks": [], "detected_columns": {}, "parse_status": "not_a_task_list"}
    if not text or not looks_like_csv(text):
        return empty

    try:
        sample = text[:4096]
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
        except csv.Error:
            dialect = csv.excel
        reader = csv.reader(io.StringIO(text), dialect)
        rows = [r for r in reader if any((c or "").strip() for c in r)]
    except Exception:
        return empty

    if len(rows) < 2:
        return empty

    header = rows[0]
    mapping = {}
    for idx, col in enumerate(header):
        field = _match_column(col)
        if field and field not in mapping:
            mapping[field] = idx

    # A table with no recognisable task name column is some other kind of data.
    if "name" not in mapping:
        return {"tasks": [], "detected_columns": {}, "parse_status": "no_task_column"}

    tasks = []
    for row in rows[1:]:
        def cell(field):
            i = mapping.get(field)
            if i is None or i >= len(row):
                return ""
            return (row[i] or "").strip()

        name = cell("name")
        if not name:
            continue

        progress = _parse_progress(cell("progress"))
        raw_status = cell("status")
        due = parse_date(cell("due_date"))
        start = parse_date(cell("start_date"))

        tasks.append({
            "name": name,
            "owner": cell("owner") or "Unassigned",
            "raw_status": raw_status or "",
            "status": normalise_status(raw_status, progress),
            "progress": progress if progress is not None else (100 if normalise_status(raw_status, progress) == "completed" else 0),
            "due_date": due.isoformat() if due else None,
            "start_date": start.isoformat() if start else None,
            "priority": cell("priority") or None,
            "depends_on": _split_dependencies(cell("depends_on")),
            "effort": cell("effort") or None,
        })

    return {
        "tasks": tasks,
        "detected_columns": {k: header[v] for k, v in mapping.items() if v < len(header)},
        "parse_status": "parsed" if tasks else "no_rows",
    }


def tasks_to_text(parsed: dict) -> str:
    """
    Render parsed tasks back into a compact, LLM-friendly block.

    The agents still get to reason over the task list, but they now see clean,
    labelled fields instead of raw comma soup.
    """
    tasks = parsed.get("tasks") or []
    if not tasks:
        return ""
    lines = [f"STRUCTURED TASK LIST ({len(tasks)} tasks parsed from the uploaded file):"]
    for t in tasks:
        bits = [f"- {t['name']}", f"owner: {t['owner']}", f"status: {t['status']}"]
        if t.get("due_date"):
            bits.append(f"due: {t['due_date']}")
        if t.get("progress") is not None:
            bits.append(f"progress: {t['progress']}%")
        if t.get("priority"):
            bits.append(f"priority: {t['priority']}")
        if t.get("depends_on"):
            bits.append(f"depends on: {', '.join(t['depends_on'])}")
        lines.append(" | ".join(bits))
    return "\n".join(lines)
