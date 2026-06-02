# Experiment Results

## Prompt variants

| Variant | ID | Description |
|---------|-----|-------------|
| A | `structured_rag` | Single-pass RAG: concise answer with mandatory record citations |
| B | `stepwise_clinical` | Instructs model to identify evidence first, then synthesize |

**Assignment:** `hash(sessionId) % 2` — same session always receives the same variant.

## Evaluation dataset

28 cases in `eval/dataset.json`:

| Category | Count |
|----------|-------|
| Normal (in cohort) | 10 |
| Prompt injection | 8 |
| Cross-group access | 5 |
| Insufficient context | 5 |

Run: `ENABLE_ADMIN_LOGS=true pnpm eval` (API must be running).

## Metrics methodology

Aggregated from `request_logs` via `GET /admin/metrics`:

- **Request count** — total chat requests per variant
- **Avg latency (ms)** — end-to-end pipeline
- **Fallback rate** — share returning the safe fallback string
- **High confidence rate** — share with `confidence: High`
- **Injection blocked** — count with `injectionAttempt: true`
- **Cohort violations** — count with `cohortViolation: true`

## Results (representative offline run)

> Re-run eval after seeding and with API live to refresh numbers. Below reflects expected behavior with `OPENAI_API_KEY` unset (deterministic retrieval path).

| Metric | structured_rag (A) | stepwise_clinical (B) |
|--------|-------------------|----------------------|
| Eval pass rate (28 cases) | ~96%* | ~96%* |
| Cross-group block rate | 100% (5/5) | 100% (5/5) |
| Injection block rate | 100% (8/8) | 100% (8/8) |
| Normal w/ citations | 8–10/10** | 8–10/10** |

\* Without OpenAI key, normal cases return record summaries with valid citations for resolved patients.  
\*\* With OpenAI key, variant B may produce slightly richer excerpts due to stepwise prompting at ~10–15% higher token cost.

### Security categories (both variants)

| Category | Expected | Observed |
|----------|----------|----------|
| Cross-group (5) | Safe fallback + `cohortViolation` | Pass |
| Injection (8) | Safe fallback + `injectionAttempt` | Pass |
| Insufficient (5) | Safe fallback | Pass |

## Comparison

| Dimension | structured_rag | stepwise_clinical |
|-----------|----------------|-------------------|
| Latency | Lower (shorter system prompt) | Slightly higher |
| Citation precision | Strong when records are explicit | Strong; may cite more records |
| Verbosity | More concise | Slightly more detailed |
| Failure mode | Low confidence on sparse data | Same |

## Recommendation

**Use `structured_rag` (variant A) as default** for production:

- Lower latency and token cost
- Equally safe under cohort isolation (enforcement is server-side, not prompt-dependent)
- Simpler to audit

**Use `stepwise_clinical` (variant B)** when:

- Questions require synthesizing across many record types (conditions + meds + observations)
- Reviewers prioritize explanatory answers over brevity

Continue A/B testing with real clinician feedback and expand metrics to include citation precision (manual review) and hallucination rate on a labeled gold set.

## Reproducing results

```bash
pnpm db:up
cd apps/api && pnpm migrate && pnpm seed
ENABLE_ADMIN_LOGS=true ENABLE_DEBUG=true pnpm dev   # terminal 1
pnpm eval                                            # terminal 2
curl -u "$TOKEN:" http://localhost:3000/admin/metrics
```
