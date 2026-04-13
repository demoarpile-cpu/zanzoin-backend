-- Migration: Add created_by column to companies table
-- This tracks which super_admin created each personal client
-- Run this once against the database

ALTER TABLE companies ADD COLUMN IF NOT EXISTS created_by INT DEFAULT NULL AFTER source;

-- Backfill: Set created_by for existing personal clients to the first super_admin user
UPDATE companies c
SET c.created_by = (SELECT id FROM users WHERE role = 'super_admin' LIMIT 1)
WHERE (c.tagline = 'Personal' OR c.client_type = 'Personal' OR c.plan = 'Free')
  AND c.created_by IS NULL;
