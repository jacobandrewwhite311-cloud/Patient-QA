import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

function csvPath(filename: string): string {
  return path.resolve(__dirname, '../../../data/csv', filename);
}

function parseCsv(content: string): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  const lines: string[] = [];
  let current = '';
  let inQuotes = false;

  for (const char of content) {
    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (current.trim()) lines.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) lines.push(current);

  if (lines.length === 0) return rows;

  const parseRow = (line: string): string[] => {
    const fields: string[] = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (quoted && line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = !quoted;
        }
      } else if (c === ',' && !quoted) {
        fields.push(field);
        field = '';
      } else {
        field += c;
      }
    }
    fields.push(field);
    return fields;
  };

  const headers = parseRow(lines[0]);
  for (let i = 1; i < lines.length; i++) {
    const values = parseRow(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? '';
    });
    rows.push(row);
  }
  return rows;
}

function readCsv(filename: string): Record<string, string>[] {
  const content = fs.readFileSync(csvPath(filename), 'utf-8');
  return parseCsv(content);
}

async function main() {
  console.log('Clearing existing data...');
  await prisma.requestLog.deleteMany();
  await prisma.session.deleteMany();
  await prisma.patientObservation.deleteMany();
  await prisma.patientMedication.deleteMany();
  await prisma.patientCondition.deleteMany();
  await prisma.patientAllergy.deleteMany();
  await prisma.patient.deleteMany();

  const patients = readCsv('patient.csv');
  console.log(`Seeding ${patients.length} patients...`);

  for (const p of patients) {
    await prisma.patient.create({
      data: {
        id: p.id,
        nameFirst: p.name_first,
        nameLast: p.name_last,
        dob: p.dob || null,
        gender: p.gender || null,
        ethnicityDescription: p.ethnicity_description || null,
        legalMailingAddress: p.legal_mailing_address || null,
        unitDescription: p.unit_description || null,
        floorDescription: p.floor_description || null,
        roomDescription: p.room_description || null,
        bedDescription: p.bed_description || null,
        status: p.status || null,
        admissionTime: p.admission_time || null,
        dischargeTime: p.discharge_time || null,
        deathTime: p.death_time || null,
        email: p.email || null,
        phone: p.phone || null,
        outpatient: p.outpatient || null,
        revBy: p.rev_by || null,
        revTime: p.rev_time || null,
        onLeave: p.on_leave || null,
        group: p.group,
      },
    });
  }

  const allergies = readCsv('patient_allergy.csv');
  for (const a of allergies) {
    await prisma.patientAllergy.create({
      data: {
        id: a.id,
        patientId: a.patient_id,
        allergen: a.allergen || null,
        category: a.category || null,
        clinicalStatus: a.clinical_status || null,
        createdBy: a.created_by || null,
        createdTime: a.created_time || null,
        onsetDate: a.onset_date || null,
        reactionNote: a.reaction_note || null,
        reactionType: a.reaction_type || null,
        reactionSubType: a.reaction_sub_type || null,
        resolvedDate: a.resolved_date || null,
        revBy: a.rev_by || null,
        revTime: a.rev_time || null,
        severity: a.severity || null,
        type: a.type || null,
      },
    });
  }

  const conditions = readCsv('patient_condition.csv');
  for (const c of conditions) {
    await prisma.patientCondition.create({
      data: {
        id: c.id,
        patientId: c.patient_id,
        clinicalStatus: c.clinical_status || null,
        createdBy: c.created_by || null,
        createdTime: c.created_time || null,
        icd10Code: c.icd_10_code || null,
        icd10Description: c.icd_10_description || null,
        onsetDate: c.onset_date || null,
        isPrimaryDiagnosis: c.is_primary_diagnosis || null,
        resolvedDate: c.resolved_date || null,
        revBy: c.rev_by || null,
        revTime: c.rev_time || null,
      },
    });
  }

  const medications = readCsv('patient_medication.csv');
  for (const m of medications) {
    await prisma.patientMedication.create({
      data: {
        id: m.id,
        patientId: m.patient_id,
        createdTime: m.created_time || null,
        description: m.description || null,
        directions: m.directions || null,
        genericName: m.generic_name || null,
        narcotic: m.narcotic || null,
        orderTime: m.order_time || null,
        revTime: m.rev_time || null,
        rxNormId: m.rx_norm_id || null,
        startTime: m.start_time || null,
        status: m.status || null,
        strength: m.strength || null,
        strengthUnit: m.strength_unit || null,
      },
    });
  }

  const observations = readCsv('patient_observation.csv');
  for (const o of observations) {
    await prisma.patientObservation.create({
      data: {
        id: o.id,
        patientId: o.patient_id,
        method: o.method || null,
        recordedBy: o.recorded_by || null,
        recordedTime: o.recorded_time || null,
        data: o.data || null,
      },
    });
  }

  const groupCounts = await prisma.patient.groupBy({
    by: ['group'],
    _count: true,
  });
  console.log('Group distribution:', groupCounts);
  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
