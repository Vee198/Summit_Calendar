-- Add shared_with column to events table
-- shared_with stores comma-separated user IDs (e.g. 'nopamas,jatuporn')
-- Empty string or NULL = not shared (only creator + admin get notified)
-- Run: wrangler d1 execute summit-calendar-db --file=./migration_shared_with.sql

ALTER TABLE events ADD COLUMN shared_with TEXT DEFAULT '';
