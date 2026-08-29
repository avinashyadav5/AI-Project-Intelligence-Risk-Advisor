"""
schedule.py — Deterministic schedule & delivery forecasting.

Previously the schedule forecast was an LLM narrative with no date arithmetic,
and the Milestone/TaskDependency data already in Postgres was never used. This
module does the actual maths: overdue detection, dependency critical path,
slippage projection and a schedule risk score.

It is deterministic — same input, same output — so the forecast can be defended
in a viva. The LLM still adds qualitative delay factors on top; the numbers
come from here.
"""

from datetime import date, datetime, timedelta
from typing import Optional

DUE_SOON_WINDOW_DAYS = 7


def _to_date(value) -> Optional[date]:
    if not value:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    s = str(value).strip()
    for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%S.%fZ",
                "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    if len(s) >= 10:
        try:
            return datetime.strptime(s[:10], "%Y-%m-%d").date()
        except ValueError:
            return None
    return None


def _index_tasks(tasks: list) -> dict:
    """Index by lowercased name and by id so dependencies can be resolved either way."""
    index = {}
    for t in tasks:
        name = (t.get("name") or "").strip().lower()
        if name:
            index.setdefault(name, t)
        tid = t.get("id")
        if tid:
            index.setdefault(str(tid).lower(), t)
    return index


def _duration_days(task: dict, index: Optional[dict] = None) -> int:
    """
    Estimated duration for critical-path length, best available source first:
      1. explicit start → due window
      2. an effort/estimate column
      3. the gap between the latest predecessor's due date and this task's due
      4. one day
    """
    start = _to_date(task.get("start_date"))
    due = _to_date(task.get("due_date"))
    if start and due and due >= start:
        return max(1, (due - start).days)

    effort = task.get("effort")
    if effort:
        digits = "".join(ch for ch in str(effort) if ch.isdigit())
        if digits:
            return max(1, min(365, int(digits)))

    if due and index:
        predecessor_dues = []
        for dep_ref in (task.get("depends_on") or []):
            dep = index.get(str(dep_ref).strip().lower())
            dep_due = _to_date(dep.get("due_date")) if dep else None
            if dep_due:
                predecessor_dues.append(dep_due)
        if predecessor_dues:
            gap = (due - max(predecessor_dues)).days
            if gap > 0:
                return min(365, gap)

    return 1


def _critical_path(tasks: list) -> dict:
    """
    Longest dependency chain by cumulative duration.

    Cycles are broken by refusing to revisit a node on the current path, so a
    malformed dependency list degrades instead of hanging.
    """
    if not tasks:
        return {"path": [], "length_days": 0, "note": "No tasks available."}

    index = _index_tasks(tasks)
    memo = {}

    def key_of(task):
        return (task.get("id") or task.get("name") or "").strip().lower()

    def longest(task, visiting):
        k = key_of(task)
        if k in memo:
            return memo[k]
        if k in visiting:
            # Dependency cycle — stop here rather than recursing forever.
            return _duration_days(task, index), [task.get("name")]
        visiting.add(k)

        best_len, best_path = 0, []
        for dep_ref in (task.get("depends_on") or []):
            dep = index.get(str(dep_ref).strip().lower())
            if not dep or key_of(dep) == k:
                continue
            dep_len, dep_path = longest(dep, visiting)
            if dep_len > best_len:
                best_len, best_path = dep_len, dep_path

        visiting.discard(k)
        total = best_len + _duration_days(task, index)
        result = (total, best_path + [task.get("name")])
        memo[k] = result
        return result

    best_total, best_path = 0, []
    for t in tasks:
        total, path = longest(t, set())
        if total > best_total:
            best_total, best_path = total, path

    has_deps = any(t.get("depends_on") for t in tasks)
    return {
        "path": best_path,
        "length_days": best_total,
        "note": "Longest dependency chain by estimated duration."
                if has_deps else "No dependencies recorded — chain is the single longest task.",
    }


def forecast(tasks: list, today: Optional[date] = None) -> dict:
    """
    Build a schedule forecast from structured tasks.

    Each task: {name, status, due_date, start_date, progress, owner, depends_on, effort}
    Statuses expected: completed | in_progress | blocked | not_started
    """
    today = today or date.today()
    tasks = [t for t in (tasks or []) if t and t.get("name")]

    if not tasks:
        return {
            "status": "insufficient_data",
            "risk_level": "Unknown",
            "schedule_risk_score": None,
            "reasoning": "No task list or milestone data available, so the schedule cannot be computed.",
            "delay_factors": ["Schedule cannot be predicted — no tasks or deadlines supplied."],
            "recommendations": ["Upload a task list (CSV) or add milestones with due dates to enable schedule forecasting."],
            "totals": {"total": 0, "completed": 0, "in_progress": 0, "blocked": 0, "not_started": 0},
            "overdue": [], "due_soon": [], "blocked_tasks": [], "unscheduled": [],
            "critical_path": {"path": [], "length_days": 0, "note": "No tasks available."},
            "projected_completion": None,
            "baseline_completion": None,
            "projected_slip_days": 0,
            "computed_on": today.isoformat(),
        }

    totals = {"total": len(tasks), "completed": 0, "in_progress": 0, "blocked": 0, "not_started": 0}
    overdue, due_soon, blocked_tasks, unscheduled = [], [], [], []
    dated_tasks = 0
    latest_due = None
    max_overdue_days = 0
    overdue_day_sum = 0

    for t in tasks:
        status = (t.get("status") or "not_started").lower()
        if status not in totals:
            status = "not_started"
        totals[status] += 1

        due = _to_date(t.get("due_date"))
        if due:
            dated_tasks += 1
            if latest_due is None or due > latest_due:
                latest_due = due
        else:
            unscheduled.append(t.get("name"))

        entry = {
            "name": t.get("name"),
            "owner": t.get("owner") or "Unassigned",
            "due_date": due.isoformat() if due else None,
            "status": status,
            "progress": t.get("progress", 0),
        }

        if status == "blocked":
            blocked_tasks.append(entry)

        if due and status != "completed":
            delta = (today - due).days
            if delta > 0:
                entry["days_overdue"] = delta
                overdue.append(entry)
                overdue_day_sum += delta
                max_overdue_days = max(max_overdue_days, delta)
            elif 0 <= -delta <= DUE_SOON_WINDOW_DAYS:
                entry["days_remaining"] = -delta
                due_soon.append(entry)

    overdue.sort(key=lambda e: e.get("days_overdue", 0), reverse=True)
    due_soon.sort(key=lambda e: e.get("days_remaining", 0))

    critical_path = _critical_path(tasks)

    # ── Projection ────────────────────────────────────────────────────────────
    # Slip is driven by the worst overdue item, softened by the average overdue
    # across the incomplete backlog. Blocked work adds a flat penalty because a
    # blocked task has no measurable burn-down.
    incomplete = totals["in_progress"] + totals["not_started"] + totals["blocked"]
    avg_overdue = (overdue_day_sum / len(overdue)) if overdue else 0
    slip = 0
    if overdue:
        slip = round(max_overdue_days * 0.6 + avg_overdue * 0.4)
    slip += totals["blocked"] * 3
    if unscheduled and incomplete:
        # Undated remaining work is itself a delivery risk; charge a day each,
        # capped so a large unscheduled backlog doesn't dominate the estimate.
        slip += min(len(unscheduled), 10)

    baseline_completion = latest_due
    projected_completion = None
    if baseline_completion:
        projected_completion = max(baseline_completion, today) + timedelta(days=slip)

    # ── Schedule risk score (0–100, deterministic) ────────────────────────────
    score = 0.0
    if incomplete > 0:
        score += 40.0 * (len(overdue) / incomplete)          # how much is late
        score += 20.0 * (totals["blocked"] / incomplete)      # how much is stuck
    score += min(20.0, max_overdue_days * 1.5)               # how late the worst item is
    if dated_tasks == 0:
        score += 20.0                                        # no deadlines at all
    elif unscheduled:
        score += 10.0 * (len(unscheduled) / len(tasks))      # partial coverage
    completion_ratio = totals["completed"] / len(tasks)
    if completion_ratio < 0.25 and len(due_soon) > 0:
        score += 10.0                                        # deadlines close, little done
    score = round(max(0.0, min(100.0, score)))

    risk_level = ("Critical" if score >= 70 else
                  "High" if score >= 45 else
                  "Medium" if score >= 20 else "Low")

    # ── Explanations ──────────────────────────────────────────────────────────
    delay_factors = []
    if overdue:
        worst = overdue[0]
        delay_factors.append(
            f"{len(overdue)} task(s) past their due date; the worst is "
            f"\"{worst['name']}\" at {worst['days_overdue']} days overdue."
        )
    if blocked_tasks:
        delay_factors.append(
            f"{len(blocked_tasks)} task(s) are blocked: "
            + ", ".join(b["name"] for b in blocked_tasks[:3]) + "."
        )
    if unscheduled:
        delay_factors.append(
            f"{len(unscheduled)} task(s) have no due date, so their impact on delivery is unmeasured."
        )
    if critical_path["length_days"] > 0 and len(critical_path["path"]) > 1:
        delay_factors.append(
            f"Critical path spans {len(critical_path['path'])} dependent tasks "
            f"({critical_path['length_days']} days); any slip on it moves the end date directly."
        )
    if not delay_factors:
        delay_factors.append("No overdue, blocked or undated work detected in the supplied tasks.")

    recommendations = []
    if overdue:
        recommendations.append(
            f"Re-baseline or escalate the {len(overdue)} overdue task(s), starting with \"{overdue[0]['name']}\"."
        )
    if blocked_tasks:
        recommendations.append("Hold a blocker review — assign an owner and an unblock date to each blocked task.")
    if unscheduled:
        recommendations.append("Assign due dates to the undated tasks so the forecast covers the whole backlog.")
    if len(critical_path["path"]) > 1:
        recommendations.append(
            "Protect the critical path: " + " → ".join(str(p) for p in critical_path["path"][:5]) + "."
        )
    if not recommendations:
        recommendations.append("Schedule is on track — keep the current cadence and re-check after the next sprint.")

    reasoning = (
        f"Computed from {len(tasks)} task(s) as of {today.isoformat()}: "
        f"{totals['completed']} completed, {totals['in_progress']} in progress, "
        f"{totals['blocked']} blocked, {totals['not_started']} not started. "
        f"{len(overdue)} overdue, {len(due_soon)} due within {DUE_SOON_WINDOW_DAYS} days, "
        f"{len(unscheduled)} without a due date. "
        + (f"Latest due date is {baseline_completion.isoformat()}; projected finish is "
           f"{projected_completion.isoformat()} ({slip} day slip)."
           if baseline_completion else "No due dates were supplied, so no end date could be projected.")
    )

    return {
        "status": "computed",
        "risk_level": risk_level,
        "schedule_risk_score": score,
        "reasoning": reasoning,
        "delay_factors": delay_factors,
        "recommendations": recommendations,
        "totals": totals,
        "overdue": overdue,
        "due_soon": due_soon,
        "blocked_tasks": blocked_tasks,
        "unscheduled": unscheduled,
        "critical_path": critical_path,
        "baseline_completion": baseline_completion.isoformat() if baseline_completion else None,
        "projected_completion": projected_completion.isoformat() if projected_completion else None,
        "projected_slip_days": slip,
        "computed_on": today.isoformat(),
    }


def merge_with_llm(computed: dict, llm_forecast: dict) -> dict:
    """
    Combine the deterministic forecast with the LLM's qualitative reading.

    Numbers always come from `computed`. The LLM may only add narrative delay
    factors and recommendations it found in the documents, which is where it
    genuinely adds value (e.g. "vendor contract renewal is unsigned").
    """
    merged = dict(computed)
    if not isinstance(llm_forecast, dict):
        return merged

    llm_factors = [f for f in (llm_forecast.get("delay_factors") or [])
                   if isinstance(f, str) and f.strip()
                   and "cannot be predicted" not in f.lower()]
    llm_recs = [r for r in (llm_forecast.get("recommendations") or [])
                if isinstance(r, str) and r.strip()]

    if computed.get("status") == "insufficient_data":
        # No task data: the LLM narrative is all we have, so surface it.
        if llm_factors:
            merged["delay_factors"] = llm_factors
        if llm_recs:
            merged["recommendations"] = llm_recs
        if llm_forecast.get("reasoning"):
            merged["narrative_reasoning"] = llm_forecast["reasoning"]
        if llm_forecast.get("risk_level"):
            merged["risk_level"] = str(llm_forecast["risk_level"]).capitalize()
        merged["source"] = "llm_only"
        return merged

    merged["delay_factors"] = computed["delay_factors"] + [
        f for f in llm_factors if f not in computed["delay_factors"]
    ][:4]
    merged["recommendations"] = computed["recommendations"] + [
        r for r in llm_recs if r not in computed["recommendations"]
    ][:4]
    if llm_forecast.get("reasoning"):
        merged["narrative_reasoning"] = llm_forecast["reasoning"]
    merged["source"] = "deterministic+llm"
    return merged
