# Carebrain Patient Q&A AI Assistant

Production-minded take-home assignment implementing cohort-isolated, grounded patient Q&A with prompt injection defense, audit logging, and LangChain A/B experimentation.

## Architecture

```mermaid
flowchart TD
    A[Expo App] -->|JWT Bearer| B[NestJS API]
    B --> C[POST /cohort/select]
    B --> D[POST /chat]
    D --> E[JWT Verify + Extract Cohort]
    E --> F[InjectionDetectionService]
    F -->|blocked| G[Security Event + Audit Log]
    F -->|allowed| H[PatientResolverService]
    H --> I[RetrievalService with cohort filter]
    I --> J[Cohort Guard]
    J --> K[LangChain Variant A or B]
    K --> L[Structured Answer + Citations + Confidence]
    L --> M[chat_logs PostgreSQL]
    I --> N[(PostgreSQL)]
    M --> N
    G --> N
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Expo React Native, TypeScript |
| Backend | NestJS, TypeScript |
| Database | PostgreSQL |
| AI | LangChain, OpenAI |

## Project Structure

```
├── backend/                 # NestJS API
├── frontend/                # Expo React Native app
├── database/
│   ├── schema.sql
│   ├── seed-from-csv.js
│   └── evaluation/dataset.json
├── README.md
├── SECURITY.md
└── EXPERIMENT_RESULTS.md
```

## Prerequisites

- Node.js 20+
- PostgreSQL 16+
- OpenAI API key (optional; fallback grounded responses work without it)

## Setup

### 1. Database

Install and start PostgreSQL locally, then create the database and user (one-time, run in `psql` as a superuser):

```sql
CREATE USER carebrain WITH PASSWORD 'carebrain';
CREATE DATABASE carebrain OWNER carebrain;
```

Apply the schema and seed data:

```bash
export DATABASE_URL=postgresql://carebrain:carebrain@localhost:5432/carebrain
npm run db:setup
```

Or run each step separately:

```bash
npm run db:schema
npm run db:seed
```

### 2. Backend

```bash
cd backend
cp .env.example .env
# Set OPENAI_API_KEY if available
npm install
npm run start:dev
```

### 3. Frontend

```bash
cd frontend
npm install
EXPO_PUBLIC_API_URL=http://localhost:3000 npm start
```

## Public Deployment

| Service | URL |
|---------|-----|
| App (web) | [http://195.201.195.104:3000/](http://195.201.195.104:3000/) |
| API base | `http://195.201.195.104:3000` |

The web build is served from the same origin as the NestJS API, so the frontend resolves `EXPO_PUBLIC_API_URL` from `window.location.origin` automatically (see [`frontend/lib/api.ts`](frontend/lib/api.ts)). No separate frontend env var is required for this layout.

Example API call:

```bash
curl -X POST http://195.201.195.104:3000/cohort/select \
  -H "Content-Type: application/json" \
  -d '{"cohort":"A"}'
```


### POST /evaluation/run

Runs automated evaluation suite and stores results in `evaluation_results`.

## Database Schema

| Table | Purpose |
|-------|---------|
| `patients` | Patient demographics, location (unit/floor/room/bed) and admission/discharge, with cohort |
| `patient_allergy` | Allergies (cohort denormalized) |
| `patient_condition` | Conditions |
| `patient_medication` | Medications |
| `patient_observation` | Observations |
| `chat_logs` | Full audit trail per request |
| `security_events` | Prompt injection / cross-cohort events |
| `evaluation_results` | Automated eval metrics |
| `experiment_assignments` | LangChain variant A/B per patient |

Every clinical table includes `cohort` and all retrieval queries filter by JWT cohort **before** LLM execution.

## Testing

```bash
cd backend
npm test
npm run test:e2e   # requires PostgreSQL
```

Test coverage includes:

- Cross-cohort isolation (A cannot access B and vice versa)
- Prompt extraction, environment variable, and enumeration attacks
- Insufficient evidence and ambiguous patient handling

## Evaluation

```bash
cd backend
npm run evaluate
```

Metrics tracked: accuracy, grounding_rate, citation_rate, security_block_rate, cohort_isolation_success_rate.

## Key Design Decisions

1. **Cohort from JWT only** — frontend never supplies trusted cohort context.
2. **Pre-LLM retrieval** — model receives only pre-filtered records; no SQL/tool access.
3. **Layered injection defense** — regex detection, security events, safe responses.
4. **Full auditability** — every request persisted with citations and model output.
5. **Deterministic experiments** — `hash(patient_id) % 2` assigns LangChain variant A or B.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | JWT signing secret |
| `OPENAI_API_KEY` | OpenAI key (optional) |
| `OPENAI_MODEL` | Default `gpt-4o-mini` |
| `EXPO_PUBLIC_API_URL` | Frontend API base URL (optional when web and API share one origin; set explicitly for split hosting, e.g. Vercel + separate API host) |
