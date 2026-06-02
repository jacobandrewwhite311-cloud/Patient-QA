import { Injectable } from '@nestjs/common';
import { RetrievedRecord } from '../retrieval/retrieval.types';
import { Citation, LlmStructuredAnswer } from './chat.types';

@Injectable()
export class OutputValidatorService {
  validate(
    llmAnswer: LlmStructuredAnswer,
    records: RetrievedRecord[],
  ): LlmStructuredAnswer {
    const validIds = new Set(records.map((r) => `${r.table}:${r.recordId}`));
    const validCitations: Citation[] = [];

    for (const c of llmAnswer.citations) {
      const key = `${c.table}:${c.recordId}`;
      if (validIds.has(key)) {
        validCitations.push(c);
      }
    }

    let answer = llmAnswer.answer;
    if (validCitations.length === 0 && records.length > 0) {
      answer =
        'Based on available records, I could not verify specific citations for this answer.';
    }

    return {
      ...llmAnswer,
      answer,
      citations: validCitations,
    };
  }
}
