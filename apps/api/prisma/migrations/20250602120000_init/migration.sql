-- CreateTable
CREATE TABLE "patients" (
    "id" UUID NOT NULL,
    "name_first" TEXT NOT NULL,
    "name_last" TEXT NOT NULL,
    "dob" TEXT,
    "gender" TEXT,
    "ethnicity_description" TEXT,
    "legal_mailing_address" TEXT,
    "unit_description" TEXT,
    "floor_description" TEXT,
    "room_description" TEXT,
    "bed_description" TEXT,
    "status" TEXT,
    "admission_time" TEXT,
    "discharge_time" TEXT,
    "death_time" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "outpatient" TEXT,
    "rev_by" TEXT,
    "rev_time" TEXT,
    "on_leave" TEXT,
    "cohort_group" TEXT NOT NULL,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "patient_allergies" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "allergen" TEXT,
    "category" TEXT,
    "clinical_status" TEXT,
    "created_by" TEXT,
    "created_time" TEXT,
    "onset_date" TEXT,
    "reaction_note" TEXT,
    "reaction_type" TEXT,
    "reaction_sub_type" TEXT,
    "resolved_date" TEXT,
    "rev_by" TEXT,
    "rev_time" TEXT,
    "severity" TEXT,
    "type" TEXT,

    CONSTRAINT "patient_allergies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "patient_conditions" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "clinical_status" TEXT,
    "created_by" TEXT,
    "created_time" TEXT,
    "icd_10_code" TEXT,
    "icd_10_description" TEXT,
    "onset_date" TEXT,
    "is_primary_diagnosis" TEXT,
    "resolved_date" TEXT,
    "rev_by" TEXT,
    "rev_time" TEXT,

    CONSTRAINT "patient_conditions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "patient_medications" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "created_time" TEXT,
    "description" TEXT,
    "directions" TEXT,
    "generic_name" TEXT,
    "narcotic" TEXT,
    "order_time" TEXT,
    "rev_time" TEXT,
    "rx_norm_id" TEXT,
    "start_time" TEXT,
    "status" TEXT,
    "strength" TEXT,
    "strength_unit" TEXT,

    CONSTRAINT "patient_medications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "patient_observations" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "method" TEXT,
    "recorded_by" TEXT,
    "recorded_time" TEXT,
    "data" TEXT,

    CONSTRAINT "patient_observations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "token" UUID NOT NULL,
    "cohort_group" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "request_logs" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "cohort" TEXT NOT NULL,
    "prompt_variant" TEXT NOT NULL,
    "resolved_patient_id" UUID,
    "records_retrieved" JSONB NOT NULL DEFAULT '[]',
    "raw_model_output" TEXT,
    "structured_response" JSONB,
    "injection_attempt" BOOLEAN NOT NULL DEFAULT false,
    "cohort_violation" BOOLEAN NOT NULL DEFAULT false,
    "latency_ms" INTEGER NOT NULL,
    "user_message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");
CREATE INDEX "patients_cohort_group_idx" ON "patients"("cohort_group");
CREATE INDEX "patients_name_first_name_last_idx" ON "patients"("name_first", "name_last");
CREATE INDEX "patient_allergies_patient_id_idx" ON "patient_allergies"("patient_id");
CREATE INDEX "patient_conditions_patient_id_idx" ON "patient_conditions"("patient_id");
CREATE INDEX "patient_medications_patient_id_idx" ON "patient_medications"("patient_id");
CREATE INDEX "patient_observations_patient_id_idx" ON "patient_observations"("patient_id");
CREATE INDEX "request_logs_session_id_idx" ON "request_logs"("session_id");
CREATE INDEX "request_logs_created_at_idx" ON "request_logs"("created_at");

ALTER TABLE "patient_allergies" ADD CONSTRAINT "patient_allergies_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "patient_conditions" ADD CONSTRAINT "patient_conditions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "patient_medications" ADD CONSTRAINT "patient_medications_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "patient_observations" ADD CONSTRAINT "patient_observations_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "request_logs" ADD CONSTRAINT "request_logs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
