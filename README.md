# Check-In Quest (Microsoft Innovation Club)

## Overview
Check-In Quest is a gamified, pixel-art themed event registration and check-in system built for the Microsoft Innovation Club. It features a retro arcade aesthetic with a live, playable Mario-style background game. The system handles secure student registrations, real-time event management for organizers, and high-security QR code scanning for physical event entry.

## Architecture

The project is split into a frontend and a backend, running locally.

### Frontend (`/frontend`)
- **Framework:** React + Vite
- **Styling:** Tailwind CSS (Vanilla CSS in `index.css` for custom pixel-art animations/shadows)
- **Key Components:**
  - `App.jsx`: The monolith component containing all routing, state (React `useState`/`useEffect`), WebSocket clients, QR code generation (`qrcode.react`), and the QR Scanner (`jsQR`).
  - `PixelGame.jsx`: A pure HTML5 Canvas-based background game (endless runner) that renders procedurally generated platforms, blocks, coins, and enemies.
- **Features:**
  - **Student Dashboard:** Students log in via a `Name` and `Registration ID` (stored in `localStorage`). They can view active events, register (respecting capacity limits), view their live 15-second rotating QR token, and view past terminated events (Student Report).
  - **Organizer Dashboard:** Organizers log in (default `admin`/`admin`) to create events, monitor live check-in stats, terminate events (soft-delete), ask an AI assistant for data insights, export CSVs, and open the Camera Scanner.
  - **QR Scanner:** Uses the device camera via `jsQR` to scan rotating JWT tokens. It supports offline syncing (caching scans if the network drops and pushing them when online).

### Backend (`/backend`)
- **Framework:** Node.js + Express
- **Database:** SQLite (`better-sqlite3` for synchronous, high-performance WAL mode transactions to prevent race conditions during high-volume check-ins).
- **Real-time:** `socket.io` for live dashboard stat updates.
- **AI:** Google Generative AI (`@google/genai`) for the Organizer's AI Assistant insights.
- **Key Files:**
  - `database.js`: Defines the schema (`organizers`, `events`, `attendees`, `checkins`, `scan_logs`). 
  - `server.js`: API endpoints for auth, event creation, registration (enforces uppercase normalization and uniqueness), check-ins, termination, and AI queries.

## Core Mechanics & Business Rules
1. **Case-Insensitive Registration:** `registration_id` is the primary identity key. All backend queries enforce strict `UPPER()` normalization to prevent duplicate registrations via case differences.
2. **Rotating QR Tokens:** Student QR codes are JWTs signed by the backend that expire every 15 seconds. This prevents ticket screenshot sharing.
3. **Event Termination:** Organizers can "Terminate" an event via a double-confirm button. This sets the event `status` to `terminated`. It hides the event from active registration but preserves the data so students can view a "Past Events (Report)" on their profile.
4. **Offline Scanning:** The scanner attempts to ping the server. If it fails, it pushes the scanned token to an offline queue in `localStorage`. Once the network returns, it automatically syncs the queue to the backend.
