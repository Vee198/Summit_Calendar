// Summit Calendar Tracking - Cloudflare Worker Backend
// Handles API routes, authentication, D1 database, and Telegram Bot API

import VIEWER_PINS from './pins.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Unicode-safe base64 helpers (รองรับภาษาไทยและ Unicode ทุกตัว)
function b64encode(str) {
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16))));
}
function b64decode(str) {
  return decodeURIComponent(atob(str).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
}

// Simple JWT-like token (base64 encoded, for Cloudflare Workers)
function createToken(payload, secret) {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64encode(JSON.stringify({ ...payload, exp: Date.now() + 24 * 60 * 60 * 1000 }));
  const signature = btoa(secret + '.' + header + '.' + body);
  return `${header}.${body}.${signature}`;
}

function verifyToken(token, secret) {
  try {
    const [header, body, signature] = token.split('.');
    const expectedSig = btoa(secret + '.' + header + '.' + body);
    if (signature !== expectedSig) return null;
    const payload = JSON.parse(b64decode(body));
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// ─── Telegram Bot API (Free, Unlimited) ───────────────────────────────────────
// Setup: @BotFather on Telegram → /newbot → get BOT_TOKEN
//        Message your bot → use @userinfobot or getUpdates to get CHAT_ID
// Send to a single chat
async function sendTelegramSingle(botToken, chatId, message) {
  try {
    const resp = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId.trim(),
          text: message,
          parse_mode: 'HTML',
        }),
      }
    );
    const data = await resp.json();
    return { chatId: chatId.trim(), ok: resp.ok && data.ok, data };
  } catch (e) {
    return { chatId: chatId.trim(), ok: false, error: e.message };
  }
}

// Send to ALL chat IDs (comma-separated in env)
async function sendTelegram(botToken, chatIds, message) {
  if (!botToken || botToken === 'YOUR_TELEGRAM_BOT_TOKEN') {
    console.log('Telegram token not configured, skipping:', message);
    return { ok: false, error: 'Token not configured' };
  }
  const ids = chatIds.split(',').map(id => id.trim()).filter(Boolean);
  const results = await Promise.all(
    ids.map(id => sendTelegramSingle(botToken, id, message))
  );
  const allOk = results.every(r => r.ok);
  return { ok: allOk, results };
}

// ─── Resolve user IDs to Telegram Chat IDs ──────────────────────────────────
// Always includes Admin Chat ID. Adds creator + shared users' Chat IDs.
function resolveNotifyChatIds(env, createdBy, sharedWith) {
  const ADMIN_CHAT_ID = '8549681576'; // Admin always receives
  const chatIds = new Set([ADMIN_CHAT_ID]);

  // Map creator (userId or name) to their Chat ID
  const creatorViewer = VIEWER_PINS.find(v => v.id === createdBy || v.name === createdBy);
  if (creatorViewer?.telegram_chat_id) {
    chatIds.add(creatorViewer.telegram_chat_id);
  }

  // Map shared users to their Chat IDs
  if (sharedWith) {
    const sharedUserIds = sharedWith.split(',').map(s => s.trim()).filter(Boolean);
    for (const uid of sharedUserIds) {
      const viewer = VIEWER_PINS.find(v => v.id === uid);
      if (viewer?.telegram_chat_id) {
        chatIds.add(viewer.telegram_chat_id);
      }
    }
  }

  return [...chatIds].join(',');
}

// Check for upcoming events and send reminders
async function checkReminders(env) {
  const now = new Date();
  const reminderMinutes = 15;
  const checkWindowStart = new Date(now.getTime() + (reminderMinutes - 1) * 60000);
  const checkWindowEnd = new Date(now.getTime() + (reminderMinutes + 1) * 60000);

  const events = await env.DB.prepare(
    `SELECT * FROM events
     WHERE reminder_sent = 0
     AND status = 'scheduled'
     AND start_time BETWEEN ? AND ?`
  ).bind(checkWindowStart.toISOString(), checkWindowEnd.toISOString()).all();

  for (const event of events.results || []) {
    const startTime = new Date(event.start_time);
    const timeStr = startTime.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
    const message = `🔔 <b>แจ้งเตือนงาน Summit</b>\n\n📌 <b>${event.title}</b>\n⏰ เริ่มในอีก <b>${reminderMinutes} นาที</b>\n🕐 เวลา: ${timeStr}\n📍 สถานที่: ${event.location || '-'}\n📝 รายละเอียด: ${event.description || '-'}`;

    if (event.notify_line) {
      // Smart notification: send to creator + shared users + always Admin
      const targetChatIds = resolveNotifyChatIds(env, event.owner_id, event.shared_with || '');
      const result = await sendTelegram(env.TELEGRAM_BOT_TOKEN, targetChatIds, message);
      await env.DB.prepare(
        `INSERT INTO notifications_log (event_id, channel, status, response) VALUES (?, 'telegram', ?, ?)`
      ).bind(event.id, result.ok ? 'sent' : 'failed', JSON.stringify(result)).run();
    }

    await env.DB.prepare(
      `UPDATE events SET reminder_sent = 1 WHERE id = ?`
    ).bind(event.id).run();
  }

  return events.results?.length || 0;
}

// API Router
async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // CORS preflight
  if (method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  // ─── Telegram Webhook (no auth — Telegram calls this directly) ───
  if (path === '/api/telegram/webhook' && method === 'POST') {
    try {
      const update = await request.json();
      const message = update.message;
      if (!message || !message.text) return new Response('OK');

      const chatId = String(message.chat.id);
      const text = message.text.trim();
      const botToken = env.TELEGRAM_BOT_TOKEN;
      const firstName = message.from?.first_name || 'User';

      if (text === '/start') {
        await sendTelegramSingle(botToken, chatId,
          `👋 สวัสดีครับ <b>${firstName}</b>!\n\nยินดีต้อนรับสู่ <b>Summit Calendar Bot</b> 📅\n\nChat ID ของคุณ: <code>${chatId}</code>\n\nคำสั่งที่ใช้ได้:\n/test — ทดสอบการแจ้งเตือน\n/mychatid — ดู Chat ID ของคุณ\n/status — ดูสถานะระบบ`
        );
      } else if (text === '/test') {
        const configuredIds = (env.TELEGRAM_CHAT_ID || '').split(',').map(id => id.trim()).filter(Boolean);
        const isRegistered = configuredIds.includes(chatId);
        const now = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
        if (isRegistered) {
          await sendTelegramSingle(botToken, chatId,
            `✅ <b>ทดสอบสำเร็จ!</b>\n\n🔔 Chat ID <code>${chatId}</code> ได้รับการลงทะเบียนแล้ว\n📅 คุณจะได้รับแจ้งเตือนจาก Summit Calendar\n⏰ เวลา: ${now}`
          );
        } else {
          await sendTelegramSingle(botToken, chatId,
            `⚠️ <b>Chat ID ยังไม่ได้ลงทะเบียน</b>\n\nChat ID ของคุณ: <code>${chatId}</code>\n❌ ยังไม่อยู่ในรายชื่อรับแจ้งเตือน\n\nกรุณาแจ้ง Admin เพื่อเพิ่ม Chat ID ของคุณ`
          );
        }
      } else if (text === '/mychatid') {
        await sendTelegramSingle(botToken, chatId,
          `🆔 Chat ID ของคุณ: <code>${chatId}</code>`
        );
      } else if (text === '/status') {
        const configuredIds = (env.TELEGRAM_CHAT_ID || '').split(',').map(id => id.trim()).filter(Boolean);
        const isRegistered = configuredIds.includes(chatId);
        const now = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
        await sendTelegramSingle(botToken, chatId,
          `📊 <b>Summit Calendar Status</b>\n\n⏰ เวลา: ${now}\n🤖 Bot: ทำงานปกติ ✅\n👥 ผู้รับแจ้งเตือน: ${configuredIds.length} คน\n${isRegistered ? '✅ คุณอยู่ในรายชื่อรับแจ้งเตือน' : '❌ คุณยังไม่อยู่ในรายชื่อ'}`
        );
      }

      return new Response('OK');
    } catch (e) {
      console.error('Telegram webhook error:', e);
      return new Response('OK');
    }
  }

  // Serve static files via Assets binding (Wrangler 4.x)
  if (!path.startsWith('/api/')) {
    return env.ASSETS.fetch(request);
  }

  // JSON helper
  const json = (data, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });

  // Auth middleware helper — accepts token from Authorization header OR ?token= query param (for file downloads)
  const requireAuth = (roles = ['admin']) => {
    let token = url.searchParams.get('token');
    if (!token) {
      const authHeader = request.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) return null;
      token = authHeader.slice(7);
    }
    const payload = verifyToken(token, env.JWT_SECRET);
    if (!payload || !roles.includes(payload.role)) return null;
    return payload;
  };

  try {
    // ============ AUTH ROUTES ============

    // Admin Login
    if (path === '/api/auth/login' && method === 'POST') {
      const { username, password } = await request.json();
      if (username === env.ADMIN_USER && password === env.ADMIN_PASS) {
        const token = createToken({ role: 'admin', user: username }, env.JWT_SECRET);
        return json({ success: true, token, role: 'admin' });
      }
      return json({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' }, 401);
    }

    // Viewer PIN — ตรวจสอบจาก pins.js (รองรับหลาย user)
    if (path === '/api/auth/pin' && method === 'POST') {
      const { pin } = await request.json();
      const viewer = VIEWER_PINS.find(v => v.pin === pin && v.active);
      if (viewer) {
        const token = createToken({ role: 'viewer', name: viewer.name, userId: viewer.id }, env.JWT_SECRET);
        return json({ success: true, token, role: 'viewer', name: viewer.name, userId: viewer.id });
      }
      // ไม่มี fallback — ใช้เฉพาะ pins.js เท่านั้น
      return json({ success: false, message: 'PIN ไม่ถูกต้อง' }, 401);
    }

    // Verify token
    if (path === '/api/auth/verify' && method === 'GET') {
      const payload = requireAuth(['admin', 'viewer']);
      if (!payload) return json({ valid: false }, 401);
      return json({ valid: true, role: payload.role });
    }

    // ============ USER ROUTES ============

    // List all active viewer users (for calendar switcher dropdown)
    if (path === '/api/users' && method === 'GET') {
      const auth = requireAuth(['admin', 'viewer']);
      if (!auth) return json({ error: 'Unauthorized' }, 401);
      const users = VIEWER_PINS.filter(v => v.active).map(v => ({ id: v.id, name: v.name }));
      return json({ users });
    }

    // ============ EVENT ROUTES ============

    // Get events (both admin and viewer) — supports multi-user filtering
    if (path === '/api/events' && method === 'GET') {
      const auth = requireAuth(['admin', 'viewer']);
      if (!auth) return json({ error: 'Unauthorized' }, 401);

      const start = url.searchParams.get('start');
      const end = url.searchParams.get('end');
      const status = url.searchParams.get('status');
      const viewAs = url.searchParams.get('view_as'); // ดูตารางของคนอื่น

      let query = 'SELECT * FROM events WHERE 1=1';
      const params = [];

      // Multi-user filter: admin เห็นทั้งหมด, viewer เห็นเฉพาะของตัวเอง + shared
      if (auth.role === 'admin') {
        if (viewAs) {
          // Admin เลือกดูของคนใดคนหนึ่ง
          query += " AND (owner_id = ? OR owner_id = 'shared')";
          params.push(viewAs);
        }
        // ถ้าไม่ระบุ view_as → admin เห็นทั้งหมด
      } else {
        // Viewer: เห็นของตัวเอง + shared + ถ้า view_as ระบุก็ดูข้ามได้ (read-only จัดการที่ frontend)
        const targetUser = viewAs || auth.userId || 'shared';
        query += " AND (owner_id = ? OR owner_id = 'shared')";
        params.push(targetUser);
      }

      if (start) { query += ' AND end_time >= ?'; params.push(start); }
      if (end) { query += ' AND start_time <= ?'; params.push(end); }
      if (status) { query += ' AND status = ?'; params.push(status); }

      query += ' ORDER BY start_time ASC';

      const stmt = env.DB.prepare(query);
      const events = params.length > 0 ? await stmt.bind(...params).all() : await stmt.all();
      return json({ events: events.results || [] });
    }

    // Get single event
    if (path.match(/^\/api\/events\/\d+$/) && method === 'GET') {
      const auth = requireAuth(['admin', 'viewer']);
      if (!auth) return json({ error: 'Unauthorized' }, 401);

      const id = path.split('/').pop();
      const event = await env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(id).first();
      if (!event) return json({ error: 'Event not found' }, 404);
      return json({ event });
    }

    // Check overlap (admin + viewer — ใช้ตอน save event)
    if (path === '/api/events/check-overlap' && method === 'POST') {
      const auth = requireAuth(['admin', 'viewer']);
      if (!auth) return json({ error: 'Unauthorized' }, 401);

      const { start_time, end_time, exclude_id } = await request.json();
      let query = `SELECT * FROM events WHERE status != 'cancelled' AND start_time < ? AND end_time > ?`;
      const params = [end_time, start_time];

      if (exclude_id) {
        query += ' AND id != ?';
        params.push(exclude_id);
      }

      const overlaps = await env.DB.prepare(query).bind(...params).all();
      return json({ overlaps: overlaps.results || [] });
    }

    // Create event (admin + viewer ระดับ 2)
    if (path === '/api/events' && method === 'POST') {
      const auth = requireAuth(['admin', 'viewer']);
      if (!auth) return json({ error: 'Unauthorized' }, 401);

      const data = await request.json();

      // Viewer สร้างได้เฉพาะ event ของตัวเองเท่านั้น (ไม่สามารถสร้างให้คนอื่นได้)
      const ownerId = auth.role === 'admin'
        ? (data.owner_id || 'shared')
        : (auth.userId || 'shared');

      const createdBy = auth.role === 'admin' ? (auth.user || 'admin') : (auth.name || auth.userId || 'viewer');

      const sharedWith = data.shared_with || '';

      const result = await env.DB.prepare(
        `INSERT INTO events (title, description, location, start_time, end_time, category, color, priority, status, notify_line, notify_email, recurrence, recurrence_end, notes, owner_id, created_by, shared_with)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        data.title, data.description || '', data.location || '',
        data.start_time, data.end_time,
        data.category || 'meeting', data.color || '#3B82F6',
        data.priority || 'normal', data.status || 'scheduled',
        data.notify_line ? 1 : 0, data.notify_email ? 1 : 0,
        data.recurrence || null, data.recurrence_end || null,
        data.notes || '', ownerId, createdBy, sharedWith
      ).run();

      const newId = result.meta?.last_row_id;

      await env.DB.prepare(
        `INSERT INTO audit_log (action, event_id, event_title, changed_by, old_data, new_data)
         VALUES ('create', ?, ?, ?, '', ?)`
      ).bind(newId, data.title, createdBy, JSON.stringify(data)).run();

      // Send Telegram notification: creator + shared users + always Admin
      if (data.notify_line && env.TELEGRAM_BOT_TOKEN) {
        const targetChatIds = resolveNotifyChatIds(env, ownerId, sharedWith);
        const startDt = new Date(data.start_time);
        const timeStr = startDt.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'long', timeStyle: 'short' });
        const priorityEmoji = { urgent: '🔴', high: '🟠', normal: '🔵', low: '⚪' }[data.priority] || '🔵';
        // Show who this is shared with
        const sharedNames = sharedWith ? sharedWith.split(',').map(uid => {
          const v = VIEWER_PINS.find(p => p.id === uid.trim());
          return v ? v.name : uid.trim();
        }).join(', ') : '';
        const shareInfo = sharedNames ? `\n👥 แชร์กับ: ${sharedNames}` : '';
        const tgMsg = `📅 <b>งานใหม่ — Summit Calendar</b>\n\n${priorityEmoji} <b>${data.title}</b>\n🕐 ${timeStr}\n📍 ${data.location || '-'}\n🏷️ ${data.category || 'meeting'}\n👤 สร้างโดย: ${createdBy}${shareInfo}`;
        await sendTelegram(env.TELEGRAM_BOT_TOKEN, targetChatIds, tgMsg);
      }

      return json({ success: true, id: newId }, 201);
    }

    // Update event (admin ทุก event, viewer เฉพาะของตัวเอง)
    if (path.match(/^\/api\/events\/\d+$/) && method === 'PUT') {
      const auth = requireAuth(['admin', 'viewer']);
      if (!auth) return json({ error: 'Unauthorized' }, 401);

      const id = path.split('/').pop();
      const data = await request.json();

      // Fetch old data
      const oldEvent = await env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(id).first();
      if (!oldEvent) return json({ error: 'Event not found' }, 404);

      // Viewer แก้ได้เฉพาะ event ที่ตัวเองสร้าง (owner_id ตรงกัน)
      if (auth.role === 'viewer' && oldEvent.owner_id !== auth.userId) {
        return json({ error: 'ไม่มีสิทธิ์แก้ไข event นี้' }, 403);
      }

      const changedBy = auth.role === 'admin' ? (auth.user || 'admin') : (auth.name || auth.userId || 'viewer');

      await env.DB.prepare(
        `UPDATE events SET title=?, description=?, location=?, start_time=?, end_time=?,
         category=?, color=?, priority=?, status=?, notify_line=?, notify_email=?,
         recurrence=?, recurrence_end=?, notes=?, shared_with=?, reminder_sent=0, updated_at=datetime('now')
         WHERE id=?`
      ).bind(
        data.title, data.description || '', data.location || '',
        data.start_time, data.end_time,
        data.category || 'meeting', data.color || '#3B82F6',
        data.priority || 'normal', data.status || 'scheduled',
        data.notify_line ? 1 : 0, data.notify_email ? 1 : 0,
        data.recurrence || null, data.recurrence_end || null,
        data.notes || '', data.shared_with || '', id
      ).run();

      await env.DB.prepare(
        `INSERT INTO audit_log (action, event_id, event_title, changed_by, old_data, new_data)
         VALUES ('update', ?, ?, ?, ?, ?)`
      ).bind(id, data.title, changedBy, JSON.stringify(oldEvent || {}), JSON.stringify(data)).run();

      return json({ success: true });
    }

    // Share event ไปยังผู้ใช้คนอื่น (admin + viewer เจ้าของ event)
    if (path.match(/^\/api\/events\/\d+\/share$/) && method === 'POST') {
      const auth = requireAuth(['admin', 'viewer']);
      if (!auth) return json({ error: 'Unauthorized' }, 401);

      const id = path.split('/')[3]; // /api/events/:id/share
      const { share_to } = await request.json();
      if (!share_to) return json({ error: 'share_to required' }, 400);

      // ดึง event ต้นทาง
      const sourceEvent = await env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(id).first();
      if (!sourceEvent) return json({ error: 'Event not found' }, 404);

      // Viewer แชร์ได้เฉพาะ event ของตัวเอง
      if (auth.role === 'viewer' && sourceEvent.owner_id !== auth.userId) {
        return json({ error: 'ไม่มีสิทธิ์แชร์ event นี้' }, 403);
      }

      // ตรวจสอบ overlap ใน calendar ของผู้รับ
      const conflicts = await env.DB.prepare(
        `SELECT id, title, start_time, end_time FROM events
         WHERE owner_id = ? AND status != 'cancelled'
         AND start_time < ? AND end_time > ?`
      ).bind(share_to, sourceEvent.end_time, sourceEvent.start_time).all();

      // สร้าง event ใหม่ใน calendar ของผู้รับ
      const sharedBy = auth.role === 'admin' ? (auth.user || 'admin') : (auth.name || auth.userId);
      const sharedNote = sourceEvent.notes
        ? `${sourceEvent.notes}\n[แชร์โดย ${sharedBy}]`
        : `[แชร์โดย ${sharedBy}]`;

      const result = await env.DB.prepare(
        `INSERT INTO events (title, description, location, start_time, end_time, category, color, priority, status, notify_line, notify_email, notes, owner_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        sourceEvent.title, sourceEvent.description || '', sourceEvent.location || '',
        sourceEvent.start_time, sourceEvent.end_time,
        sourceEvent.category, sourceEvent.color,
        sourceEvent.priority, 'scheduled',
        sourceEvent.notify_line, 0,
        sharedNote, share_to, sharedBy
      ).run();

      const newId = result.meta?.last_row_id;

      await env.DB.prepare(
        `INSERT INTO audit_log (action, event_id, event_title, changed_by, old_data, new_data)
         VALUES ('create', ?, ?, ?, '', ?)`
      ).bind(newId, `[แชร์] ${sourceEvent.title}`, sharedBy,
        JSON.stringify({ shared_from: id, share_to, original_title: sourceEvent.title })).run();

      return json({
        success: true,
        new_id: newId,
        conflicts: conflicts.results || [],   // ส่ง conflict กลับให้ frontend แสดง warning
      }, 201);
    }

    // Delete event (admin only)
    if (path.match(/^\/api\/events\/\d+$/) && method === 'DELETE') {
      const auth = requireAuth(['admin']);
      if (!auth) return json({ error: 'Unauthorized' }, 401);

      const id = path.split('/').pop();

      // Fetch event before delete for audit log
      const eventToDelete = await env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(id).first();

      await env.DB.prepare('DELETE FROM events WHERE id = ?').bind(id).run();

      // Audit log (event_id set to NULL since deleted, but we keep the title)
      await env.DB.prepare(
        `INSERT INTO audit_log (action, event_id, event_title, changed_by, old_data, new_data)
         VALUES ('delete', NULL, ?, ?, ?, '')`
      ).bind(eventToDelete?.title || '(unknown)', auth.user || 'admin', JSON.stringify(eventToDelete || {})).run();

      return json({ success: true });
    }

    // ============ AUDIT LOG ROUTES ============

    // Get audit log (admin only) with optional CSV/TXT export
    if (path === '/api/audit-log' && method === 'GET') {
      const auth = requireAuth(['admin']);
      if (!auth) return json({ error: 'Unauthorized' }, 401);

      const exportFormat = url.searchParams.get('export'); // 'csv' or 'txt'
      const limit = parseInt(url.searchParams.get('limit') || '200');

      const logs = await env.DB.prepare(
        `SELECT * FROM audit_log ORDER BY changed_at DESC LIMIT ?`
      ).bind(limit).all();

      const rows = logs.results || [];

      if (exportFormat === 'csv') {
        const header = 'id,action,event_id,event_title,changed_by,changed_at,old_data,new_data\n';
        const csvRows = rows.map(r => {
          const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
          return [r.id, r.action, r.event_id ?? '', esc(r.event_title), esc(r.changed_by), r.changed_at, esc(r.old_data), esc(r.new_data)].join(',');
        });
        const csv = header + csvRows.join('\n');
        return new Response(csv, {
          headers: {
            ...CORS_HEADERS,
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="audit_log.csv"',
          },
        });
      }

      if (exportFormat === 'txt') {
        const lines = rows.map(r => {
          const actionLabel = { create: 'เพิ่มงาน', update: 'แก้ไขงาน', delete: 'ลบงาน' }[r.action] || r.action;
          return `[${r.changed_at}] ${r.changed_by} | ${actionLabel} | "${r.event_title}"`;
        });
        const txt = `=== Audit Log - Summit Calendar ===\nส่งออกเมื่อ: ${new Date().toISOString()}\nรายการทั้งหมด: ${rows.length} รายการ\n\n` + lines.join('\n');
        return new Response(txt, {
          headers: {
            ...CORS_HEADERS,
            'Content-Type': 'text/plain; charset=utf-8',
            'Content-Disposition': 'attachment; filename="audit_log.txt"',
          },
        });
      }

      return json({ audit_log: rows });
    }

    // ============ HOLIDAY ROUTES ============

    // Get holidays for a year (admin and viewer)
    if (path === '/api/holidays' && method === 'GET') {
      const auth = requireAuth(['admin', 'viewer']);
      if (!auth) return json({ error: 'Unauthorized' }, 401);

      const year = url.searchParams.get('year');
      let query = 'SELECT * FROM holidays';
      const params = [];

      if (year) {
        query += ' WHERE date LIKE ?';
        params.push(year + '%');
      }

      query += ' ORDER BY date ASC';

      const stmt = env.DB.prepare(query);
      const result = params.length > 0 ? await stmt.bind(...params).all() : await stmt.all();
      const holidays = result.results || [];

      // Auto-seed: if zero holidays found for this year, silently seed all years
      if (holidays.length === 0 && year) {
        const totalExisting = await env.DB.prepare('SELECT COUNT(*) as c FROM holidays').first();
        if ((totalExisting?.c || 0) === 0) {
          // Fire-and-forget seed — do it inline so first request also returns data
          const seed = [
            { date: '2025-01-01', name: 'วันขึ้นปีใหม่', type: 'bank' },
            { date: '2025-02-03', name: 'ชดเชยวันขึ้นปีใหม่', type: 'bank' },
            { date: '2025-03-03', name: 'วันมาฆบูชา', type: 'bank' },
            { date: '2025-04-06', name: 'วันจักรี', type: 'bank' },
            { date: '2025-04-07', name: 'ชดเชยวันจักรี', type: 'bank' },
            { date: '2025-04-13', name: 'วันสงกรานต์', type: 'bank' },
            { date: '2025-04-14', name: 'วันสงกรานต์', type: 'bank' },
            { date: '2025-04-15', name: 'วันสงกรานต์', type: 'bank' },
            { date: '2025-05-01', name: 'วันแรงงานแห่งชาติ', type: 'bank' },
            { date: '2025-05-05', name: 'วันฉัตรมงคล', type: 'bank' },
            { date: '2025-05-12', name: 'วันวิสาขบูชา', type: 'bank' },
            { date: '2025-06-03', name: 'วันเฉลิมพระชนมพรรษาสมเด็จพระนางเจ้าฯ', type: 'bank' },
            { date: '2025-07-28', name: 'วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว', type: 'bank' },
            { date: '2025-07-29', name: 'ชดเชยวันเฉลิมพระชนมพรรษาฯ', type: 'bank' },
            { date: '2025-08-12', name: 'วันเฉลิมพระชนมพรรษาสมเด็จพระบรมราชชนนีพันปีหลวง', type: 'bank' },
            { date: '2025-10-13', name: 'วันคล้ายวันสวรรคต ร.9', type: 'bank' },
            { date: '2025-10-23', name: 'วันปิยมหาราช', type: 'bank' },
            { date: '2025-12-05', name: 'วันคล้ายวันพระบรมราชสมภพ ร.9', type: 'bank' },
            { date: '2025-12-10', name: 'วันรัฐธรรมนูญ', type: 'bank' },
            { date: '2025-12-31', name: 'วันสิ้นปี', type: 'bank' },
            { date: '2026-01-01', name: 'วันขึ้นปีใหม่', type: 'bank' },
            { date: '2026-02-12', name: 'ชดเชยวันมาฆบูชา', type: 'bank' },
            { date: '2026-04-06', name: 'วันจักรี', type: 'bank' },
            { date: '2026-04-13', name: 'วันสงกรานต์', type: 'bank' },
            { date: '2026-04-14', name: 'วันสงกรานต์', type: 'bank' },
            { date: '2026-04-15', name: 'วันสงกรานต์', type: 'bank' },
            { date: '2026-05-01', name: 'วันแรงงานแห่งชาติ', type: 'bank' },
            { date: '2026-05-05', name: 'วันฉัตรมงคล', type: 'bank' },
            { date: '2026-05-11', name: 'ชดเชยวันวิสาขบูชา', type: 'bank' },
            { date: '2026-06-03', name: 'วันเฉลิมพระชนมพรรษาสมเด็จพระนางเจ้าฯ', type: 'bank' },
            { date: '2026-07-28', name: 'วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว', type: 'bank' },
            { date: '2026-08-12', name: 'วันเฉลิมพระชนมพรรษาสมเด็จพระบรมราชชนนีพันปีหลวง', type: 'bank' },
            { date: '2026-10-13', name: 'วันคล้ายวันสวรรคต ร.9', type: 'bank' },
            { date: '2026-10-23', name: 'วันปิยมหาราช', type: 'bank' },
            { date: '2026-12-05', name: 'วันคล้ายวันพระบรมราชสมภพ ร.9', type: 'bank' },
            { date: '2026-12-10', name: 'วันรัฐธรรมนูญ', type: 'bank' },
            { date: '2026-12-31', name: 'วันสิ้นปี', type: 'bank' },
            { date: '2027-01-01', name: 'วันขึ้นปีใหม่', type: 'bank' },
            { date: '2027-03-01', name: 'วันมาฆบูชา', type: 'bank' },
            { date: '2027-04-06', name: 'วันจักรี', type: 'bank' },
            { date: '2027-04-13', name: 'วันสงกรานต์', type: 'bank' },
            { date: '2027-04-14', name: 'วันสงกรานต์', type: 'bank' },
            { date: '2027-04-15', name: 'วันสงกรานต์', type: 'bank' },
            { date: '2027-05-03', name: 'ชดเชยวันแรงงานแห่งชาติ', type: 'bank' },
            { date: '2027-05-05', name: 'วันฉัตรมงคล', type: 'bank' },
            { date: '2027-05-31', name: 'วันวิสาขบูชา', type: 'bank' },
            { date: '2027-06-03', name: 'วันเฉลิมพระชนมพรรษาสมเด็จพระนางเจ้าฯ', type: 'bank' },
            { date: '2027-07-28', name: 'วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว', type: 'bank' },
            { date: '2027-08-12', name: 'วันเฉลิมพระชนมพรรษาสมเด็จพระบรมราชชนนีพันปีหลวง', type: 'bank' },
            { date: '2027-10-13', name: 'วันคล้ายวันสวรรคต ร.9', type: 'bank' },
            { date: '2027-10-25', name: 'ชดเชยวันปิยมหาราช', type: 'bank' },
            { date: '2027-12-06', name: 'ชดเชยวันคล้ายวันพระบรมราชสมภพ ร.9', type: 'bank' },
            { date: '2027-12-10', name: 'วันรัฐธรรมนูญ', type: 'bank' },
            { date: '2027-12-31', name: 'วันสิ้นปี', type: 'bank' },
          ];
          for (const h of seed) {
            const dup = await env.DB.prepare('SELECT id FROM holidays WHERE date = ? AND name = ?').bind(h.date, h.name).first();
            if (!dup) await env.DB.prepare('INSERT INTO holidays (date, name, type) VALUES (?, ?, ?)').bind(h.date, h.name, h.type).run();
          }
          // Return seeded data for the requested year
          const seeded = seed.filter(h => h.date.startsWith(year));
          return json({ holidays: seeded });
        }
      }

      return json({ holidays });
    }

    // Create holiday (admin only)
    if (path === '/api/holidays' && method === 'POST') {
      const auth = requireAuth(['admin']);
      if (!auth) return json({ error: 'Unauthorized' }, 401);

      const data = await request.json();
      // Check for duplicate (same date + name)
      const dupCheck = await env.DB.prepare('SELECT id FROM holidays WHERE date = ? AND name = ?').bind(data.date, data.name).first();
      if (dupCheck) return json({ error: 'วันหยุดนี้มีอยู่แล้ว กรุณาตรวจสอบรายการ' }, 409);

      const result = await env.DB.prepare(
        `INSERT INTO holidays (date, name, type)
         VALUES (?, ?, ?)`
      ).bind(
        data.date, data.name, data.type || 'bank'
      ).run();

      return json({ success: true, id: result.meta?.last_row_id }, 201);
    }

    // Update holiday (admin only)
    if (path.match(/^\/api\/holidays\/\d+$/) && method === 'PUT') {
      const auth = requireAuth(['admin']);
      if (!auth) return json({ error: 'Unauthorized' }, 401);

      const id = path.split('/').pop();
      const data = await request.json();

      await env.DB.prepare(
        `UPDATE holidays SET date=?, name=?, type=? WHERE id=?`
      ).bind(data.date, data.name, data.type || 'bank', id).run();

      return json({ success: true });
    }

    // Delete holiday (admin only)
    if (path.match(/^\/api\/holidays\/\d+$/) && method === 'DELETE') {
      const auth = requireAuth(['admin']);
      if (!auth) return json({ error: 'Unauthorized' }, 401);

      const id = path.split('/').pop();
      await env.DB.prepare('DELETE FROM holidays WHERE id = ?').bind(id).run();

      return json({ success: true });
    }

    // Initialize 2026 Thai bank holidays (admin only)
    if (path === '/api/holidays/init' && method === 'POST') {
      const auth = requireAuth(['admin']);
      if (!auth) return json({ error: 'Unauthorized' }, 401);

      // ── ธปท. ประกาศวันหยุด 2025 ──────────────────────────────────────────
      const allHolidays = [
        { date: '2025-01-01', name: 'วันขึ้นปีใหม่', type: 'bank' },
        { date: '2025-02-03', name: 'ชดเชยวันขึ้นปีใหม่', type: 'bank' },
        { date: '2025-03-03', name: 'วันมาฆบูชา', type: 'bank' },
        { date: '2025-04-06', name: 'วันจักรี', type: 'bank' },
        { date: '2025-04-07', name: 'ชดเชยวันจักรี', type: 'bank' },
        { date: '2025-04-13', name: 'วันสงกรานต์', type: 'bank' },
        { date: '2025-04-14', name: 'วันสงกรานต์', type: 'bank' },
        { date: '2025-04-15', name: 'วันสงกรานต์', type: 'bank' },
        { date: '2025-05-01', name: 'วันแรงงานแห่งชาติ', type: 'bank' },
        { date: '2025-05-05', name: 'วันฉัตรมงคล', type: 'bank' },
        { date: '2025-05-12', name: 'วันวิสาขบูชา', type: 'bank' },
        { date: '2025-06-03', name: 'วันเฉลิมพระชนมพรรษาสมเด็จพระนางเจ้าฯ', type: 'bank' },
        { date: '2025-07-28', name: 'วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว', type: 'bank' },
        { date: '2025-07-29', name: 'ชดเชยวันเฉลิมพระชนมพรรษาฯ', type: 'bank' },
        { date: '2025-08-12', name: 'วันเฉลิมพระชนมพรรษาสมเด็จพระบรมราชชนนีพันปีหลวง', type: 'bank' },
        { date: '2025-10-13', name: 'วันคล้ายวันสวรรคต ร.9', type: 'bank' },
        { date: '2025-10-23', name: 'วันปิยมหาราช', type: 'bank' },
        { date: '2025-12-05', name: 'วันคล้ายวันพระบรมราชสมภพ ร.9', type: 'bank' },
        { date: '2025-12-10', name: 'วันรัฐธรรมนูญ', type: 'bank' },
        { date: '2025-12-31', name: 'วันสิ้นปี', type: 'bank' },
        // ── 2026 ─────────────────────────────────────────────────────────────
        { date: '2026-01-01', name: 'วันขึ้นปีใหม่', type: 'bank' },
        { date: '2026-02-12', name: 'ชดเชยวันมาฆบูชา', type: 'bank' },
        { date: '2026-04-06', name: 'วันจักรี', type: 'bank' },
        { date: '2026-04-13', name: 'วันสงกรานต์', type: 'bank' },
        { date: '2026-04-14', name: 'วันสงกรานต์', type: 'bank' },
        { date: '2026-04-15', name: 'วันสงกรานต์', type: 'bank' },
        { date: '2026-05-01', name: 'วันแรงงานแห่งชาติ', type: 'bank' },
        { date: '2026-05-05', name: 'วันฉัตรมงคล', type: 'bank' },
        { date: '2026-05-11', name: 'ชดเชยวันวิสาขบูชา', type: 'bank' },
        { date: '2026-06-03', name: 'วันเฉลิมพระชนมพรรษาสมเด็จพระนางเจ้าฯ', type: 'bank' },
        { date: '2026-07-28', name: 'วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว', type: 'bank' },
        { date: '2026-08-12', name: 'วันเฉลิมพระชนมพรรษาสมเด็จพระบรมราชชนนีพันปีหลวง', type: 'bank' },
        { date: '2026-10-13', name: 'วันคล้ายวันสวรรคต ร.9', type: 'bank' },
        { date: '2026-10-23', name: 'วันปิยมหาราช', type: 'bank' },
        { date: '2026-12-05', name: 'วันคล้ายวันพระบรมราชสมภพ ร.9', type: 'bank' },
        { date: '2026-12-10', name: 'วันรัฐธรรมนูญ', type: 'bank' },
        { date: '2026-12-31', name: 'วันสิ้นปี', type: 'bank' },
        // ── 2027 ─────────────────────────────────────────────────────────────
        { date: '2027-01-01', name: 'วันขึ้นปีใหม่', type: 'bank' },
        { date: '2027-03-01', name: 'วันมาฆบูชา', type: 'bank' },
        { date: '2027-04-06', name: 'วันจักรี', type: 'bank' },
        { date: '2027-04-13', name: 'วันสงกรานต์', type: 'bank' },
        { date: '2027-04-14', name: 'วันสงกรานต์', type: 'bank' },
        { date: '2027-04-15', name: 'วันสงกรานต์', type: 'bank' },
        { date: '2027-05-03', name: 'ชดเชยวันแรงงานแห่งชาติ', type: 'bank' },
        { date: '2027-05-05', name: 'วันฉัตรมงคล', type: 'bank' },
        { date: '2027-05-31', name: 'วันวิสาขบูชา', type: 'bank' },
        { date: '2027-06-03', name: 'วันเฉลิมพระชนมพรรษาสมเด็จพระนางเจ้าฯ', type: 'bank' },
        { date: '2027-07-28', name: 'วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว', type: 'bank' },
        { date: '2027-08-12', name: 'วันเฉลิมพระชนมพรรษาสมเด็จพระบรมราชชนนีพันปีหลวง', type: 'bank' },
        { date: '2027-10-13', name: 'วันคล้ายวันสวรรคต ร.9', type: 'bank' },
        { date: '2027-10-25', name: 'ชดเชยวันปิยมหาราช', type: 'bank' },
        { date: '2027-12-06', name: 'ชดเชยวันคล้ายวันพระบรมราชสมภพ ร.9', type: 'bank' },
        { date: '2027-12-10', name: 'วันรัฐธรรมนูญ', type: 'bank' },
        { date: '2027-12-31', name: 'วันสิ้นปี', type: 'bank' },
      ];

      let inserted = 0;
      for (const h of allHolidays) {
        const existing = await env.DB.prepare('SELECT id FROM holidays WHERE date = ?').bind(h.date).first();
        if (!existing) {
          await env.DB.prepare('INSERT INTO holidays (date, name, type) VALUES (?, ?, ?)').bind(h.date, h.name, h.type).run();
          inserted++;
        }
      }

      return json({ success: true, message: `Initialized Thai bank holidays 2025–2027 (${inserted} added)`, inserted });
    }

    // ============ REMINDER ROUTES ============

    // Test Telegram — sends a test message to ALL configured Chat IDs
    if (path === '/api/telegram/test' && method === 'POST') {
      const auth = requireAuth(['admin']);
      if (!auth) return json({ error: 'Unauthorized' }, 401);

      const chatIds = env.TELEGRAM_CHAT_ID || '';
      const ids = chatIds.split(',').map(id => id.trim()).filter(Boolean);
      const now = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
      const message = `✅ <b>ทดสอบ Summit Calendar</b>\n\n🔔 ข้อความนี้ส่งจาก Summit Calendar ถ้าคุณเห็นข้อความนี้ แสดงว่าการแจ้งเตือนทำงานปกติ!\n\n⏰ เวลา: ${now}\n📋 Chat IDs ทั้งหมด: ${ids.length} คน`;

      const result = await sendTelegram(env.TELEGRAM_BOT_TOKEN, chatIds, message);
      return json({
        success: true,
        total_chat_ids: ids.length,
        chat_ids: ids,
        results: result.results || [],
        all_ok: result.ok
      });
    }

    // Setup Telegram Webhook — registers this worker's URL with Telegram
    if (path === '/api/telegram/setup-webhook' && method === 'POST') {
      const auth = requireAuth(['admin']);
      if (!auth) return json({ error: 'Unauthorized' }, 401);

      const workerUrl = url.origin + '/api/telegram/webhook';
      const botToken = env.TELEGRAM_BOT_TOKEN;
      try {
        // Set webhook
        const resp = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: workerUrl, allowed_updates: ['message'] }),
        });
        const data = await resp.json();

        // Set bot commands menu
        await fetch(`https://api.telegram.org/bot${botToken}/setMyCommands`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            commands: [
              { command: 'start', description: 'เริ่มต้นใช้งาน Bot' },
              { command: 'test', description: 'ทดสอบการแจ้งเตือน' },
              { command: 'mychatid', description: 'ดู Chat ID ของคุณ' },
              { command: 'status', description: 'ดูสถานะระบบ' },
            ]
          }),
        });

        return json({ success: data.ok, webhook_url: workerUrl, telegram_response: data });
      } catch (e) {
        return json({ error: e.message }, 500);
      }
    }

    // Manual trigger reminders (can also be called by Cron)
    if (path === '/api/reminders/check' && method === 'POST') {
      const count = await checkReminders(env);
      return json({ success: true, reminders_sent: count });
    }

    // Get notification log
    if (path === '/api/notifications' && method === 'GET') {
      const auth = requireAuth(['admin']);
      if (!auth) return json({ error: 'Unauthorized' }, 401);

      const logs = await env.DB.prepare(
        `SELECT n.*, e.title as event_title
         FROM notifications_log n
         JOIN events e ON n.event_id = e.id
         ORDER BY n.sent_at DESC LIMIT 50`
      ).all();
      return json({ notifications: logs.results || [] });
    }

    // ============ PROFILE PICTURE ROUTES ============

    // Upload profile picture (viewer or admin)
    if (path === '/api/profile/picture' && method === 'POST') {
      const auth = requireAuth(['admin', 'viewer']);
      if (!auth) return json({ error: 'Unauthorized' }, 401);

      const { userId, picture } = await request.json();
      // userId = 'nopamas', picture = base64 data URL (เช่น 'data:image/jpeg;base64,...')
      if (!userId || !picture) return json({ error: 'userId and picture required' }, 400);

      // Only allow changing own picture (unless admin)
      if (auth.role !== 'admin' && auth.userId !== userId) {
        return json({ error: 'Cannot change other user\'s picture' }, 403);
      }

      // Save to settings table with key 'profile_pic_<userId>'
      await env.DB.prepare(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'
      ).bind(`profile_pic_${userId}`, picture).run();

      return json({ success: true });
    }

    // Get profile picture
    if (path === '/api/profile/picture' && method === 'GET') {
      const auth = requireAuth(['admin', 'viewer']);
      if (!auth) return json({ error: 'Unauthorized' }, 401);

      const userId = url.searchParams.get('userId');
      if (!userId) return json({ error: 'userId required' }, 400);

      const result = await env.DB.prepare(
        "SELECT value FROM settings WHERE key = ?"
      ).bind(`profile_pic_${userId}`).first();

      return json({ picture: result?.value || null });
    }

    // Get all profile pictures (for sidebar/dropdown)
    if (path === '/api/profile/pictures' && method === 'GET') {
      const auth = requireAuth(['admin', 'viewer']);
      if (!auth) return json({ error: 'Unauthorized' }, 401);

      const results = await env.DB.prepare(
        "SELECT key, value FROM settings WHERE key LIKE 'profile_pic_%'"
      ).all();

      const pictures = {};
      (results.results || []).forEach(r => {
        const userId = r.key.replace('profile_pic_', '');
        pictures[userId] = r.value;
      });

      return json({ pictures });
    }

    // ============ SETTINGS ROUTES ============

    if (path === '/api/settings' && method === 'GET') {
      const auth = requireAuth(['admin']);
      if (!auth) return json({ error: 'Unauthorized' }, 401);

      const settings = await env.DB.prepare('SELECT * FROM settings').all();
      const obj = {};
      (settings.results || []).forEach(s => {
        if (s.key === 'claude_api_key' && s.value) {
          // Never expose the full API key
          obj.claude_api_key_masked = s.value.substring(0, 10) + '...' + s.value.slice(-4);
        } else {
          obj[s.key] = s.value;
        }
      });
      return json({ settings: obj });
    }

    if (path === '/api/settings' && method === 'PUT') {
      const auth = requireAuth(['admin']);
      if (!auth) return json({ error: 'Unauthorized' }, 401);

      const data = await request.json();
      for (const [key, value] of Object.entries(data)) {
        await env.DB.prepare(
          'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'
        ).bind(key, String(value)).run();
      }
      return json({ success: true });
    }

    // ============ DASHBOARD STATS ============

    if (path === '/api/stats' && method === 'GET') {
      const auth = requireAuth(['admin', 'viewer']);
      if (!auth) return json({ error: 'Unauthorized' }, 401);

      const today = new Date().toISOString().split('T')[0];
      const todayStart = today + 'T00:00:00';
      const todayEnd = today + 'T23:59:59';

      const [totalEvents, todayEvents, upcomingEvents, completedEvents, byCategory, byPriority, byMonth] = await Promise.all([
        env.DB.prepare("SELECT COUNT(*) as count FROM events WHERE status != 'cancelled'").first(),
        env.DB.prepare("SELECT COUNT(*) as count FROM events WHERE start_time >= ? AND start_time <= ? AND status != 'cancelled'").bind(todayStart, todayEnd).first(),
        env.DB.prepare("SELECT COUNT(*) as count FROM events WHERE start_time > ? AND status = 'scheduled'").bind(new Date().toISOString()).first(),
        env.DB.prepare("SELECT COUNT(*) as count FROM events WHERE status = 'completed'").first(),
        env.DB.prepare("SELECT category, COUNT(*) as count FROM events WHERE status != 'cancelled' GROUP BY category ORDER BY count DESC").all(),
        env.DB.prepare("SELECT priority, COUNT(*) as count FROM events WHERE status != 'cancelled' GROUP BY priority ORDER BY count DESC").all(),
        env.DB.prepare("SELECT strftime('%Y-%m', start_time) as month, COUNT(*) as count FROM events WHERE status != 'cancelled' AND start_time >= date('now','-5 months','start of month') GROUP BY month ORDER BY month ASC").all(),
      ]);

      return json({
        total: totalEvents?.count || 0,
        today: todayEvents?.count || 0,
        upcoming: upcomingEvents?.count || 0,
        completed: completedEvents?.count || 0,
        by_category: byCategory?.results || [],
        by_priority: byPriority?.results || [],
        by_month: byMonth?.results || [],
      });
    }

    // ============ AI PREMIUM ROUTES ============

    if (path === '/api/ai/status' && method === 'GET') {
      const auth = requireAuth(['admin', 'viewer']);
      if (!auth) return json({ error: 'Unauthorized' }, 401);
      const setting = await env.DB.prepare("SELECT value FROM settings WHERE key = 'ai_premium_enabled'").first();
      const hasKey = await env.DB.prepare("SELECT value FROM settings WHERE key = 'claude_api_key'").first();
      return json({
        enabled: setting?.value === 'true' && !!hasKey?.value,
      });
    }

    if (path === '/api/ai/chat' && method === 'POST') {
      const auth = requireAuth(['admin', 'viewer']);
      if (!auth) return json({ error: 'Unauthorized' }, 401);

      // Check if premium is enabled
      const premiumSetting = await env.DB.prepare("SELECT value FROM settings WHERE key = 'ai_premium_enabled'").first();
      if (premiumSetting?.value !== 'true') {
        return json({ error: 'AI Premium is not enabled' }, 403);
      }

      const apiKeySetting = await env.DB.prepare("SELECT value FROM settings WHERE key = 'claude_api_key'").first();
      if (!apiKeySetting?.value) {
        return json({ error: 'Claude API key not configured' }, 403);
      }

      const { message, secretary_id } = await request.json();
      if (!message) return json({ error: 'Message required' }, 400);

      // Get today's events for context
      const today = new Date().toISOString().split('T')[0];
      const todayStart = today + 'T00:00:00';
      const todayEnd = today + 'T23:59:59';
      const todayEvents = await env.DB.prepare(
        "SELECT title, start_time, end_time, location, category, priority, status FROM events WHERE start_time >= ? AND start_time <= ? AND status != 'cancelled' ORDER BY start_time"
      ).bind(todayStart, todayEnd).all();

      // Get upcoming events (next 3 days)
      const futureEnd = new Date(Date.now() + 3 * 86400000).toISOString();
      const upcomingEvents = await env.DB.prepare(
        "SELECT title, start_time, end_time, location, category, priority, status FROM events WHERE start_time > ? AND start_time <= ? AND status != 'cancelled' ORDER BY start_time LIMIT 10"
      ).bind(todayEnd, futureEnd).all();

      // Secretary personality — คุณต่าย (เลขาคนเดียว)
      const taiPersonality = `คุณต่าย — เลขาสาวมั่น แต่งตัวดี เจ้าระเบียบ ดุเล็กน้อย แต่ยืดหยุ่นตามสถานการณ์
ลักษณะการพูด: ใช้ "ค่ะ/คะ" สุภาพแต่มีน้ำเสียงเด็ดขาดเป็นบางครั้ง ชอบวางแผน เน้นความเป๊ะและระเบียบ
ถ้าเห็นงานยุ่งเหยิงหรือชนกันจะพูดตรงๆ ว่าไม่โอเค แต่พร้อมแก้ไขให้เสมอ
เรียกตัวเองว่า "ต่าย" เสมอ`;

      const systemPrompt = `คุณคือ "${taiPersonality}" เลขา AI ส่วนตัวในแอป Summit Calendar Tracking
ข้อมูลวันนี้ (${today}):
- งานวันนี้: ${JSON.stringify(todayEvents?.results || [])}
- งานที่กำลังจะมาถึง: ${JSON.stringify(upcomingEvents?.results || [])}

กฎ:
1. ตอบเป็นภาษาไทย สั้นกระชับ ไม่เกิน 3-4 ประโยค
2. ใช้บุคลิกของเลขาที่กำหนดให้
3. ถ้าถามเรื่องตารางงาน ให้อ้างอิงจากข้อมูลจริง
4. ถ้ามีงานชนกัน (เวลาซ้อน) ให้เตือน
5. ให้คำแนะนำเชิงบวกเสมอ`;

      try {
        const aiResp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKeySetting.value,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 512,
            system: systemPrompt,
            messages: [{ role: 'user', content: message }],
          }),
        });

        if (!aiResp.ok) {
          const errText = await aiResp.text();
          console.error('Claude API error:', aiResp.status, errText);
          return json({ error: 'AI service error', detail: aiResp.status }, 502);
        }

        const aiData = await aiResp.json();
        const reply = aiData.content?.[0]?.text || 'ขออภัย ไม่สามารถตอบได้ในขณะนี้';
        return json({ reply });
      } catch (aiErr) {
        console.error('Claude API call failed:', aiErr);
        return json({ error: 'AI service unavailable' }, 502);
      }
    }

    return json({ error: 'Not Found' }, 404);

  } catch (error) {
    console.error('API Error:', error);
    return json({ error: error.message }, 500);
  }
}

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env);
  },

  // Cron trigger for checking reminders every minute
  async scheduled(event, env, ctx) {
    ctx.waitUntil(checkReminders(env));
  },
};
