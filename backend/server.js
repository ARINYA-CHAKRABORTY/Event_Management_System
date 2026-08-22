/**
 * File: server.js
 * Architecture context: Main Express application and Socket.io server.
 * Handles API routes for event creation, strict registration, offline-first check-ins, AI insights, and CSV export.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { GoogleGenerativeAI } = require('@google/genai'); 
const db = require('./database');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-123';
const ORGANIZER_TOKEN = process.env.ORGANIZER_TOKEN || 'secret123';
const PORT = process.env.PORT || 3002;

// Middleware for Backend Role Enforcement
const requireOrganizer = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(403).json({ error: 'Forbidden: Organizer access required' });
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded.organizerId) throw new Error();
    req.organizerId = decoded.organizerId;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Forbidden: Invalid token' });
  }
};

// Health check — used by cron-job.org to keep Render server alive
app.get('/api', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// Login Organizer
app.post('/api/organizer/login', (req, res) => {
  const { clubName, password } = req.body;
  
  const existingClub = db.prepare('SELECT id, password FROM organizers WHERE club_name = ?').get(clubName);
  
  let orgId;
  if (!existingClub) {
    // Auto-register new clubs on first login
    const info = db.prepare('INSERT INTO organizers (club_name, password) VALUES (?, ?)').run(clubName, password);
    orgId = info.lastInsertRowid;
  } else {
    // Verify password for existing clubs
    if (existingClub.password !== password) {
      return res.status(401).json({ error: 'Invalid password for this club' });
    }
    orgId = existingClub.id;
  }
  
  const token = jwt.sign({ organizerId: orgId, clubName }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, clubName });
});

// Removed Gemini SDK initialization, we will use native fetch for Groq API

// Track active scanner devices per event: eventId -> Set of socket IDs
const scannerSessions = new Map();

const broadcastScannerCount = (eventId) => {
  const count = scannerSessions.get(String(eventId))?.size || 0;
  io.emit(`event-${eventId}-scanners-update`, { count });
};

// Websocket connection
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('scanner-join', ({ eventId }) => {
    const key = String(eventId);
    if (!scannerSessions.has(key)) scannerSessions.set(key, new Set());
    scannerSessions.get(key).add(socket.id);
    socket._scannerEventId = key;
    broadcastScannerCount(key);
    console.log(`Scanner joined event ${key}. Active: ${scannerSessions.get(key).size}`);
  });

  socket.on('scanner-leave', ({ eventId }) => {
    const key = String(eventId);
    scannerSessions.get(key)?.delete(socket.id);
    broadcastScannerCount(key);
  });

  socket.on('get-scanner-count', ({ eventId }) => {
    const key = String(eventId);
    const count = scannerSessions.get(key)?.size || 0;
    socket.emit(`event-${key}-scanners-update`, { count });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    if (socket._scannerEventId) {
      scannerSessions.get(socket._scannerEventId)?.delete(socket.id);
      broadcastScannerCount(socket._scannerEventId);
    }
  });
});

const broadcastStats = (eventId) => {
  const stats = getEventStats(eventId);
  io.emit(`event-${eventId}-update`, stats);
};

const getEventStats = (eventId) => {
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!event) return null;
  const registeredCount = db.prepare('SELECT count(*) as count FROM attendees WHERE event_id = ?').get(eventId).count;
  const checkedInCount = db.prepare('SELECT count(*) as count FROM checkins WHERE event_id = ?').get(eventId).count;
  return { ...event, registeredCount, checkedInCount };
};

// 1. Create Event
app.post('/api/events', requireOrganizer, (req, res) => {
  const { name, date, capacity, duration_hours, od_timings, end_date, entry_fee, image_url, details } = req.body;
  if (!name || !date || !capacity) return res.status(400).json({ error: 'Missing fields' });

  const info = db.prepare('INSERT INTO events (organizer_id, name, date, capacity, duration_hours, od_timings, end_date, entry_fee, image_url, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    req.organizerId, name, date, capacity, duration_hours || '', od_timings || '', end_date || '', entry_fee || 'Free', image_url || '', details || ''
  );
  
  // Real-Time Sync: Tell all connected clients an event was created/updated for this organizer
  io.emit(`organizer-${req.organizerId}-events-updated`);

  res.json({ id: info.lastInsertRowid, name, date, capacity });
});

// Edit Event
app.put('/api/events/:id', requireOrganizer, (req, res) => {
  const { name, date, capacity, duration_hours, od_timings, end_date, entry_fee, image_url, details } = req.body;
  if (!name || !date || !capacity) return res.status(400).json({ error: 'Missing fields' });

  const eventId = req.params.id;
  const event = db.prepare('SELECT id FROM events WHERE id = ? AND organizer_id = ?').get(eventId, req.organizerId);
  if (!event) return res.status(403).json({ error: 'Forbidden or event not found' });

  db.prepare(`
    UPDATE events SET 
      name = ?, date = ?, capacity = ?, duration_hours = ?, 
      od_timings = ?, end_date = ?, entry_fee = ?, image_url = ?, details = ?
    WHERE id = ? AND organizer_id = ?
  `).run(
    name, date, capacity, duration_hours || '', 
    od_timings || '', end_date || '', entry_fee || 'Free', image_url || '', details || '',
    eventId, req.organizerId
  );
  
  io.emit(`organizer-${req.organizerId}-events-updated`);
  res.json({ success: true });
});

// List events specific to an organizer (for their dashboard event list)
app.get('/api/organizer/events', requireOrganizer, (req, res) => {
  const events = db.prepare(`
    SELECT e.*, (e.capacity - (SELECT COUNT(*) FROM attendees WHERE event_id = e.id)) as spotsLeft 
    FROM events e WHERE e.organizer_id = ? AND e.status = 'active' ORDER BY id DESC
  `).all(req.organizerId);
  res.json(events);
});

// List all events (public)
app.get('/api/events', (req, res) => {
  const events = db.prepare(`
    SELECT e.*, (e.capacity - (SELECT COUNT(*) FROM attendees WHERE event_id = e.id)) as spotsLeft 
    FROM events e WHERE e.status = 'active'
  `).all();
  res.json(events);
});

// Terminate event
app.post('/api/events/:id/terminate', requireOrganizer, (req, res) => {
  const eventId = req.params.id;
  
  // Verify organizer owns the event
  const event = db.prepare('SELECT id FROM events WHERE id = ? AND organizer_id = ?').get(eventId, req.organizerId);
  if (!event) return res.status(403).json({ error: 'Forbidden or event not found' });
  
  db.prepare("UPDATE events SET status = 'terminated' WHERE id = ?").run(eventId);
  io.emit(`organizer-${req.organizerId}-events-updated`);
  res.json({ ok: true });
});

// List past events for a specific student (student report)
app.get('/api/events/past/:registrationId', (req, res) => {
  const regId = req.params.registrationId.trim().toUpperCase();
  const pastEvents = db.prepare(`
    SELECT e.*, a.id as attendee_id, c.scanned_at
    FROM events e
    JOIN attendees a ON e.id = a.event_id
    LEFT JOIN checkins c ON a.id = c.attendee_id
    WHERE e.status = 'terminated' AND UPPER(a.registration_id) = ?
    ORDER BY e.id DESC
  `).all(regId);
  res.json(pastEvents);
});

// Get all active registrations for a student (cross-device ticket sync)
app.get('/api/attendee/registrations/:registrationId', (req, res) => {
  const regId = req.params.registrationId.trim().toUpperCase();
  const registrations = db.prepare(`
    SELECT a.id as attendee_id, a.event_id
    FROM attendees a
    JOIN events e ON a.event_id = e.id
    WHERE UPPER(a.registration_id) = ? AND e.status = 'active'
  `).all(regId);
  // Return as { eventId: attendeeId } map
  const ticketMap = {};
  for (const r of registrations) ticketMap[r.event_id] = r.attendee_id;
  res.json(ticketMap);
});

const registerTransaction = db.transaction((eventId, name, registrationId, baseToken) => {
  // Check if this Registration ID has ever been used globally under a different name
  const previousReg = db.prepare('SELECT name FROM attendees WHERE UPPER(registration_id) = ? LIMIT 1').get(registrationId);
  if (previousReg && previousReg.name.toLowerCase() !== name.toLowerCase()) {
      throw new Error('NAME_MISMATCH');
  }

  // Check if this specific Registration ID has already registered for this event
  const existing = db.prepare('SELECT id, base_qr_token FROM attendees WHERE event_id = ? AND UPPER(registration_id) = ?').get(eventId, registrationId);
  if (existing) return { id: existing.id, baseToken: existing.base_qr_token, existing: true };

  // Check capacity
  const event = db.prepare('SELECT capacity FROM events WHERE id = ?').get(eventId);
  if (!event) throw new Error('Event not found');
  const count = db.prepare('SELECT COUNT(*) as c FROM attendees WHERE event_id = ?').get(eventId);
  if (count.c >= event.capacity) throw new Error('CAPACITY_REACHED');
  
  const info = db.prepare('INSERT INTO attendees (event_id, name, registration_id, base_qr_token) VALUES (?, ?, ?, ?)').run(eventId, name, registrationId, baseToken);
  return { id: info.lastInsertRowid, baseToken, existing: false };
});

app.post('/api/verify-profile', (req, res) => {
  let { name, registrationId } = req.body;
  if (!name || !registrationId) return res.status(400).json({ error: 'Missing fields' });
  
  name = name.trim().toUpperCase();
  registrationId = registrationId.trim().toUpperCase();
  
  const previousReg = db.prepare('SELECT name FROM attendees WHERE UPPER(registration_id) = ? LIMIT 1').get(registrationId);
  if (previousReg && previousReg.name.toLowerCase() !== name.toLowerCase()) {
      return res.status(400).json({ error: 'This Registration Number is already taken by someone else.' });
  }
  res.json({ ok: true });
});

app.post('/api/register', (req, res) => {
  let { eventId, name, registrationId } = req.body;
  if (!name || !registrationId || !eventId) return res.status(400).json({ error: 'Missing fields' });
  
  name = name.trim().toUpperCase();
  registrationId = registrationId.trim().toUpperCase();
  const baseToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  
  try {
    // .immediate() locks the database for writes immediately, preventing race conditions
    const result = registerTransaction.immediate(eventId, name, registrationId, baseToken);
    if (!result.existing) {
      broadcastStats(eventId);
    }
    res.json({ id: result.id, eventId, name, baseToken: result.baseToken });
  } catch (error) {
    if (error.message === 'NAME_MISMATCH') {
      return res.status(400).json({ error: 'This Registration Number is already taken by someone else.' });
    }
    if (error.message === 'CAPACITY_REACHED') {
      return res.status(400).json({ error: 'Event is full!' });
    }
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(400).json({ error: 'Token collision, please retry' });
    }
    res.status(500).json({ error: error.message });
  }
});

// 3. Get Rotating Token (Hard Requirement 2: Prevent QR Screenshot Abuse)
app.get('/api/attendee/:id/token', (req, res) => {
  const attendee = db.prepare('SELECT * FROM attendees WHERE id = ?').get(req.params.id);
  if (!attendee) return res.status(404).json({ error: 'Attendee not found' });

  // SECURITY (Screenshot Prevention): 
  // We use short-lived, rotating JSON Web Tokens (JWTs) that expire every 15 seconds.
  // Tradeoff: 
  // - Pros: A screenshot becomes invalid within seconds, effectively preventing ticket sharing 
  //         and does not require a one-time-use invalidation flow that can be brittle on bad connections.
  // - Cons: It requires the attendee's device to have a moderately accurate clock (for JWT verification) 
  //         and to be online periodically to fetch the new rotated tokens from the server.
  const token = jwt.sign({ attendeeId: attendee.id, eventId: attendee.event_id, base: attendee.base_qr_token }, JWT_SECRET, { expiresIn: '15s' });
  
  // Also check if they are already checked in for live status updates
  const checkinRecord = db.prepare('SELECT 1 FROM checkins WHERE attendee_id = ?').get(req.params.id);
  
  res.json({ token, checkedIn: !!checkinRecord });
});

// 4. Check-In (Hard Requirement 1 & 3: DB level concurrency & Offline Sync)
// Scans from offline devices will have a 'scannedAt' timestamp from the device.
const checkInTransaction = db.transaction((eventId, attendeeId, scannedAt, deviceId) => {
  // Always log the scan attempt
  db.prepare('INSERT INTO scan_logs (event_id, attendee_id, scanned_at, device_id, status) VALUES (?, ?, ?, ?, ?)').run(
    eventId, attendeeId, scannedAt, deviceId, 'ATTEMPT'
  );

  // Attempt to check in. The UNIQUE constraint will throw if already checked in.
  try {
    db.prepare('INSERT INTO checkins (event_id, attendee_id, scanned_at, device_id) VALUES (?, ?, ?, ?)').run(
      eventId, attendeeId, scannedAt, deviceId
    );
    // Update log status to SUCCESS
    db.prepare('UPDATE scan_logs SET status = ? WHERE id = (SELECT max(id) FROM scan_logs WHERE attendee_id = ? AND device_id = ?)')
      .run('SUCCESS', attendeeId, deviceId);
    return { status: 'SUCCESS' };
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      // It's a duplicate scan.
      db.prepare('UPDATE scan_logs SET status = ? WHERE id = (SELECT max(id) FROM scan_logs WHERE attendee_id = ? AND device_id = ?)')
        .run('DUPLICATE', attendeeId, deviceId);
      throw new Error('ALREADY_CHECKED_IN');
    }
    throw error;
  }
});

app.post('/api/checkin', requireOrganizer, (req, res) => {
  const { token, scannedAt, deviceId, scannerEventId } = req.body;
  if (!token) return res.status(400).json({ error: 'Token is required' });

  try {
    // SECURITY & OFFLINE COMPLICATION: 
    // We ignore the standard JWT expiration because the scanner might be offline 
    // and sync the token hours later. Instead, we manually verify that the 
    // 'scannedAt' time occurred while the token was actually fresh.
    const decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true });
    const { attendeeId, eventId } = decoded;
    
    if (scannerEventId && Number(scannerEventId) !== Number(eventId)) {
      return res.status(400).json({ error: 'Ticket is for a different event!' });
    }

    const actualDeviceId = deviceId || 'UNKNOWN';
    const actualScannedAt = scannedAt || new Date().toISOString();

    const existingCheckin = db.prepare('SELECT scanned_at FROM checkins WHERE event_id = ? AND attendee_id = ?').get(eventId, attendeeId);
    const attendee = db.prepare('SELECT name, registration_id FROM attendees WHERE id = ?').get(attendeeId);

    const scanTimeMs = new Date(actualScannedAt).getTime();
    const tokenIatMs = decoded.iat * 1000;
    
    // 1. Check if the token is expired
    // We allow a minimal grace period of 15s. If older, it's expired.
    if (scanTimeMs > tokenIatMs + 15000) {
      db.prepare('INSERT INTO scan_logs (event_id, attendee_id, scanned_at, device_id, status) VALUES (?, ?, ?, ?, ?)').run(eventId, attendeeId, actualScannedAt, actualDeviceId, 'EXPIRED');
      const statusText = existingCheckin ? "owner entered event" : "owner still not entered event";
      return res.status(400).json({ error: `qr code expired , original owner name:${attendee.name},owner reg no.${attendee.registration_id}, and ${statusText}` });
    }

    // 2. Check if the scan time is magically in the future (invalid)
    if (scanTimeMs < tokenIatMs - 5000) {
      db.prepare('INSERT INTO scan_logs (event_id, attendee_id, scanned_at, device_id, status) VALUES (?, ?, ?, ?, ?)').run(eventId, attendeeId, actualScannedAt, actualDeviceId, 'INVALID_TIME');
      return res.status(400).json({ error: 'Invalid Scan: Scanned before ticket existed.' });
    }

    // 3. If valid time, check if they are already checked in
    if (existingCheckin) {
      const time = new Date(existingCheckin.scanned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      db.prepare('INSERT INTO scan_logs (event_id, attendee_id, scanned_at, device_id, status) VALUES (?, ?, ?, ?, ?)').run(eventId, attendeeId, actualScannedAt, actualDeviceId, 'DUPLICATE');
      return res.status(400).json({ error: `Already checked in at ${time}` });
    }


    checkInTransaction.immediate(eventId, attendeeId, actualScannedAt, actualDeviceId);
    
    // Fetch attendee details to return to the scanner
    // (attendee is already fetched above)
    
    broadcastStats(eventId);
    res.json({ success: true, message: 'Checked in successfully', name: attendee.name, registrationId: attendee.registration_id });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(400).json({ error: 'QR Code expired. Please refresh the ticket.' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(400).json({ error: 'Invalid QR Code' });
    }
    if (error.message === 'ALREADY_CHECKED_IN') {
      // Decode again just to get the IDs since they are out of scope here
      try {
        const decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true });
        const existing = db.prepare('SELECT scanned_at FROM checkins WHERE event_id = ? AND attendee_id = ?').get(decoded.eventId, decoded.attendeeId);
        const time = existing ? new Date(existing.scanned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'an unknown time';
        return res.status(400).json({ error: `Already checked in at ${time}` });
      } catch (e) {
        return res.status(400).json({ error: 'Already checked in' });
      }
    }
    console.error('Checkin Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 5. Get Event Stats / Dashboard
app.get('/api/events/:id', requireOrganizer, (req, res) => {
  const stats = getEventStats(req.params.id);
  // Ensure the event belongs to this organizer
  if (!stats || stats.organizer_id !== req.organizerId) return res.status(404).json({ error: 'Not found' });
  
  const attendeesList = db.prepare(`
    SELECT a.name, a.registration_id, a.registered_at, c.scanned_at
    FROM attendees a 
    LEFT JOIN checkins c ON a.id = c.attendee_id 
    WHERE a.event_id = ? 
    ORDER BY a.registered_at DESC
  `).all(req.params.id);
  
  res.json({ stats, attendeesList });
});

// 6. Export CSV
app.get('/api/events/:id/export', requireOrganizer, (req, res) => {
  const event = db.prepare('SELECT id FROM events WHERE id = ? AND organizer_id = ?').get(req.params.id, req.organizerId);
  if (!event) return res.status(404).json({ error: 'Not found' });

  const checkins = db.prepare(`
    SELECT a.name as AttendeeName, a.registered_at as RegisteredAt, c.scanned_at as CheckedInAt, c.device_id as DeviceId
    FROM attendees a
    LEFT JOIN checkins c ON a.id = c.attendee_id
    WHERE a.event_id = ?
    ORDER BY a.name ASC
  `).all(req.params.id);

  let csv = 'AttendeeName,RegisteredAt,CheckedInAt,DeviceId\n';
  checkins.forEach(row => {
    csv += `"${row.AttendeeName}","${row.RegisteredAt}","${row.CheckedInAt || ''}","${row.DeviceId || ''}"\n`;
  });

  res.header('Content-Type', 'text/csv');
  res.attachment('event_export.csv');
  return res.send(csv);
});

// 7. AI Insights (Hard Requirement 4)
app.post('/api/insights', requireOrganizer, async (req, res) => {
  const { eventId, question } = req.body;
  if (!eventId || !question) return res.status(400).json({ error: 'Missing eventId or question' });

  const stats = getEventStats(eventId);
  if (!stats || stats.organizer_id !== req.organizerId) return res.status(404).json({ error: 'Event not found' });

  const peakCheckin = db.prepare(`
    SELECT strftime('%H:00', scanned_at) as hour, count(*) as c
    FROM checkins
    WHERE event_id = ?
    GROUP BY hour
    ORDER BY c DESC
    LIMIT 1
  `).get(eventId);

  const contextData = {
    eventName: stats.name,
    date: stats.date,
    totalCapacity: stats.capacity,
    totalRegistered: stats.registeredCount,
    spotsLeftForRegistration: stats.capacity - stats.registeredCount,
    totalCheckedIn: stats.checkedInCount,
    peopleRegisteredButNotCheckedIn: stats.registeredCount - stats.checkedInCount,
    peakCheckinHour: peakCheckin ? peakCheckin.hour : "No check-ins yet"
  };

  if (!process.env.AI_API_KEY) {
    // Fallback if AI is not configured
    return res.json({ 
      answer: "AI is currently unavailable. (Missing AI_API_KEY). Here are the raw stats:", 
      fallback: contextData 
    });
  }

  try {
    const prompt = `
      You are an event management assistant answering an organizer's question based strictly on the provided real-time data.
      Do not hallucinate numbers. Answer clearly in plain English in 1-3 sentences.
      
      Real-Time Data:
      ${JSON.stringify(contextData, null, 2)}
      
      Question: ${question}
    `;

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.AI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-20b',
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await groqRes.json();
    let answerText = "I couldn't generate an answer.";
    
    if (data.choices && data.choices.length > 0) {
      answerText = data.choices[0].message.content;
    } else if (data.error) {
      throw new Error(data.error.message);
    }

    res.json({ answer: answerText });
  } catch (error) {
    console.error('AI Insights error:', error);
    res.json({ 
      answer: "AI request failed or timed out. Falling back to raw stats.", 
      fallback: contextData 
    });
  }
});

server.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
