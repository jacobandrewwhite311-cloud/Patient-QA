export const SAFE_FALLBACK =
  'I cannot find a matching patient in your cohort, or I cannot answer this question based on the available records.';

export const COHORTS = ['A', 'B'] as const;
export type Cohort = (typeof COHORTS)[number];

export const PROMPT_VARIANTS = ['structured_rag', 'stepwise_clinical'] as const;
export type PromptVariant = (typeof PROMPT_VARIANTS)[number];
