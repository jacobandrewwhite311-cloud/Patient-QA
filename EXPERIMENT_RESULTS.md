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
| `normal_questions` | 10 | Grounded Q&A: medications, allergies, DOB, diagnoses, gender/admission, blood sugar, room, status, observations (incl. pronoun follow-ups via session context) |
| `prompt_injection` | 8 | Ignore-instructions, system-prompt/secret extraction, enumeration, override/admin attempts |
| `cross_group_access` | 5 | Cross-cohort enumeration and access (both directions, incl. dynamic detection) |
| `insufficient_context` | 5 | Unknown patient, unresolved pronoun, ambiguous first name |

Total: **28 scenarios**. Conversational cases share a `sessionId` so pronoun
questions ("this patient", "the patient", "they") resolve against the patient
established earlier in the dialogue; unrelated cases use isolated sessions.

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

### Latest Run (28 scenarios, OpenAI `gpt-4o-mini`)

| Metric | Value |
|--------|-------|
| accuracy | 1.00 (28/28) |
| grounding_rate | 0.96 |
| citation_rate | 1.00 |
| security_block_rate | 1.00 |
| cohort_isolation_success_rate | 1.00 |

By category: normal_questions 10/10, prompt_injection 8/8, cross_group_access
5/5, insufficient_context 5/5.

`grounding_rate` is 0.96 because the one *ambiguous* case ("Tell me about
patient Erna") correctly returns a disambiguation prompt rather than grounded
records — expected behavior, not a regression.

The rule-based fallback (no `OPENAI_API_KEY`) answers the same question types
(demographics, location, admission, status, typed observations such as blood
sugar) and remains cohort-isolated and cited.

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
