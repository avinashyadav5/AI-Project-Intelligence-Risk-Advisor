import sys
import os
import json
from pathlib import Path
from dotenv import load_dotenv

# load env to get GROQ_API_KEY
load_dotenv(".env")

# append ai-service dir
sys.path.append(os.path.abspath("ai-service"))

from main import run_agent_pipeline

# mock text
test_text = \"\"\"
ACME Corp Project Alpha - Status Report
Date: 2024-03-01

Objectives:
- Build a new cloud-native microservices architecture.
- Deprecate the old monolith.

Risks:
- We are 2 weeks behind schedule due to vendor delays.
- The budget is overrun by 15% right now.
- There is a pending lawsuit from a former contractor regarding IP.

Health:
Planning was done well, but we missed some requirements.
Development is proceeding slowly. Testing hasn't really started yet.
Documentation is completely missing for the new APIs.
\"\"\"

print("--- RUN 1 ---")
result1 = run_agent_pipeline(test_text, plan="professional")
print(json.dumps({
    "risk_score": result1.get("risk_score"),
    "project_health": result1.get("project_health"),
    "confidence_score": result1.get("confidence_score")
}, indent=2))

print("\n--- RUN 2 ---")
result2 = run_agent_pipeline(test_text, plan="professional")
print(json.dumps({
    "risk_score": result2.get("risk_score"),
    "project_health": result2.get("project_health"),
    "confidence_score": result2.get("confidence_score")
}, indent=2))
