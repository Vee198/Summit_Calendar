-- Summit Calendar Tracking - Database Schema
-- Run: wrangler d1 execute summit-calendar-db --file=./schema.sql

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  location TEXT DEFAULT '',
  start_time TEXT NOT NULL,       -- ISO 8601 format
  end_time TEXT NOT NULL,         -- ISO 8601 format
  category TEXT DEFAULT 'meeting', -- meeting, travel, personal, deadline, other
  color TEXT DEFAULT '#3B82F6',
  priority TEXT DEFAULT 'normal', -- low, normal, high, urgent
  status TEXT DEFAULT 'scheduled', -- scheduled, in_progress, completed, cancelled
  reminder_sent INTEGER DEFAULT 0,
  notify_line INTEGER DEFAULT 1,
  notify_email INTEGER DEFAULT 0,
  recurrence TEXT DEFAULT NULL,   -- daily, weekly, monthly, yearly, null
  recurrence_end TEXT DEFAULT NULL,
  notes TEXT DEFAULT '',
  owner_id TEXT DEFAULT 'shared',   -- 'shared' = ทุกคนเห็น, 'nopamas'/'jatuporn'/'warunee' = เจ้าของ
  shared_with TEXT DEFAULT '',      -- comma-separated user IDs for shared notifications (e.g. 'nopamas,jatuporn')
  created_by TEXT DEFAULT 'admin',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  channel TEXT NOT NULL,          -- line, email, browser
  status TEXT NOT NULL,           -- sent, failed
  sent_at TEXT DEFAULT (datetime('now')),
  response TEXT DEFAULT '',
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Default settings
INSERT OR IGNORE INTO settings (key, value) VALUES ('reminder_minutes', '15');
INSERT OR IGNORE INTO settings (key, value) VALUES ('line_notify_enabled', 'true');
INSERT OR IGNORE INTO settings (key, value) VALUES ('company_name', 'Summit Auto Body Industry');

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,               -- 'create', 'update', 'delete'
  event_id INTEGER,                   -- NULL if event was deleted
  event_title TEXT NOT NULL,          -- snapshot of title at time of action
  changed_by TEXT NOT NULL,           -- username (e.g. 'admin')
  changed_at TEXT DEFAULT (datetime('now')),
  old_data TEXT DEFAULT '',           -- JSON snapshot of old values (for update/delete)
  new_data TEXT DEFAULT ''            -- JSON snapshot of new values (for create/update)
);

CREATE TABLE IF NOT EXISTS holidays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'bank',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_start ON events(start_time);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_reminder ON events(reminder_sent, start_time);
CREATE INDEX IF NOT EXISTS idx_events_owner ON events(owner_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_changed_at ON audit_log(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_holidays_date ON holidays(date);
