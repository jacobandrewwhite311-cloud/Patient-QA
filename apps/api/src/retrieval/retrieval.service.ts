import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  PatientMatch,
  ResolvePatientResult,
  RetrievedRecord,
} from './retrieval.types';

const UUID_REGEX =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

@Injectable()
export class RetrievalService {
  constructor(private readonly prisma: PrismaService) {}

  async resolvePatient(query: string, cohort: string): Promise<ResolvePatientResult> {
    const uuidMatches = query.match(UUID_REGEX);
    if (uuidMatches?.length) {
      for (const id of uuidMatches) {
        const patient = await this.prisma.patient.findFirst({
          where: { id: id.toLowerCase(), group: cohort },
        });
        if (patient) {
          return {
            match: {
              patientId: patient.id,
              matchType: 'uuid',
              displayName: `${patient.nameFirst} ${patient.nameLast}`,
            },
            ambiguous: false,
          };
        }
      }
    }

    const namePattern = /([A-Za-z][A-Za-z'-]+)\s+([A-Za-z][A-Za-z'-]+)/g;
    const nameMatches = [...query.matchAll(namePattern)];

    for (const m of nameMatches) {
      const first = m[1];
      const last = m[2];
      const patients = await this.prisma.patient.findMany({
        where: {
          group: cohort,
          nameFirst: { equals: first, mode: 'insensitive' },
          nameLast: { equals: last, mode: 'insensitive' },
        },
      });
      if (patients.length === 1) {
        const p = patients[0];
        return {
          match: {
            patientId: p.id,
            matchType: 'full_name',
            displayName: `${p.nameFirst} ${p.nameLast}`,
          },
          ambiguous: false,
        };
      }
      if (patients.length > 1) {
        return {
          match: null,
          ambiguous: true,
          candidates: patients.map((p) => ({
            patientId: p.id,
            matchType: 'full_name' as const,
            displayName: `${p.nameFirst} ${p.nameLast}`,
          })),
        };
      }
    }

    const tokens = query
      .replace(/[^a-zA-Z\s'-]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2);

    if (tokens.length >= 1) {
      const partialMatches: PatientMatch[] = [];
      for (const token of tokens) {
        const found = await this.prisma.patient.findMany({
          where: {
            group: cohort,
            OR: [
              { nameFirst: { contains: token, mode: 'insensitive' } },
              { nameLast: { contains: token, mode: 'insensitive' } },
            ],
          },
          take: 5,
        });
        for (const p of found) {
          if (!partialMatches.some((m) => m.patientId === p.id)) {
            partialMatches.push({
              patientId: p.id,
              matchType: 'partial_name',
              displayName: `${p.nameFirst} ${p.nameLast}`,
            });
          }
        }
      }
      if (partialMatches.length === 1) {
        return { match: partialMatches[0], ambiguous: false };
      }
      if (partialMatches.length > 1) {
        return { match: null, ambiguous: true, candidates: partialMatches };
      }
    }

    return { match: null, ambiguous: false };
  }

  async getPatientRecords(
    patientId: string,
    cohort: string,
  ): Promise<RetrievedRecord[]> {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, group: cohort },
    });

    if (!patient) {
      return [];
    }

    const [allergies, conditions, medications, observations] = await Promise.all([
      this.prisma.patientAllergy.findMany({ where: { patientId } }),
      this.prisma.patientCondition.findMany({ where: { patientId } }),
      this.prisma.patientMedication.findMany({ where: { patientId } }),
      this.prisma.patientObservation.findMany({ where: { patientId } }),
    ]);

    const records: RetrievedRecord[] = [];

    for (const a of allergies) {
      records.push({
        table: 'patient_allergies',
        recordId: a.id,
        patientId,
        summaryText: `Allergy: ${a.allergen ?? 'unknown'} (${a.category ?? 'n/a'}), severity: ${a.severity ?? 'n/a'}, status: ${a.clinicalStatus ?? 'n/a'}`,
        raw: a as unknown as Record<string, unknown>,
      });
    }

    for (const c of conditions) {
      records.push({
        table: 'patient_conditions',
        recordId: c.id,
        patientId,
        summaryText: `Condition: ${c.icd10Description ?? c.icd10Code ?? 'unknown'} (${c.icd10Code ?? 'n/a'}), status: ${c.clinicalStatus ?? 'n/a'}`,
        raw: c as unknown as Record<string, unknown>,
      });
    }

    for (const m of medications) {
      records.push({
        table: 'patient_medications',
        recordId: m.id,
        patientId,
        summaryText: `Medication: ${m.description ?? m.genericName ?? 'unknown'}, ${m.strength ?? ''} ${m.strengthUnit ?? ''}, status: ${m.status ?? 'n/a'}`,
        raw: m as unknown as Record<string, unknown>,
      });
    }

    for (const o of observations) {
      records.push({
        table: 'patient_observations',
        recordId: o.id,
        patientId,
        summaryText: `Observation (${o.method ?? 'n/a'}): ${(o.data ?? '').slice(0, 200)}`,
        raw: o as unknown as Record<string, unknown>,
      });
    }

    return records;
  }

  async findPatientInOtherCohort(
    query: string,
    sessionCohort: string,
  ): Promise<boolean> {
    const otherCohort = sessionCohort === 'A' ? 'B' : 'A';
    const result = await this.resolvePatient(query, otherCohort);
    return result.match !== null;
  }

  async getAllPatientNames(): Promise<{ id: string; name: string; group: string }[]> {
    const patients = await this.prisma.patient.findMany({
      select: { id: true, nameFirst: true, nameLast: true, group: true },
    });
    return patients.map((p) => ({
      id: p.id,
      name: `${p.nameFirst} ${p.nameLast}`,
      group: p.group,
    }));
  }
}
