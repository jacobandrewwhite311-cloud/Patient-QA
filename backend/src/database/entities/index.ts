import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('patients')
@Index(['cohort', 'firstName', 'lastName'])
export class PatientEntity {
  @PrimaryColumn({ name: 'patient_id', type: 'uuid' })
  patientId!: string;

  @Column({ name: 'first_name', type: 'varchar', length: 255 })
  firstName!: string;

  @Column({ name: 'last_name', type: 'varchar', length: 255 })
  lastName!: string;

  @Column({ type: 'varchar', length: 1 })
  cohort!: string;

  @Column({ type: 'date', nullable: true })
  dob!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  gender!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  ethnicity!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  status!: string | null;

  @Column({ name: 'unit_description', type: 'varchar', length: 255, nullable: true })
  unitDescription!: string | null;

  @Column({ name: 'floor_description', type: 'varchar', length: 255, nullable: true })
  floorDescription!: string | null;

  @Column({ name: 'room_description', type: 'varchar', length: 255, nullable: true })
  roomDescription!: string | null;

  @Column({ name: 'bed_description', type: 'varchar', length: 255, nullable: true })
  bedDescription!: string | null;

  @Column({ name: 'admission_time', type: 'timestamptz', nullable: true })
  admissionTime!: Date | null;

  @Column({ name: 'discharge_time', type: 'timestamptz', nullable: true })
  dischargeTime!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}

@Entity('patient_allergy')
export class PatientAllergyEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'patient_id', type: 'uuid' })
  patientId!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  allergen!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  category!: string | null;

  @Column({ name: 'clinical_status', type: 'varchar', length: 50, nullable: true })
  clinicalStatus!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  severity!: string | null;

  @Column({ name: 'reaction_type', type: 'varchar', length: 255, nullable: true })
  reactionType!: string | null;

  @Column({ type: 'varchar', length: 1 })
  cohort!: string;
}

@Entity('patient_condition')
export class PatientConditionEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'patient_id', type: 'uuid' })
  patientId!: string;

  @Column({ name: 'icd_10_code', type: 'varchar', length: 20, nullable: true })
  icd10Code!: string | null;

  @Column({ name: 'icd_10_description', type: 'text', nullable: true })
  icd10Description!: string | null;

  @Column({ name: 'clinical_status', type: 'varchar', length: 50, nullable: true })
  clinicalStatus!: string | null;

  @Column({ name: 'is_primary_diagnosis', type: 'boolean', default: false })
  isPrimaryDiagnosis!: boolean;

  @Column({ type: 'varchar', length: 1 })
  cohort!: string;
}

@Entity('patient_medication')
export class PatientMedicationEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'patient_id', type: 'uuid' })
  patientId!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'generic_name', type: 'varchar', length: 255, nullable: true })
  genericName!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  strength!: string | null;

  @Column({ name: 'strength_unit', type: 'varchar', length: 50, nullable: true })
  strengthUnit!: string | null;

  @Column({ type: 'text', nullable: true })
  directions!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  status!: string | null;

  @Column({ type: 'varchar', length: 1 })
  cohort!: string;
}

@Entity('patient_observation')
export class PatientObservationEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'patient_id', type: 'uuid' })
  patientId!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  method!: string | null;

  @Column({ name: 'recorded_time', type: 'timestamptz', nullable: true })
  recordedTime!: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  data!: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 1 })
  cohort!: string;
}

@Entity('chat_logs')
export class ChatLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'request_id', type: 'uuid' })
  requestId!: string;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  timestamp!: Date;

  @Column({ type: 'varchar', length: 1 })
  cohort!: string;

  @Column({ name: 'patient_id', type: 'uuid', nullable: true })
  patientId!: string | null;

  @Column({ type: 'varchar', length: 1, nullable: true })
  variant!: string | null;

  @Column({ name: 'retrieved_records', type: 'jsonb', default: [] })
  retrievedRecords!: unknown[];

  @Column({ name: 'prompt_version', type: 'varchar', length: 50, nullable: true })
  promptVersion!: string | null;

  @Column({ name: 'user_query', type: 'text' })
  userQuery!: string;

  @Column({ name: 'raw_model_output', type: 'text', nullable: true })
  rawModelOutput!: string | null;

  @Column({ name: 'final_answer', type: 'text', nullable: true })
  finalAnswer!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  confidence!: string | null;

  @Column({ type: 'jsonb', default: [] })
  citations!: unknown[];

  @Column({ name: 'injection_detected', type: 'boolean', default: false })
  injectionDetected!: boolean;

  @Column({ name: 'security_violation', type: 'boolean', default: false })
  securityViolation!: boolean;
}

@Entity('security_events')
export class SecurityEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  timestamp!: Date;

  @Column({ type: 'varchar', length: 1, nullable: true })
  cohort!: string | null;

  @Column({ name: 'request_id', type: 'uuid', nullable: true })
  requestId!: string | null;

  @Column({ name: 'event_type', type: 'varchar', length: 100 })
  eventType!: string;

  @Column({ type: 'varchar', length: 20 })
  severity!: string;

  @Column({ name: 'user_query', type: 'text', nullable: true })
  userQuery!: string | null;

  @Column({ type: 'jsonb', default: {} })
  details!: Record<string, unknown>;
}

@Entity('evaluation_results')
export class EvaluationResultEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'run_id', type: 'uuid' })
  runId!: string;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  timestamp!: Date;

  @Column({ type: 'varchar', length: 50 })
  category!: string;

  @Column({ name: 'test_case_id', type: 'varchar', length: 100 })
  testCaseId!: string;

  @Column({ type: 'varchar', length: 1, nullable: true })
  cohort!: string | null;

  @Column({ type: 'boolean' })
  passed!: boolean;

  @Column({ type: 'numeric', precision: 5, scale: 4, nullable: true })
  accuracy!: string | null;

  @Column({ name: 'grounding_rate', type: 'numeric', precision: 5, scale: 4, nullable: true })
  groundingRate!: string | null;

  @Column({ name: 'citation_rate', type: 'numeric', precision: 5, scale: 4, nullable: true })
  citationRate!: string | null;

  @Column({ name: 'security_block_rate', type: 'numeric', precision: 5, scale: 4, nullable: true })
  securityBlockRate!: string | null;

  @Column({ name: 'cohort_isolation_success_rate', type: 'numeric', precision: 5, scale: 4, nullable: true })
  cohortIsolationSuccessRate!: string | null;

  @Column({ name: 'expected_behavior', type: 'text', nullable: true })
  expectedBehavior!: string | null;

  @Column({ name: 'actual_response', type: 'jsonb', nullable: true })
  actualResponse!: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;
}

@Entity('experiment_assignments')
export class ExperimentAssignmentEntity {
  @PrimaryColumn({ name: 'patient_id', type: 'uuid' })
  patientId!: string;

  @Column({ type: 'varchar', length: 1 })
  variant!: string;

  @Column({ name: 'assigned_at', type: 'timestamptz', default: () => 'NOW()' })
  assignedAt!: Date;

  @Column({ name: 'assignment_method', type: 'varchar', length: 50, default: 'hash_mod_2' })
  assignmentMethod!: string;
}
