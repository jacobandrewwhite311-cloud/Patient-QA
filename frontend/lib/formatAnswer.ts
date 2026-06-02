type MedicationLike = Record<string, unknown>;

function formatMedicationLine(m: MedicationLike): string | null {
  const description = typeof m.description === 'string' ? m.description : undefined;
  const generic = typeof m.generic_name === 'string' ? m.generic_name : undefined;
  const strength = typeof m.strength === 'string' ? m.strength : undefined;
  const directions = typeof m.directions === 'string' ? m.directions : undefined;

  if (!description && !generic && !strength && !directions) {
    return null;
  }

  const namePart = [description, generic ? `(${generic})` : null].filter(Boolean).join(' ');
  const strengthPart = strength ? ` — ${strength}` : '';
  const directionsPart = directions ? ` Directions: ${directions}` : '';
  return `• ${namePart}${strengthPart}.${directionsPart}`.replace(/\.\s*\./g, '.');
}

function isMedicationLike(value: unknown): value is MedicationLike {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Ensures API answers are always safe to render inside <Text>. */
export function formatAnswerForDisplay(answer: unknown): string {
  if (typeof answer === 'string') return answer;
  if (answer === null || answer === undefined) return '';
  if (typeof answer === 'number' || typeof answer === 'boolean' || typeof answer === 'bigint') {
    return String(answer);
  }

  if (Array.isArray(answer)) {
    const lines = answer
      .filter(isMedicationLike)
      .map(formatMedicationLine)
      .filter((line): line is string => Boolean(line));

    if (lines.length > 0) {
      return lines.join('\n');
    }
  }

  if (isMedicationLike(answer)) {
    const line = formatMedicationLine(answer);
    if (line) return line;
  }

  try {
    return JSON.stringify(answer, null, 2);
  } catch {
    return String(answer);
  }
}
