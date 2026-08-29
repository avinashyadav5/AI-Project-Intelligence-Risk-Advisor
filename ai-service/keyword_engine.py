"""
keyword_engine.py — Offline fallback analysis.

The keyword dictionary used to sit unused in main.py while the fallback path
returned a bare "Unknown". This module actually runs it: when Groq is
unreachable, the platform still returns evidence-backed risks with real quotes,
a computed risk score, and a summary — just without LLM reasoning.

Everything here is deterministic and cites the sentence it matched, so fallback
output is clearly labelled and never fabricated.
"""

import re

# Severity tiers. `weight` feeds the score; `category` routes each hit into the
# same five-category risk register the LLM pipeline produces.
RISK_KEYWORDS = {
    "critical": {"weight": 10, "keywords": [
        "lawsuit", "litigation", "fraud", "breach", "penalty", "bankrupt", "insolvency",
        "violation", "criminal", "non-compliance", "audit failure", "data breach",
        "security breach", "unauthorized access", "injunction", "regulatory action",
        "cease and desist", "legal action", "termination", "contract breach",
    ]},
    "high": {"weight": 6, "keywords": [
        "risk", "deadline", "overdue", "budget overrun", "cost overrun", "delay",
        "conflict", "dispute", "liability", "debt", "loss", "shortage", "deficiency",
        "warning", "escalation", "bottleneck", "dependency", "critical path",
        "resource constraint", "scope creep", "stakeholder conflict", "missed deadline",
    ]},
    "medium": {"weight": 3, "keywords": [
        "concern", "issue", "problem", "challenge", "obstacle", "uncertainty", "unclear",
        "unknown", "pending", "review", "revision", "change", "mitigation", "contingency",
        "assumption", "limitation", "constraint", "gap", "missing", "incomplete",
    ]},
    "low": {"weight": 1, "keywords": [
        "note", "consider", "monitor", "track", "follow-up", "reminder", "suggestion",
        "recommendation", "improvement", "optional", "future", "enhancement",
    ]},
}

# Which register category a keyword belongs to. Anything unmapped is operational.
CATEGORY_MAP = {
    "legal": ["lawsuit", "litigation", "fraud", "violation", "criminal", "non-compliance",
              "injunction", "regulatory action", "cease and desist", "legal action",
              "contract breach", "liability", "termination", "penalty"],
    "financial": ["budget overrun", "cost overrun", "bankrupt", "insolvency", "debt",
                  "loss", "shortage", "resource constraint"],
    "timeline": ["deadline", "overdue", "delay", "missed deadline", "critical path",
                 "bottleneck", "dependency", "pending"],
    "technical": ["breach", "data breach", "security breach", "unauthorized access",
                  "deficiency", "gap", "incomplete", "limitation", "audit failure"],
}

SEVERITY_TO_PI = {
    "critical": ("high", "high"),
    "high": ("high", "medium"),
    "medium": ("medium", "medium"),
    "low": ("low", "low"),
}


def _category_for(keyword: str) -> str:
    for category, words in CATEGORY_MAP.items():
        if keyword in words:
            return category
    return "operational"


def _sentences(text: str) -> list:
    return [s.strip() for s in re.split(r'(?<=[.!?])\s+|\n+', (text or "").strip()) if s.strip()]


def analyze(text: str, max_per_category: int = 3) -> dict:
    """
    Keyword-based analysis returning the same shape as the Groq risk agent.

    Every risk carries the sentence it was found in as `evidence_quote`, and is
    marked `is_inferred: False` because it is a literal text match.
    """
    sentences = _sentences(text)
    summary_parts = [s for s in sentences if len(s) > 30][:3]
    summary = " ".join(summary_parts)[:500] or "No readable content was extracted from this document."

    register = {"technical": [], "timeline": [], "financial": [], "operational": [], "legal": []}
    insights = []
    seen = set()

    for severity, config in RISK_KEYWORDS.items():
        for keyword in config["keywords"]:
            pattern = re.compile(r'\b' + re.escape(keyword) + r'\b', re.IGNORECASE)
            for sentence in sentences:
                if not pattern.search(sentence):
                    continue
                key = (keyword, sentence[:80])
                if key in seen:
                    continue
                seen.add(key)

                category = _category_for(keyword)
                if len(register[category]) >= max_per_category:
                    continue

                probability, impact = SEVERITY_TO_PI[severity]
                quote = sentence if len(sentence) <= 300 else sentence[:297] + "..."
                register[category].append({
                    "title": f"Keyword match: {keyword}",
                    "description": f"The term \"{keyword}\" appears in the document, which indicates a "
                                   f"potential {severity} {category} risk. Offline keyword analysis — "
                                   f"confirm against the full document.",
                    "category": category,
                    "probability": probability,
                    "impact": impact,
                    "evidence_quote": quote,
                    "is_inferred": False,
                    "affected_tasks": [],
                    "affected_requirements": [],
                    "recommendation": f"Review the passage mentioning \"{keyword}\" and confirm whether "
                                      f"mitigation is required.",
                    "source_documents": ["Uploaded document (keyword scan)"],
                })
                if severity in ("critical", "high") and len(insights) < 8:
                    insights.append({
                        "severity": severity,
                        "text": f"\"{keyword}\" flagged in: {quote[:160]}",
                        "evidence_quote": quote,
                        "is_inferred": False,
                    })
                break  # one hit per keyword is enough

    total_hits = sum(len(v) for v in register.values())
    recommendations = []
    if total_hits:
        recommendations.append(
            f"AI analysis was unavailable, so this report is a keyword scan. {total_hits} potential "
            f"risk indicator(s) were matched — re-run the analysis once the AI service is reachable."
        )
        if register["legal"]:
            recommendations.append("Legal or compliance language was detected — route this document for legal review.")
        if register["timeline"]:
            recommendations.append("Schedule-related language was detected — confirm milestone dates are still achievable.")
        if register["financial"]:
            recommendations.append("Cost or budget language was detected — verify the current budget position.")
    else:
        recommendations.append(
            "AI analysis was unavailable and no risk keywords were matched. Re-run the analysis once "
            "the AI service is reachable before treating this document as low risk."
        )

    return {
        "summary": summary,
        "risk_level": "Unknown",   # overwritten by the deterministic scorer downstream
        "key_insights": insights,
        "recommendations": recommendations,
        "risk_register": register,
    }
