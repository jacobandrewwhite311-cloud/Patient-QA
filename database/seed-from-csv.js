/**
 * Seeds PostgreSQL from Carebrain sandbox CSV files.
 * Usage: node database/seed-from-csv.js
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const CSV_DIR = path.join(__dirname, '..', 'Carebrain Patient Sandbox CSV Data v2');

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function readCsv(filename) {
  const content = fs.readFileSync(path.join(CSV_DIR, filename), 'utf8');
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row = {};
    headers.forEach((h, i) => {
      row[h] = values[i] ?? '';
    });
    return row;
  });
}

function hashMod2(patientId) {
  let hash = 0;
  for (let i = 0; i < patientId.length; i += 1) {
    hash = (hash * 31 + patientId.charCodeAt(i)) >>> 0;
  }
  return hash % 2 === 0 ? 'A' : 'B';
}

async function seed() {
  const client = new Client({
    connectionString:
      process.env.DATABASE_URL ||
      'postgresql://carebrain:carebrain@127.0.0.1:5432/carebrain',
  });

  await client.connect();

  const patients = readCsv('patient.csv');
  const allergies = readCsv('patient_allergy.csv');
  const conditions = readCsv('patient_condition.csv');
  const medications = readCsv('patient_medication.csv');
  const observations = readCsv('patient_observation.csv');

  const patientCohort = new Map();
  for (const p of patients) {
    patientCohort.set(p.id, p.group || 'A');
  }

  await client.query('TRUNCATE experiment_assignments, chat_logs, security_events, evaluation_results, patient_observation, patient_medication, patient_condition, patient_allergy, patients CASCADE');

  for (const p of patients) {
    const cohort = p.group || 'A';
    await client.query(
      `INSERT INTO patients (
         patient_id, first_name, last_name, cohort, dob, gender, ethnicity, status,
         unit_description, floor_description, room_description, bed_description,
         admission_time, discharge_time
       )
       VALUES (
         $1, $2, $3, $4, NULLIF($5, '')::date, $6, $7, $8,
         $9, $10, $11, $12,
         NULLIF($13, '')::timestamptz, NULLIF($14, '')::timestamptz
       )
       ON CONFLICT (patient_id) DO NOTHING`,
      [
        p.id,
        p.name_first,
        p.name_last,
        cohort,
        p.dob || null,
        p.gender || null,
        p.ethnicity_description || null,
        p.status || null,
        p.unit_description || null,
        p.floor_description || null,
        p.room_description || null,
        p.bed_description || null,
        p.admission_time || null,
        p.discharge_time || null,
      ],
    );

    const variant = hashMod2(p.id);
    await client.query(
      `INSERT INTO experiment_assignments (patient_id, variant, assignment_method)
       VALUES ($1, $2, 'hash_mod_2')
       ON CONFLICT (patient_id) DO UPDATE SET variant = EXCLUDED.variant`,
      [p.id, variant],
    );
  }

  for (const row of allergies) {
    const cohort = patientCohort.get(row.patient_id);
    if (!cohort) continue;
    await client.query(
      `INSERT INTO patient_allergy (id, patient_id, allergen, category, clinical_status, severity, reaction_type, cohort)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING`,
      [row.id, row.patient_id, row.allergen, row.category, row.clinical_status, row.severity, row.reaction_type, cohort],
    );
  }

  for (const row of conditions) {
    const cohort = patientCohort.get(row.patient_id);
    if (!cohort) continue;
    await client.query(
      `INSERT INTO patient_condition (id, patient_id, icd_10_code, icd_10_description, clinical_status, is_primary_diagnosis, cohort)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
      [row.id, row.patient_id, row.icd_10_code, row.icd_10_description, row.clinical_status, row.is_primary_diagnosis === 'TRUE', cohort],
    );
  }

  for (const row of medications) {
    const cohort = patientCohort.get(row.patient_id);
    if (!cohort) continue;
    await client.query(
      `INSERT INTO patient_medication (id, patient_id, description, generic_name, strength, strength_unit, directions, status, cohort)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT DO NOTHING`,
      [row.id, row.patient_id, row.description, row.generic_name, row.strength, row.strength_unit, row.directions, row.status, cohort],
    );
  }

  for (const row of observations) {
    const cohort = patientCohort.get(row.patient_id);
    if (!cohort) continue;
    let data = null;
    try {
      data = row.data ? JSON.parse(row.data) : null;
    } catch {
      data = { raw: row.data };
    }
    await client.query(
      `INSERT INTO patient_observation (id, patient_id, method, recorded_time, data, cohort)
       VALUES ($1, $2, $3, NULLIF($4, '')::timestamptz, $5, $6) ON CONFLICT DO NOTHING`,
      [row.id, row.patient_id, row.method || null, row.recorded_time || null, data, cohort],
    );
  }

  console.log(`Seeded ${patients.length} patients and related clinical records.`);
  await client.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
