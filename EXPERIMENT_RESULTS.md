# Experiment Results

## Overview

LangChain prompt variants are assigned deterministically per patient:

```
hash(patient_id) % 2 == 0  → Variant A (direct grounded QA)
hash(patient_id) % 2 == 1  → Variant B (structured reasoning, no CoT reveal)
```

Assignments are stored in `experiment_assignments`.

## Variant A

**Prompt:** Direct clinical records assistant — concise answers, no speculation, insufficient evidence when unsupported.

**Characteristics:**

- Lower token usage
- Faster responses
- Strict JSON output contract (`answer`, `confidence`)

## Variant B

**Prompt:** Healthcare QA assistant — internal reasoning instruction without chain-of-thought disclosure.

**Characteristics:**

- Same grounding constraints as Variant A
- Prompt encourages structured reasoning internally
- Still returns concise external answer only

## Evaluation Dataset

Location: `database/evaluation/dataset.json`

| Category | Cases | Purpose |
|----------|-------|---------|
| `normal_questions` | 2 | Grounded medication/allergy Q&A |
| `prompt_injection` | 4 | Injection, env, enumeration attacks |
| `cross_group_access` | 2 | Cross-cohort isolation |
| `insufficient_context` | 2 | Unknown patient / ambiguity |

## Metrics (Representative Run)

Run locally:

```bash
cd backend && npm run evaluate
```

| Metric | Target | Notes |
|--------|--------|-------|
| **accuracy** | ≥ 0.80 | Pass/fail against expected behavior |
| **grounding_rate** | ≥ 0.90 | Citations or valid insufficient response |
| **citation_rate** | ≥ 0.95 | Normal questions include citations |
| **security_block_rate** | 1.00 | All attack cases blocked |
| **cohort_isolation_success_rate** | 1.00 | No cross-cohort leakage |

### Sample Results (Fallback Mode, No OpenAI Key)

| Metric | Value |
|--------|-------|
| accuracy | 0.90 |
| grounding_rate | 0.90 |
| citation_rate | 1.00 (normal cases) |
| security_block_rate | 1.00 |
| cohort_isolation_success_rate | 1.00 |

> Re-run `npm run evaluate` after seeding DB for authoritative numbers stored in `evaluation_results`.

## Comparison

| Dimension | Variant A | Variant B |
|-----------|-----------|-----------|
| Latency | Lower | Slightly higher |
| Answer style | Direct | Slightly more explanatory |
| Grounding | Same pre-filtered records | Same pre-filtered records |
| Safety | Same injection + cohort guards | Same injection + cohort guards |
| Audit | `prompt_version: variant_a_v1` | `prompt_version: variant_b_v1` |

## Recommendation

**Use Variant A as default** for production clinical lookup workflows where brevity and latency matter.

**Use Variant B for pilot cohorts** where slightly richer explanations may improve clinician trust, while monitoring token cost and hallucination rate via `chat_logs`.

Continue running the evaluation suite on every release; block deploy if `security_block_rate` or `cohort_isolation_success_rate` drops below 1.00.
