/**
 * File: database.js
 * Architecture context: This file handles the SQLite connection and schema creation using `better-sqlite3`.
 * It provides strict synchronous transactions, satisfying the hard requirement for database-level concurrency
 * and locking to strictly enforce event capacities and prevent duplicate check-ins.
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new Database(dbPath, { verbose: console.log });
db.pragma('journal_mode = WAL'); // Better concurrency

// Create schema
const initDB = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS organizers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      club_name TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organizer_id INTEGER NOT NULL DEFAULT 1,
      name TEXT NOT NULL,
      date TEXT NOT NULL,
      capacity INTEGER NOT NULL,
      status TEXT DEFAULT 'active',
      FOREIGN KEY(organizer_id) REFERENCES organizers(id)
    );

    CREATE TABLE IF NOT EXISTS attendees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      base_qr_token TEXT NOT NULL UNIQUE,
      registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(event_id) REFERENCES events(id)
    );

    CREATE TABLE IF NOT EXISTS checkins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      attendee_id INTEGER NOT NULL,
      scanned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      device_id TEXT,
      UNIQUE(event_id, attendee_id),
      FOREIGN KEY(event_id) REFERENCES events(id),
      FOREIGN KEY(attendee_id) REFERENCES attendees(id)
    );

    CREATE TABLE IF NOT EXISTS scan_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      attendee_id INTEGER NOT NULL,
      scanned_at DATETIME NOT NULL,
      device_id TEXT,
      status TEXT NOT NULL,
      FOREIGN KEY(event_id) REFERENCES events(id),
      FOREIGN KEY(attendee_id) REFERENCES attendees(id)
    );
  `);

  // Insert default admin organizer if not exists
  const adminExists = db.prepare('SELECT id FROM organizers WHERE club_name = ?').get('admin');
  if (!adminExists) {
    db.prepare('INSERT INTO organizers (club_name, password) VALUES (?, ?)').run('admin', 'admin');
  }
};

initDB();

try {
  db.prepare('ALTER TABLE attendees ADD COLUMN registration_id TEXT NOT NULL DEFAULT ""').run();
} catch (e) {}

try {
  db.prepare('ALTER TABLE events ADD COLUMN organizer_id INTEGER NOT NULL DEFAULT 1').run();
} catch (e) {}

try {
  db.exec(`
    ALTER TABLE events ADD COLUMN duration_hours TEXT DEFAULT '';
    ALTER TABLE events ADD COLUMN od_timings TEXT DEFAULT '';
    ALTER TABLE events ADD COLUMN end_date TEXT DEFAULT '';
    ALTER TABLE events ADD COLUMN entry_fee TEXT DEFAULT 'Free';
    ALTER TABLE events ADD COLUMN image_url TEXT DEFAULT '';
  `);
} catch (e) {}

try {
  db.prepare('ALTER TABLE events ADD COLUMN details TEXT DEFAULT ""').run();
} catch (e) {}

module.exports = db;
