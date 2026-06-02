-- Migration: Add owner_id for multi-user calendar
-- Run: wrangler d1 execute summit-calendar-db --file=./migration_owner.sql

-- เพิ่ม column owner_id (default 'shared' สำหรับ events เก่าที่ทุกคนเห็น)
ALTER TABLE events ADD COLUMN owner_id TEXT DEFAULT 'shared';

-- Index สำหรับ filter ตาม owner
CREATE INDEX IF NOT EXISTS idx_events_owner ON events(owner_id);

-- อัพเดท events เก่าทั้งหมดให้เป็น 'shared' (ทุกคนเห็น)
UPDATE events SET owner_id = 'shared' WHERE owner_id IS NULL;
