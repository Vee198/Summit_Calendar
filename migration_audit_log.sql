-- Migration: Add audit_log table
-- Run: npx wrangler d1 execute summit-calendar-db --remote --file=./migration_audit_log.sql

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  event_id INTEGER,
  event_title TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  changed_at TEXT DEFAULT (datetime('now')),
  old_data TEXT DEFAULT '',
  new_data TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_audit_log_changed_at ON audit_log(changed_at DESC);
