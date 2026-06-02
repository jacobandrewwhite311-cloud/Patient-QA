import { Injectable } from '@nestjs/common';
import { RetrievedRecord, ConfidenceLevel } from '../common/types';

@Injectable()
export class ConfidenceService {
  compute(
    records: RetrievedRecord[],
    question: string,
    modelConfidence: ConfidenceLevel,
  ): ConfidenceLevel {
    const q = question.toLowerCase();
    const hasPatient = records.some((r) => r.table === 'patients');
    if (!hasPatient) {
      return 'Low';
    }

    const domainTables = [
      { regex: /medication|medicine|drug|prescription/, table: 'patient_medication' },
      { regex: /allerg/, table: 'patient_allergy' },
      { regex: /condition|diagnos|icd/, table: 'patient_condition' },
      { regex: /observation|vital|blood|temperature|heart|pain/, table: 'patient_observation' },
    ];

    for (const domain of domainTables) {
      if (domain.regex.test(q)) {
        const count = records.filter((r) => r.table === domain.table).length;
        if (count === 0) return 'Low';
        if (count >= 2) return modelConfidence === 'Low' ? 'Medium' : modelConfidence;
        return modelConfidence === 'High' ? 'Medium' : modelConfidence;
      }
    }

    return modelConfidence;
  }
}
