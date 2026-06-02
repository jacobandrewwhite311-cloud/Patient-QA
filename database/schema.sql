-- Carebrain Patient Q&A AI Assistant - PostgreSQL Schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS patients (
    patient_id UUID PRIMARY KEY,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    cohort VARCHAR(1) NOT NULL CHECK (cohort IN ('A', 'B')),
    dob DATE,
    gender VARCHAR(50),
    status VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_patients_cohort ON patients (cohort);
CREATE INDEX idx_patients_name ON patients (cohort, LOWER(first_name), LOWER(last_name));

CREATE TABLE IF NOT EXISTS patient_allergy (
    id UUID PRIMARY KEY,
    patient_id UUID NOT NULL REFERENCES patients (patient_id) ON DELETE CASCADE,
    allergen VARCHAR(500),
    category VARCHAR(100),
    clinical_status VARCHAR(50),
    severity VARCHAR(50),
    reaction_type VARCHAR(255),
    cohort VARCHAR(1) NOT NULL CHECK (cohort IN ('A', 'B'))
);

CREATE INDEX idx_patient_allergy_patient_cohort ON patient_allergy (patient_id, cohort);

CREATE TABLE IF NOT EXISTS patient_condition (
    id UUID PRIMARY KEY,
    patient_id UUID NOT NULL REFERENCES patients (patient_id) ON DELETE CASCADE,
    icd_10_code VARCHAR(20),
    icd_10_description TEXT,
    clinical_status VARCHAR(50),
    is_primary_diagnosis BOOLEAN DEFAULT FALSE,
    cohort VARCHAR(1) NOT NULL CHECK (cohort IN ('A', 'B'))
);

CREATE INDEX idx_patient_condition_patient_cohort ON patient_condition (patient_id, cohort);

CREATE TABLE IF NOT EXISTS patient_medication (
    id UUID PRIMARY KEY,
    patient_id UUID NOT NULL REFERENCES patients (patient_id) ON DELETE CASCADE,
    description TEXT,
    generic_name VARCHAR(255),
    strength VARCHAR(50),
    strength_unit VARCHAR(50),
    directions TEXT,
    status VARCHAR(50),
    cohort VARCHAR(1) NOT NULL CHECK (cohort IN ('A', 'B'))
);

CREATE INDEX idx_patient_medication_patient_cohort ON patient_medication (patient_id, cohort);

CREATE TABLE IF NOT EXISTS patient_observation (
    id UUID PRIMARY KEY,
    patient_id UUID NOT NULL REFERENCES patients (patient_id) ON DELETE CASCADE,
    method VARCHAR(100),
    recorded_time TIMESTAMPTZ,
    data JSONB,
    cohort VARCHAR(1) NOT NULL CHECK (cohort IN ('A', 'B'))
);

CREATE INDEX idx_patient_observation_patient_cohort ON patient_observation (patient_id, cohort);

CREATE TABLE IF NOT EXISTS chat_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id UUID NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cohort VARCHAR(1) NOT NULL,
    patient_id UUID,
    variant VARCHAR(1),
    retrieved_records JSONB NOT NULL DEFAULT '[]',
    prompt_version VARCHAR(50),
    user_query TEXT NOT NULL,
    raw_model_output TEXT,
    final_answer TEXT,
    confidence VARCHAR(20),
    citations JSONB NOT NULL DEFAULT '[]',
    injection_detected BOOLEAN NOT NULL DEFAULT FALSE,
    security_violation BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_chat_logs_cohort ON chat_logs (cohort);
CREATE INDEX idx_chat_logs_timestamp ON chat_logs (timestamp DESC);

CREATE TABLE IF NOT EXISTS security_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cohort VARCHAR(1),
    request_id UUID,
    event_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    user_query TEXT,
    details JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_security_events_severity ON security_events (severity, timestamp DESC);

CREATE TABLE IF NOT EXISTS evaluation_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id UUID NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    category VARCHAR(50) NOT NULL,
    test_case_id VARCHAR(100) NOT NULL,
    cohort VARCHAR(1),
    passed BOOLEAN NOT NULL,
    accuracy NUMERIC(5, 4),
    grounding_rate NUMERIC(5, 4),
    citation_rate NUMERIC(5, 4),
    security_block_rate NUMERIC(5, 4),
    cohort_isolation_success_rate NUMERIC(5, 4),
    expected_behavior TEXT,
    actual_response JSONB,
    notes TEXT
);

CREATE INDEX idx_evaluation_results_run ON evaluation_results (run_id, category);

CREATE TABLE IF NOT EXISTS experiment_assignments (
    patient_id UUID PRIMARY KEY REFERENCES patients (patient_id) ON DELETE CASCADE,
    variant VARCHAR(1) NOT NULL CHECK (variant IN ('A', 'B')),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    assignment_method VARCHAR(50) NOT NULL DEFAULT 'hash_mod_2'
);
