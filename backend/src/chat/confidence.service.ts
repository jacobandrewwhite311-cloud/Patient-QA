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

    // No patient could be grounded — never report confidence in an answer.
    if (!hasPatient) {
      return 'Low';
    }

    // Clinical domains backed by their own tables. Because retrieval is
    // cohort-scoped and authoritative, a resolved patient means we either have
    // the records (confident answer) or can confidently report their absence
    // (e.g. "no documented allergies"). Either way the answer is High.
    const clinicalDomains = [
      { regex: /medication|medicine|drug|prescription/, table: 'patient_medication' },
      { regex: /allerg/, table: 'patient_allergy' },
      { regex: /condition|diagnos|icd/, table: 'patient_condition' },
      {
        regex:
          /observation|vital|blood|sugar|pressure|temperature|heart|oxygen|respirator|weight|height|pain|reading/,
        table: 'patient_observation',
      },
    ];

    for (const domain of clinicalDomains) {
      if (domain.regex.test(q)) {
        return 'High';
      }
    }

    // Demographic / location / admission fields live on the always-present
    // patient record, so a resolved patient answers these with high confidence.
    const patientFieldRegex =
      /\b(dob|date of birth|birth|born|age|gender|sex|ethnicity|status|active|inactive|deceased|discharged|room|bed|unit|floor|ward|admission|admitted|discharge|name)\b/i;
    if (patientFieldRegex.test(q)) {
      return 'High';
    }

    // Unrecognized question shape: defer to the model but never drop below
    // Medium once a patient bundle was successfully grounded.
    return modelConfidence === 'Low' ? 'Medium' : modelConfidence;
  }
}
