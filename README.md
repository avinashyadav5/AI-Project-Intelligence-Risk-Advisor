# AI Project Intelligence & Risk Advisor

Teams already produce project documents — proposals, SRS files, meeting notes,
sprint updates, task lists. Getting anything actionable out of them usually
means reading all of it by hand, so it doesn't happen, and problems get found
late.

This platform takes those scattered artifacts, builds a searchable knowledge
base from them, and runs a multi-agent pipeline that extracts scope, finds
risks and blockers, forecasts the schedule, writes the documentation that's
missing, and scores project health. A chat assistant answers questions about
the project using only what's in the uploaded documents.

---

## What it does

| Capability | How it works |
|---|---|
| Ingests mixed artifacts | PDF, DOC/DOCX, TXT and CSV. Task-list CSVs are parsed into structured rows, not treated as prose. |
| Unified knowledge base | Every document is chunked, embedded with `all-MiniLM-L6-v2` and indexed per project in FAISS. |
| Scope & deliverables | Scope agent extracts objectives, boundaries, assumptions and deliverables with evidence. |
| Risks & blockers | Risk agent produces a five-category register; each risk carries a quote from the source text. |
| Schedule forecast | Deterministic date arithmetic — overdue detection, dependency critical path, projected slip. The LLM only adds qualitative delay factors on top. |
| Missing documentation | Generates user stories, risk registers, action item lists, SRS outlines, test plans and status reports. |
| Health scoring | Weighted score across planning, documentation, development, testing and risk. Deterministic and reproducible. |
| Conversational assistant | Answers grounded in the knowledge base, with conversation memory and citations naming the source document. |

---

## Architecture

```
React + Vite client
        │
        ▼
Express API  ──────────────►  PostgreSQL (Prisma)
        │                       users, projects, documents,
        │                       milestones, notifications,
        │                       activity log, health history
        ▼
FastAPI AI microservice
        │
        ├── text extraction     PyMuPDF / python-docx / CSV parser
        ├── RAG                 chunk → embed → FAISS (per project)
        ├── agents              risk · scope · health · traceability ·
        │                       meeting · user stories   (Groq)
        └── deterministic       scoring.py · schedule.py · keyword_engine.py
```

Two levels of analysis:

- **Per document** (`POST /analyze`) — scores a single uploaded file.
- **Per project** (`POST /analyze-project`) — runs the same agents across the
  whole knowledge base plus the project's real milestones, producing one view
  of the project rather than an average of file scores.

---

## Repository layout

```
ai-service/          FastAPI AI microservice
  main.py            app, RAG, knowledge base, agents, endpoints
  scoring.py         deterministic risk and health scoring
  schedule.py        deterministic schedule forecasting + critical path
  csv_tasks.py       task-list CSV parsing
  keyword_engine.py  offline fallback analysis
server/              Express API
  middleware/auth.js authentication, role guard, project access guard
  routes/            auth, projects, upload, documents, chat, teams,
                     milestones, dashboard, notifications
  utils/             aiService.js (AI client), events.js (audit + alerts)
  prisma/schema.prisma
client/              React + Vite frontend
```

---

## Running it

### 1. Database

PostgreSQL 15 or later. Create a database and note the connection string.

### 2. AI service

```bash
cd ai-service
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Create `ai-service/.env`:

```
GROQ_API_KEY=your_key_here
GROQ_MODEL=llama-3.3-70b-versatile
```

```bash
uvicorn main:app --reload --port 8000
```

Docs at http://127.0.0.1:8000/docs. `GET /health` reports which optional
capabilities loaded (PDF extraction, DOCX extraction, RAG, Groq).

Without a Groq key the service still runs: the keyword engine produces an
evidence-backed fallback analysis, clearly labelled `keyword_fallback`.

### 3. Express server

```bash
cd server
npm install
npx prisma db push
npm run dev
```

Create `server/.env`:

```
PORT=5000
DATABASE_URL=postgresql://user:password@localhost:5432/riskadvisor?schema=public
JWT_SECRET=change_this_to_a_long_random_string
AI_SERVICE_URL=http://127.0.0.1:8000
CLIENT_URL=http://localhost:5173
```

### 4. Client

```bash
cd client
npm install
npm run dev
```

Optionally set `VITE_API_URL` in `client/.env` if the API isn't on
`http://localhost:5000/api`.

---

## Roles

| Role | Can do |
|---|---|
| `admin` | Everything, across all projects |
| `pm` | Create and delete projects, invite and remove members, upload, delete documents, run analyses |
| `developer` | Upload documents, manage tasks, run analyses, use chat |
| `auditor` | Read-only: reports, compliance view, chat |

Every project-scoped route checks membership, not just authentication.

---

## Scoring

Both scores are computed in Python, not asked for from the model, so the same
inputs always produce the same numbers.

**Risk.** Each risk gets `severity = (probability × impact) / 9 × 100`, weighted
by evidence confidence (a direct quote counts 1.0, an inference 0.6, an
unsupported claim 0.2). Category scores combine as technical 30%, timeline 25%,
financial 20%, operational 15%, legal 10%, renormalised over whichever
categories actually had evidence. Bands: Critical ≥ 70, High ≥ 45, Medium ≥ 20.

**Health.** Development 25%, testing 25%, planning 20%, risk 15%, documentation
15%, again renormalised over the dimensions with evidence. Grades: A ≥ 90 down
to F < 60.

**Schedule.** Computed from task dates: overdue count and worst lateness,
blocked task count, unscheduled work, and the longest dependency chain. Slip is
projected from the worst overdue item softened by the average, plus a penalty
per blocked task.

---

## API reference

### AI service (port 8000)

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Service capability report |
| POST | `/analyze` | Analyse one uploaded document |
| POST | `/analyze-project` | Analyse the whole project knowledge base |
| POST | `/chat` | Grounded Q&A with conversation history |
| POST | `/generate` | Generate missing documentation |
| GET | `/kb/{project_id}` | What the knowledge base holds |
| DELETE | `/kb/{project_id}/document/{doc_id}` | Remove one document's chunks |
| DELETE | `/kb/{project_id}` | Remove the whole project index |

### Express API (port 5000)

All `/api` routes except `/api/auth/*` require `Authorization: Bearer <token>`.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/register`, `/api/auth/login` | Account creation and sign-in |
| GET | `/api/projects` | Projects the caller can see |
| POST | `/api/projects` | Create a project (pm/admin) |
| DELETE | `/api/projects/:id` | Delete a project and its knowledge base |
| POST | `/api/projects/:id/analyze` | Run project-level analysis |
| GET | `/api/projects/:id/intelligence` | Latest project-level analysis |
| GET | `/api/projects/:id/activity` | Audit trail |
| POST | `/api/projects/:id/generate-document` | Generate and save a document |
| POST | `/api/upload` | Upload a file, analysis starts in the background |
| POST | `/api/upload/:id/reanalyze` | Re-run analysis on an existing file |
| GET | `/api/documents/:id` | Full analysis report |
| DELETE | `/api/documents/:id` | Delete a document and purge its chunks |
| GET | `/api/documents/project/:id/health` | Aggregated health |
| GET | `/api/documents/project/:id/trends` | Risk and health timeline |
| POST | `/api/chat` | Ask the assistant a question |
| GET | `/api/chat/:projectId` | Conversation history |
| GET | `/api/milestones/:projectId` | Tasks with dependency graph |
| POST | `/api/milestones` | Create a task with dependencies |
| PATCH | `/api/milestones/:id/progress` | Update status or progress |
| DELETE | `/api/milestones/:id` | Delete a task |
| PATCH | `/api/documents/:id/report-state` | Persist ticked action items and dismissed blockers |
| GET | `/api/notifications` | Notifications and unread count |
| GET | `/api/dashboard/stats` | Role-aware dashboard figures |

---

## Testing

Three suites, none of which need a database, an API key or network access.

```bash
# Deterministic engines: CSV parsing, schedule maths, scoring, keyword fallback
cd ai-service && python test_engines.py          # 44 assertions

# Real HTTP endpoints via FastAPI's TestClient, with Groq deliberately absent
cd ai-service && python test_api.py              # 50 assertions

# React render + behaviour tests (vitest + testing-library)
cd client && npm test                            # 37 tests
```

The frontend suite mounts every page and component with realistic data and
again with empty data, because "no documents yet" is the first thing a new user
sees. It catches the class of failure a production build cannot: a component
that compiles cleanly and then throws the moment it renders.

---

## Agent budget

Each agent is one LLM call. Running all six on every upload burns free-tier
quota on work that cannot apply — a task-list CSV has no meeting minutes, and
meeting notes rarely contain formal requirements. The meeting and user-story
agents therefore only run when the document text signals they are relevant,
which keeps a typical upload at four calls instead of six.

Project-level analysis always runs all six, because the combined knowledge base
spans document types. Set `RUN_ALL_AGENTS=1` to force the full pipeline on
every document. Each analysis response reports `agents_run` and
`agents_skipped`, so an empty section in a report is explained rather than
mysterious.

## Security

- Every `/api` route except `/api/auth/*` requires a bearer token, and every
  project-scoped route additionally checks membership.
- Socket.io verifies the JWT during the handshake and takes the message sender
  from the token, never from the client payload.
- CORS is restricted to `ALLOWED_ORIGINS` (defaults to `CLIENT_URL`).
- Rate limits: 300 requests/min per caller across the API, 10 sign-ins per 15
  minutes, 10 registrations per hour, 20 chat questions/min, 20 uploads/min.
- Passwords require 8+ characters with at least one letter and one number.
  `admin` cannot be self-assigned at registration.
- Sign-in returns one message for both a wrong password and an unknown email,
  so the endpoint cannot be used to enumerate accounts.

## Known limitations

- Analysis runs in-process with `setImmediate`, not a durable job queue. A
  restart mid-analysis is detected by a sweep that marks the document `Failed`
  with an explanation, and it can be retried with "Re-analyse", but a real
  queue would be better.
- Rate limiting is in-process. Running several server replicas needs a shared
  store such as Redis, since each process keeps its own counters.
- FAISS indexes live on the AI service's local disk (a named volume under
  Docker). Running more than one AI replica needs shared storage.
- Groq free-tier rate limits (429) trigger backoffs of up to several minutes on
  large batches.
- Deleting a document rebuilds that project's FAISS index rather than removing
  vectors in place. Fine at project scale, linear in total chunks.
- Invites are in-app only; no email is actually sent. An invited user who
  already has an account gets a notification; anyone else needs the link.
- The client bundle is ~1.9 MB unsplit. It builds and runs fine; code-splitting
  would improve first load.
