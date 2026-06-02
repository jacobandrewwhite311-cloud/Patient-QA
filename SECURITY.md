# Security Documentation

## Threat Model

| Threat | Impact | Mitigation |
|--------|--------|------------|
| Cross-cohort data access | HIGH — PHI leakage across groups | JWT cohort enforcement + DB filters + post-retrieval guard |
| Prompt injection | HIGH — policy bypass, data exfiltration | InjectionDetectionService + safe responses + audit |
| Patient enumeration | MEDIUM — reconnaissance | Block list/dump patterns; no open-ended DB queries |
| Prompt/system extraction | MEDIUM — model abuse | Block reveal/show prompt patterns |
| Environment/secrets access | HIGH — infrastructure compromise | Block env/secrets patterns |
| Ambiguous patient guessing | MEDIUM — wrong-patient answers | Ambiguity response; never guess |

### Trust Boundaries

- **Trusted:** JWT signature, server-side cohort claim, PostgreSQL with parameterized queries
- **Untrusted:** All user chat input, frontend headers/body fields (except Bearer token)

## Prompt Injection Defense

Layered controls in `InjectionDetectionService`:

1. **Pattern matching** for known attacks:
   - `ignore previous instructions`
   - `show all patients` / `list all patients` / `dump database`
   - `reveal prompt` / `show system prompt`
   - `show environment variables` / `give me secrets`
   - Cross-cohort phrases (e.g. `what patients exist in group B`)

2. **Dynamic cross-cohort detection** — rejects references to cohort A/B other than active JWT cohort

3. **Response policy** — blocked requests return a safe message; no LLM invocation

4. **Security events** — persisted to `security_events` with severity:
   - **HIGH:** cross-cohort attempts, prompt extraction, environment access
   - **MEDIUM:** generic injection phrases

5. **Audit linkage** — `chat_logs.injection_detected` and `security_violation` flags

## Cohort Isolation Strategy

```
JWT verify → extract cohort → PatientResolver (cohort filter)
→ RetrievalService (patient_id AND cohort) → assertCohortMatch guard
→ LangChain (records only from active cohort)
```

Hard requirements enforced in code:

- All repository queries include `cohort = :jwtCohort`
- Retrieved patient cohort verified before LLM call
- LLM never receives SQL access or unrestricted search tools
- Unit tests prove Group A cannot access Group B and vice versa

## Auditability

Every `/chat` request writes to `chat_logs`:

- `request_id`, timestamp, cohort, patient_id, variant
- `retrieved_records`, prompt_version, user_query
- `raw_model_output`, final_answer, confidence, citations
- `injection_detected`, `security_violation`

Security blocks are logged even when LLM is not invoked.

## Known Limitations

1. **Regex-based injection detection** — sophisticated obfuscation may evade patterns; production systems should add ML classifiers and rate limiting.
2. **Fallback LLM mode** — without `OPENAI_API_KEY`, rule-based answers are used (still cohort-isolated and cited).
3. **Patient resolution** — name parsing is heuristic; uncommon formats may fail or return ambiguity.
4. **No user identity** — cohort JWT is session-scoped, not tied to individual clinicians.
5. **Evaluation endpoint unauthenticated** — should be protected or disabled in production.

## Future Improvements

- [ ] Add OAuth2 / enterprise SSO with per-user audit identity
- [ ] ML-based injection classifier (e.g. fine-tuned moderation model)
- [ ] Rate limiting and IP throttling on `/chat`
- [ ] Field-level redaction before LLM context assembly
- [ ] Hash-chain immutable audit log for compliance
- [ ] Real-time observability (OpenTelemetry, structured metrics dashboards)
- [ ] Automated red-team evaluation pipeline in CI
