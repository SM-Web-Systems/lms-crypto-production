-- Migration: Add mint_operation_key to nft_credentials
-- Status: PREPARED — NOT EXECUTED — requires separate approval
-- Date: 2026-08-20
-- Purpose: Durable idempotency for enhanced NFT provider
--
-- This migration adds a mint_operation_key column and unique index
-- to prevent duplicate mint operations across process restarts.
--
-- IMPORTANT: Do NOT execute this migration without explicit approval.
-- The enhanced provider remains disabled (NFT_PROVIDER defaults to legacy).
--
-- SQLite ALTER TABLE safety:
--   PRAGMA foreign_keys=OFF and PRAGMA legacy_alter_table=ON are required
--   before rename-based DDL on SQLite >=3.26.0 to prevent FK rewriting.
--   However, ALTER TABLE ADD COLUMN does not require these pragmas.

-- Step 1: Add column (safe — ALTER TABLE ADD COLUMN is non-destructive)
ALTER TABLE nft_credentials ADD COLUMN mint_operation_key TEXT;

-- Step 2: Create unique index for durable idempotency
-- Only enforced when mint_operation_key is set (partial index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_nft_credentials_operation_key
  ON nft_credentials(mint_operation_key)
  WHERE mint_operation_key IS NOT NULL;

-- Step 3: Create index for fast lookup by user+course+status
CREATE INDEX IF NOT EXISTS idx_nft_credentials_user_course_status
  ON nft_credentials(user_id, course_id, mint_status);

-- Rollback:
-- DROP INDEX IF EXISTS idx_nft_credentials_operation_key;
-- DROP INDEX IF EXISTS idx_nft_credentials_user_course_status;
-- ALTER TABLE nft_credentials DROP COLUMN mint_operation_key;
-- (Note: ALTER TABLE DROP COLUMN requires SQLite >=3.35.0)
