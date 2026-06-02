-- Run once as superuser: psql -U postgres -f database/init-db.sql
-- Ignore errors if user/database already exist.

CREATE USER carebrain WITH PASSWORD 'carebrain';
CREATE DATABASE carebrain OWNER carebrain;
