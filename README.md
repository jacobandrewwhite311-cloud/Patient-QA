# Patient Q&A AI Assistant

Production-minded prototype for cohort-scoped, grounded patient record Q&A with layered prompt-injection defenses, A/B prompt variants, and structured observability.

## Architecture

```
Expo (cohort select → chat)
        │  Basic Auth (session token)
        ▼
NestJS API ──► Injection detector ──► Patient resolver (cohort-scoped)
        │              │                      │
        │              │                      ▼
        │              │              PostgreSQL (patients + records)
        │              ▼
        └──► LangChain (variant A/B) ──► Citations + confidence
        │
        └──► request_logs (full audit trail)
```

**Safety principle:** Cohort scope is enforced server-side from the session token on every database query. The LLM never chooses which cohort or patient to access without prior server-side resolution.

## Prerequisites

- Node.js 20+
- pnpm 9+
- Docker (for PostgreSQL)
- OpenAI API key (optional — without it, chat returns record summaries without LLM synthesis)

## Quick start

```bash
# Install dependencies
pnpm install

# Start database
pnpm db:up

# Configure environment
cp .env.example .env
# Edit .env with OPENAI_API_KEY if available

# Migrate and seed (from repo root)
cd apps/api
cp ../../.env .env 2>/dev/null || true
pnpm generate
pnpm migrate
pnpm seed
cd ../..

# Start API
pnpm api:dev

# In another terminal — start mobile (web)
pnpm mobile:dev
# Press 'w' for web, or: cd apps/mobile && pnpm web
```

Set `EXPO_PUBLIC_API_URL=http://localhost:3000` in `apps/mobile/.env` if needed.

## API

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /sessions` | None | `{ "group": "A" \| "B" }` → `{ token, group }` |
| `POST /chat` | Basic `<token>:` | `{ "message": "..." }` → answer, citations, confidence |
| `GET /health` | None | Liveness |
| `GET /admin/logs` | Basic | Recent logs (`ENABLE_ADMIN_LOGS=true`) |
| `GET /admin/metrics` | Basic | A/B variant metrics |

### Example

```bash
# Create session
TOKEN=$(curl -s -X POST http://localhost:3000/sessions \
  -H "Content-Type: application/json" \
  -d '{"group":"A"}' | jq -r .token)

# Ask a question
curl -s -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -u "$TOKEN:" \
  -d '{"message":"What allergies does Adolfo Ricker have?"}'
```

## Evaluation

```bash
# With API running
ENABLE_ADMIN_LOGS=true pnpm eval
```

Dataset: 28 cases in `eval/dataset.json` (10 normal, 8 injection, 5 cross-group, 5 insufficient context).

## Prompt variants (A/B)

| Variant | ID | Approach |
|---------|-----|----------|
| A | `structured_rag` | Direct RAG-style answer with mandatory citations |
| B | `stepwise_clinical` | Stepwise evidence identification then synthesis |

Assignment: `hash(sessionId) % 2` — deterministic per session.

See [EXPERIMENT_RESULTS.md](./EXPERIMENT_RESULTS.md) for metrics and recommendation.

## Security

See [SECURITY.md](./SECURITY.md) for threat model and defenses.

## Project structure

```
apps/api/          NestJS + Prisma + LangChain
apps/mobile/       Expo (React Native + web)
data/csv/          Sandbox patient CSVs
eval/              Evaluation dataset + runner
docker-compose.yml PostgreSQL 16
```

## Environment variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `OPENAI_API_KEY` | OpenAI key for LangChain |
| `OPENAI_MODEL` | Model name (default: `gpt-4o-mini`) |
| `PORT` | API port (default: 3000) |
| `ENABLE_ADMIN_LOGS` | Enable `/admin/logs` |
| `ENABLE_DEBUG` | Include patientId/variant in chat response |
| `EXPO_PUBLIC_API_URL` | API URL for mobile app |

## What would you improve with one additional day?

- **Embedding RAG** — Chunk records and retrieve by semantic similarity for large charts
- **CI eval gate** — Run `pnpm eval` on every PR with regression thresholds
- **JWT sessions** — Rotating tokens with expiry instead of static UUIDs
- **Reviewer dashboard** — UI for browsing `request_logs` and flagging violations
- **Expanded red-team dataset** — 100+ adversarial cases with automated scoring
- **Hosted deployment** — Railway/Render full stack with stable public URL

## Live deployment

_Not yet deployed._ To deploy: Railway (API + Postgres) + Expo web static export. Add URL here when available.
