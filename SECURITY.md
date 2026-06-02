# Security

## Threat model

| Threat | Impact | Likelihood |
|--------|--------|------------|
| Cross-cohort patient access | **Critical** — PHI leakage across groups | Medium (adversarial prompts) |
| Prompt injection / instruction override | High — bypass grounding or exfiltrate prompts | High |
| Patient enumeration | Medium — discover names/IDs outside scope | Medium |
| Hallucinated clinical facts | High — patient safety | Medium |
| Environment / secret exfiltration | Critical | Low–Medium |
| System prompt disclosure | Medium | Medium |

**Trust boundaries:**

- Client (untrusted): may send arbitrary chat messages
- Session token (semi-trusted): binds user to cohort A or B only
- Server + database (trusted): enforces all access control

## Implemented defenses (defense in depth)

### Layer 1 — Pattern-based injection detector (pre-LLM)

`InjectionDetectorService` blocks known adversarial patterns before any retrieval or LLM call:

- Instruction override (“ignore previous instructions”)
- Prompt / environment exfiltration
- Patient enumeration requests
- Explicit cross-group references

Returns safe fallback and logs `injectionAttempt: true`.

### Layer 2 — Cohort-scoped data access (tool sandbox)

`RetrievalService` always includes `WHERE group = :sessionCohort`:

- `resolvePatient(query, cohort)` — never searches other cohort
- `getPatientRecords(patientId, cohort)` — returns empty if ID exists in wrong group

The LLM cannot widen scope; it only receives records the server already fetched.

### Layer 3 — Cross-group name blocklist

On startup, all patient names are indexed by cohort. If a message references a name belonging to the **other** cohort (and not resolvable in-session), the request is blocked with `cohortViolation: true` (high severity).

Additional check: `findPatientInOtherCohort` detects names that resolve only outside the session cohort.

### Layer 4 — Prompt hardening

System prompts instruct the model to:

- Answer only from provided records
- Refuse meta-instructions from the user
- Never attempt to bypass cohort isolation

### Layer 5 — Output validation (post-LLM)

`OutputValidatorService` strips citations whose `recordId` was not in the retrieved set, reducing hallucinated references.

### Layer 6 — Audit logging

Every `/chat` request logs: cohort, resolved patient, records retrieved, raw model output, structured response, `injectionAttempt`, `cohortViolation`, prompt variant, latency.

## Authentication model

- `POST /sessions` — user selects Group A or B; server issues UUID token
- All other endpoints require HTTP Basic Auth (`Authorization: Basic <token>:`)
- Token maps to exactly one cohort for the session lifetime

This simulates account-level restriction without full identity management.

## Known risks and limitations

1. **LLM residual risk** — Models may still paraphrase or over-generalize; mitigated by citations + validation, not eliminated.
2. **Pattern bypass** — Novel injection phrasing may evade regex rules; cross-group DB enforcement remains the backstop.
3. **Partial name collisions** — Ambiguous single-token names return safe fallback rather than guessing.
4. **No rate limiting** — DoS possible on public deployment; add reverse proxy limits for production.
5. **Static session tokens** — No expiry or rotation; acceptable for prototype only.
6. **Admin endpoints** — Gated by `ENABLE_ADMIN_LOGS` but use same session auth; not for production exposure.

## Cohort boundary violations

Treated as **high-severity security events**:

- Logged with `cohortViolation: true`
- Safe fallback returned (no data from other cohort)
- Eval dataset includes 5 dedicated cross-group test cases

## Reporting

For this take-home, review `request_logs` in PostgreSQL or `GET /admin/logs` when `ENABLE_ADMIN_LOGS=true`.
