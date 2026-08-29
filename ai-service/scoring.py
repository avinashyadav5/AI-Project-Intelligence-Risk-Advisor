def severity(probability: str, impact: str) -> float:
    mapping = {"low": 1, "medium": 2, "high": 3}
    p_val = mapping.get(probability.lower(), 1)
    i_val = mapping.get(impact.lower(), 1)
    return (p_val * i_val / 9.0) * 100.0

def confidence_weight(is_inferred: bool, has_quote: bool) -> float:
    if has_quote:
        return 1.0
    if is_inferred:
        return 0.6
    return 0.2

def category_score(category: str, risks: list) -> float:
    total_weight = 0.0
    weighted_sum = 0.0
    for r in risks:
        if r.get("category", "").lower() == category.lower():
            sev = severity(r.get("probability", "low"), r.get("impact", "low"))
            has_q = bool(r.get("evidence_quote"))
            is_inf = bool(r.get("is_inferred", False))
            cw = confidence_weight(is_inf, has_q)
            weighted_sum += sev * cw
            total_weight += cw
    if total_weight == 0:
        return None
    return weighted_sum / total_weight

def overall_risk_score(category_scores: dict) -> float:
    weights = {
        "technical": 0.30,
        "timeline": 0.25,
        "financial": 0.20,
        "operational": 0.15,
        "legal": 0.10
    }
    total = 0.0
    active_weight = 0.0
    for cat, weight in weights.items():
        score = category_scores.get(cat)
        if score is not None:
            total += score * weight
            active_weight += weight
            
    if active_weight == 0:
        return 0.0
    return total / active_weight

def overall_health(axis_scores: dict) -> float:
    weights = {
        "planning": 0.20,
        "documentation": 0.15,
        "development": 0.25,
        "testing": 0.25,
        "risk": 0.15
    }
    total = 0.0
    active_weight = 0.0
    for axis, weight in weights.items():
        score = axis_scores.get(axis)
        if score is not None:
            total += score * weight
            active_weight += weight
            
    if active_weight == 0:
        return 0.0
    return total / active_weight

def grade(score: float) -> str:
    if score >= 90: return "A"
    if score >= 80: return "B"
    if score >= 70: return "C"
    if score >= 60: return "D"
    return "F"

def risk_band(score: float) -> str:
    if score >= 70: return "Critical"
    if score >= 45: return "High"
    if score >= 20: return "Medium"
    return "Low"

def insight_confidence(distance: float, evidence_weight: float) -> float:
    similarity = 1.0 / (1.0 + distance)
    return similarity * evidence_weight
