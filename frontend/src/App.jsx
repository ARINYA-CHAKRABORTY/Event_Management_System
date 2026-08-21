/*
 * App.jsx (Backend Integrated)
 * ---------------------------------------------------------------------------
 * Supplies the complete Event Check-In System interface for organizers and attendees.
 * 
 * Wired up to the real Express/SQLite backend running on http://localhost:3002.
 * Syncs real-time checkins using WebSockets and handles offline scanner queuing.
 * ---------------------------------------------------------------------------
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { io } from 'socket.io-client'
import jsQR from 'jsqr'
import PixelGame from './PixelGame'

const API_URL = '/api';
const WS_URL = '/';

const pixelButton = 'border-4 border-black bg-[#f7c948] px-4 py-3 font-pixel text-[10px] leading-5 text-black shadow-[4px_4px_0_0_#000] transition active:translate-x-1 active:translate-y-1 active:shadow-none disabled:cursor-not-allowed disabled:opacity-50'
const panel = 'border-4 border-black bg-white p-5 shadow-[6px_6px_0_0_#1f2937]'

const orgPanel = 'rounded-lg border border-gray-200 bg-white p-6 shadow-sm'
const orgButton = 'rounded-md bg-gray-900 px-4 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-gray-700 disabled:opacity-40 active:scale-95'
const orgInput = 'mt-2 w-full rounded-md border border-gray-300 bg-gray-50 p-3 text-xs text-gray-900 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-colors placeholder:text-gray-400'

function App() {
  const [view, setView] = useState('home')
  const [event, setEvent] = useState(() => JSON.parse(localStorage.getItem('current-event') || 'null'))
  const [orgToken, setOrgToken] = useState(() => localStorage.getItem('org-token') || '')

  useEffect(() => {
    try {
      if (event) {
        localStorage.setItem('current-event', JSON.stringify(event))
      } else {
        localStorage.removeItem('current-event')
      }
    } catch (e) {
      console.warn('Failed to save event to localStorage (possibly too large)');
    }
  }, [event])

  const handleOrgAuth = (token) => {
    setOrgToken(token);
    localStorage.setItem('org-token', token);
  }

  const handleOrgLogout = () => {
    setOrgToken('');
    localStorage.removeItem('org-token');
    localStorage.removeItem('current-event');
    setEvent(null);
    setView('home');
  }

  if (view === 'create') return <CreateEvent setEvent={(e) => { setEvent(e); setView('dashboard'); }} onBack={() => setView('organizer')} orgToken={orgToken} />
  if (view === 'edit') return <CreateEvent existingEvent={event} setEvent={(e) => { setEvent(e); setView('dashboard'); }} onBack={() => setView('dashboard')} orgToken={orgToken} />
  if (view === 'organizer') {
    if (!orgToken) return <OrganizerLogin onLogin={handleOrgAuth} onBack={() => setView('home')} />
    return <EventList onSelect={(e) => { setEvent(e); setView('dashboard'); }} onCreate={() => setView('create')} onLogout={handleOrgLogout} onBack={() => setView('home')} orgToken={orgToken} />
  }
  if (view === 'dashboard') return <Dashboard event={event} onBack={() => setView('organizer')} onCreate={() => setView('create')} onEdit={() => setView('edit')} onScanner={() => setView('scanner')} orgToken={orgToken} onLogout={handleOrgLogout} />
  if (view === 'scanner') return <Scanner event={event} onBack={() => setView('dashboard')} orgToken={orgToken} />
  if (view === 'ticket') return <Attendee onBack={() => setView('home')} />
  return <Home setView={setView} />
}

function Cloud({ className = '' }) { return <span className={`absolute text-5xl text-white drop-shadow-[3px_3px_0_#208bb5] ${className}`}>☁</span> }
function BackgroundDecorations() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let raf;
    const resize = () => { 
      canvas.width = window.innerWidth; 
      canvas.height = window.innerHeight; 
    };
    window.addEventListener('resize', resize); resize();
    
    // We only use 6 blocks to avoid crowding on mobile screens
    const tetrisBlocks = Array.from({length: 6}).map((_, i) => ({
      lane: i,
      y: Math.random() * -800 - 100,
      type: ['L', 'T', 'S', 'I'][Math.floor(Math.random() * 4)],
      speed: 1.5 + Math.random() * 2,
      color: ['#fca311', '#9b5de5', '#00f5d4', '#00bbf9', '#ff006e', '#fee440'][Math.floor(Math.random() * 6)]
    }));
    
    const dinoFrames = [
      [
        '        RRRRRRR ',
        '       RRRRRRR R',
        '       RRRRRRRRR',
        '       RRRRRRRRR',
        '       RRR      ',
        '       RRRRRRRR ',
        'R      RRRR R   ',
        'RR    RRRRR     ',
        'RRR  RRRRRR     ',
        ' RRRRRRRRRR     ',
        '  RRRRRRRR      ',
        '   RRRRRR       ',
        '    RR  RR      ',
        '                '
      ],
      [
        '        RRRRRRR ',
        '       RRRRRRR R',
        '       RRRRRRRRR',
        '       RRRRRRRRR',
        '       RRR      ',
        '       RRRRRRRR ',
        'R      RRRR R   ',
        'RR    RRRRR     ',
        'RRR  RRRRRR     ',
        ' RRRRRRRRRR     ',
        '  RRRRRRRR      ',
        '   RRRRRR       ',
        '    RR  RR      ',
        '    RR          '
      ],
      [
        '        RRRRRRR ',
        '       RRRRRRR R',
        '       RRRRRRRRR',
        '       RRRRRRRRR',
        '       RRR      ',
        '       RRRRRRRR ',
        'R      RRRR R   ',
        'RR    RRRRR     ',
        'RRR  RRRRRR     ',
        ' RRRRRRRRRR     ',
        '  RRRRRRRR      ',
        '   RRRRRR       ',
        '    RR  RR      ',
        '        RR      '
      ]
    ];
    let dinoX = -100;
    let dinoY = 0;
    let dinoVy = 0;
    let dinoOnGround = true;

    const handleKeyDown = (e) => {
      if (e.code === 'Space' && dinoOnGround) {
        dinoVy = -11;
        dinoOnGround = false;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    
    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(2, (now - last) / (1000 / 60)); last = now;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const groundY = canvas.height - 40; // grass bar is 40px at bottom
      
      // Dynamic square size to prevent overlap on small screens
      const s = Math.min(30, canvas.width / 24); 
      
      for (const b of tetrisBlocks) {
        b.y += b.speed * dt;
        if (b.y > groundY) { // Reset as soon as the block drops completely below the grass line
          b.y = Math.random() * -300 - 100;
          b.type = ['L', 'T', 'S', 'I'][Math.floor(Math.random() * 4)];
        }
        const laneWidth = canvas.width / tetrisBlocks.length;
        const bx = b.lane * laneWidth + (laneWidth / 2) - (s * 1.5);
        ctx.fillStyle = b.color;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        const drawBlock = (x, y) => { ctx.fillRect(bx + x*s, b.y + y*s, s, s); ctx.strokeRect(bx + x*s, b.y + y*s, s, s); };
        if (b.type === 'L') { drawBlock(0,0); drawBlock(0,1); drawBlock(0,2); drawBlock(1,2); }
        if (b.type === 'T') { drawBlock(1,0); drawBlock(0,1); drawBlock(1,1); drawBlock(2,1); }
        if (b.type === 'S') { drawBlock(1,0); drawBlock(2,0); drawBlock(0,1); drawBlock(1,1); }
        if (b.type === 'I') { drawBlock(0,0); drawBlock(0,1); drawBlock(0,2); drawBlock(0,3); }
      }
      
      dinoX += 5 * dt;
      if (dinoX > canvas.width + 100) dinoX = -100;
      
      if (!dinoOnGround) {
        dinoVy += 0.6 * dt;
        dinoY += dinoVy * dt;
        if (dinoY >= 0) {
          dinoY = 0;
          dinoVy = 0;
          dinoOnGround = true;
        }
      }
      
      const px = 4;
      const baseY = groundY - (14 * px); // dino sits on top of the 40px grass
      const drawY = baseY + dinoY;
      const frame = dinoFrames[dinoOnGround ? (Math.floor(now / 150) % 2) + 1 : 0];
      ctx.fillStyle = '#535353';
      for (let r = 0; r < frame.length; r++) {
        for (let c = 0; c < frame[r].length; c++) {
          if (frame[r][c] === 'R') ctx.fillRect(dinoX + c * px, drawY + r * px, px, px);
        }
      }
      
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); window.removeEventListener('keydown', handleKeyDown); };
  }, []);
  
  return <canvas ref={canvasRef} className="absolute inset-0 z-0 pointer-events-none opacity-60" />;
}

function Home({ setView }) {
  return <main className="flex h-screen flex-col overflow-hidden bg-[#5cc7f2] font-pixel relative">
    <BackgroundDecorations />
    <Cloud className="left-[12%] top-16 scale-110" />
    <Cloud className="right-[15%] top-24 scale-90" />
    <Cloud className="left-[45%] top-8 scale-75 opacity-70" />
    <Cloud className="left-[80%] top-48 scale-125 opacity-80" />
    <Cloud className="left-[25%] top-40 scale-50 opacity-90" />
    <section className="mx-auto flex flex-1 w-full max-w-4xl flex-col items-center justify-center px-5 text-center relative z-20">
      <p className="text-xs text-white drop-shadow-[2px_2px_0_#1f2937]">PLAYER 1 • EVENT MODE</p>
      <h1 className="mt-5 text-3xl leading-[1.7] text-white drop-shadow-[5px_5px_0_#b6302f] sm:text-5xl">EVENT<br />CHECK-IN</h1>
      <div className="mt-9 flex flex-col gap-5 sm:flex-row">
        <button 
          className="border-4 border-black px-6 py-3 font-pixel text-[10px] leading-5 text-white shadow-[4px_4px_0_0_#000] transition active:translate-x-1 active:translate-y-1 active:shadow-none"
          style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 50%, #2563eb 100%)', boxShadow: '4px 4px 0 0 #1e1b4b' }}
          onClick={() => setView('organizer')}
        >⚙ ORGANIZER MODE</button>
        <button className={pixelButton} onClick={() => setView('ticket')}>▶ STUDENT PROFILE</button>
      </div>
    </section><div className="h-10 shrink-0 border-y-4 border-black bg-[#54a946] [background-image:linear-gradient(90deg,#3d8137_25%,transparent_25%,transparent_50%,#3d8137_50%,#3d8137_75%,transparent_75%)] [background-size:32px_32px] relative z-10" />
  </main>
}

function EventList({ onSelect, onCreate, onLogout, onBack, orgToken }) {
  const [events, setEvents] = useState([]);
  
  const fetchEvents = () => {
    fetch(`${API_URL}/organizer/events`, { headers: { 'Authorization': `Bearer ${orgToken}` } })
      .then(r => r.json())
      .then(data => Array.isArray(data) && setEvents(data));
  };

  useEffect(() => {
    fetchEvents();
    const socket = io(WS_URL);
    try {
      const payload = JSON.parse(atob(orgToken.split('.')[1]));
      socket.on(`organizer-${payload.organizerId}-events-updated`, fetchEvents);
    } catch (e) {}
    
    return () => socket.disconnect();
  }, [orgToken]);

  return <OrganizerPage title="YOUR EVENTS" subtitle="SELECT AN EVENT TO MANAGE" onBack={onBack} onLogout={onLogout}>
    <button className={`${orgButton} w-full mb-6 bg-indigo-600 hover:bg-indigo-500`} onClick={onCreate}>+ CREATE NEW EVENT</button>
    <div className="grid gap-4 md:grid-cols-2">
      {events.map(ev => (
        <div key={ev.id} onClick={() => onSelect(ev)} className={`${orgPanel} cursor-pointer hover:bg-gray-50 transition group border-2 hover:border-gray-400`}>
           <h3 className="text-sm font-bold text-gray-900 group-hover:text-teal-600">{ev.name.toUpperCase()}</h3>
           <p className="text-[10px] text-gray-500 mt-2">{ev.date} • {ev.capacity} SPOTS</p>
        </div>
      ))}
      {events.length === 0 && <p className="text-[10px] text-gray-500 col-span-full text-center py-10">NO EVENTS FOUND. CREATE ONE TO GET STARTED.</p>}
    </div>
  </OrganizerPage>
}

function Dashboard({ event, onBack, onCreate, onEdit, onScanner, orgToken, onLogout }) {
  const [stats, setStats] = useState({ capacity: event?.capacity || 0, registeredCount: 0, checkedInCount: 0 })
  const [attendeesList, setAttendeesList] = useState([])
  const [aiQuery, setAiQuery] = useState('')
  const [aiResult, setAiResult] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [showTerminateModal, setShowTerminateModal] = useState(false)
  const [terminateCountdown, setTerminateCountdown] = useState(null)
  const terminateTimerRef = useRef(null)
  const [activeScanners, setActiveScanners] = useState(0)

  const executeTermination = async () => {
    try {
      const res = await fetch(`${API_URL}/events/${event.id}/terminate`, { method: 'POST', headers: { 'Authorization': `Bearer ${orgToken}` } });
      if (res.ok) onBack();
    } catch(e) {}
  };

  const startTermination = () => {
    setShowTerminateModal(false);
    setTerminateCountdown(5);
    terminateTimerRef.current = setInterval(() => {
      setTerminateCountdown(prev => {
        if (prev <= 1) {
          clearInterval(terminateTimerRef.current);
          executeTermination();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const undoTermination = () => {
    clearInterval(terminateTimerRef.current);
    setTerminateCountdown(null);
  };

  useEffect(() => {
    if (!event?.id || !orgToken) return;
    
    fetch(`${API_URL}/events/${event.id}`, { headers: { 'Authorization': `Bearer ${orgToken}` } }).then(r => r.json()).then(data => {
      if (data.stats) setStats(data.stats);
      if (data.attendeesList) setAttendeesList(data.attendeesList);
    });

    const socket = io(WS_URL);
    socket.on(`event-${event.id}-update`, (newStats) => {
      setStats(newStats);
      fetch(`${API_URL}/events/${event.id}`, { headers: { 'Authorization': `Bearer ${orgToken}` } }).then(r => r.json()).then(data => {
        if (data.attendeesList) setAttendeesList(data.attendeesList);
      });
    });
    socket.on(`event-${event.id}-scanners-update`, ({ count }) => setActiveScanners(count));
    // Request current scanner count immediately on connect
    socket.on('connect', () => socket.emit('get-scanner-count', { eventId: event.id }));
    socket.emit('get-scanner-count', { eventId: event.id });
    return () => socket.disconnect();
  }, [event?.id, orgToken]);

  const exportCsv = async () => {
    try {
      const res = await fetch(`${API_URL}/events/${event.id}/export`, { headers: { 'Authorization': `Bearer ${orgToken}` }});
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'event_export.csv';
      document.body.appendChild(a); a.click(); a.remove();
    } catch(err) { alert('Failed to export CSV'); }
  }

  const [aiFallback, setAiFallback] = useState(null);

  const askAi = async (e) => {
    e.preventDefault();
    if (!aiQuery) return;
    setAiLoading(true); setAiResult(null); setAiFallback(null);
    try {
      const res = await fetch(`${API_URL}/insights`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${orgToken}` }, body: JSON.stringify({ eventId: event.id, question: aiQuery }) });
      const data = await res.json();
      setAiResult(data.answer);
      if (data.fallback) setAiFallback(data.fallback);
    } catch (err) { setAiResult("AI failed to load."); }
    setAiLoading(false);
  };

  if (!event) return <OrganizerPage title="NO EVENT ACTIVE" subtitle="CREATE ONE FIRST" onBack={onBack} onLogout={onLogout}><button className={`${orgButton} w-full`} onClick={onCreate}>CREATE EVENT</button></OrganizerPage>

  return <OrganizerPage title="EVENT DASHBOARD" subtitle="REAL-TIME MANAGEMENT" onBack={onBack} onLogout={onLogout}>
    {showTerminateModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className={`${orgPanel} max-w-sm w-full shadow-2xl`}>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Terminate Event?</h2>
          <p className="text-sm text-gray-600 mb-6">Are you sure you want to terminate this event? Scanning will be stopped immediately.</p>
          <div className="flex gap-3 justify-end">
            <button className={`${orgButton} bg-gray-200 !text-gray-800 hover:bg-gray-300`} onClick={() => setShowTerminateModal(false)}>CANCEL</button>
            <button className={`${orgButton} bg-red-600 !text-white hover:bg-red-700`} onClick={startTermination}>YES, TERMINATE</button>
          </div>
        </div>
      </div>
    )}

    {terminateCountdown !== null && (
      <div className="fixed bottom-10 left-0 right-0 z-50 flex justify-center pointer-events-none">
        <div className="bg-gray-900 text-white rounded-lg shadow-xl p-4 flex items-center gap-4 pointer-events-auto border border-gray-700 animate-bounce">
          <p className="text-sm font-semibold">Terminating in {terminateCountdown}s...</p>
          <button className={`${orgButton} bg-white !text-gray-900 hover:bg-gray-200 py-1.5 px-3`} onClick={undoTermination}>UNDO</button>
        </div>
      </div>
    )}

    <div className="grid gap-5 grid-cols-2 md:grid-cols-5">
      <Stat label="REGISTERED" value={stats.registeredCount} />
      <Stat label="CHECKED IN" value={stats.checkedInCount} />
      <Stat label="CAPACITY" value={stats.capacity} />
      <Stat label="SPOTS LEFT" value={stats.capacity - stats.registeredCount} />
      <div className={`${orgPanel} text-center border-2 ${activeScanners > 0 ? 'border-teal-500 bg-teal-50' : 'border-gray-200'}`}>
        <p className={`text-3xl font-medium ${activeScanners > 0 ? 'text-teal-600' : 'text-gray-400'}`}>{activeScanners}</p>
        <p className="mt-2 text-[9px] text-gray-500 font-semibold">ACTIVE SCANNERS</p>
        {activeScanners > 0 && <span className="inline-block mt-1 w-2 h-2 rounded-full bg-teal-500 animate-pulse" />}
      </div>
    </div>
    
    <div className="mt-7 grid gap-7 lg:grid-cols-[1fr_1.5fr]">
      <div className="space-y-7">
        <div className={orgPanel}>
          <p className="text-sm font-semibold text-gray-900">{event?.name?.toUpperCase() || 'UNTITLED EVENT'}</p>
          <p className="mt-2 text-xs text-gray-500">{event.date}</p>
          <div className="mt-6 flex flex-col gap-3">
            <button className={`${orgButton}`} onClick={onScanner}>OPEN SCANNER</button>
            <button className={`${orgButton} bg-teal-600 hover:bg-teal-500`} onClick={onEdit}>EDIT EVENT</button>
            <button className={`${orgButton} bg-gray-600 hover:bg-gray-500`} onClick={exportCsv}>EXPORT DATA (CSV)</button>
            <button className={`${orgButton} bg-white border-2 border-gray-300 !text-gray-700 hover:bg-gray-100`} onClick={onCreate}>CREATE NEW EVENT</button>
            <button 
              className={`${orgButton} bg-transparent border-2 border-red-500 !text-red-600 hover:bg-red-500 hover:!text-white transition-all`} 
              onClick={() => setShowTerminateModal(true)}>
              ⚠️ TERMINATE EVENT
            </button>
          </div>
        </div>

      </div>

      {/* AI EVENT ASSISTANT — full width below the grid */}
      <div className={`${orgPanel} mt-7`}>
        <h3 className="text-sm font-bold text-gray-800 mb-4">AI EVENT ASSISTANT</h3>
        <form onSubmit={askAi} className="flex flex-col gap-3">
          <textarea
            rows={3}
            value={aiQuery}
            onChange={e => setAiQuery(e.target.value)}
            placeholder="Ask anything about this event — check-in rates, attendance trends, student queries..."
            className="w-full rounded-md border border-gray-300 bg-gray-50 p-4 text-xs text-gray-900 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 resize-none placeholder:text-gray-400"
          />
          <button className={`${orgButton} self-end px-8`}>ASK AI</button>
        </form>
        {aiLoading && <p className="mt-4 text-xs text-teal-600 animate-pulse">Analyzing event data...</p>}
        {aiResult && (
          <div className="mt-4 bg-gray-50 p-4 rounded-md border border-gray-200">
            <p className="text-xs leading-6 text-gray-800">{aiResult}</p>
            {aiFallback && (
              <div className="mt-4 border-t border-gray-200 pt-4">
                <p className="text-[10px] font-bold text-gray-500 mb-2">RAW FALLBACK DATA:</p>
                <pre className="text-[10px] bg-gray-100 p-2 rounded text-gray-700 overflow-x-auto">
                  {JSON.stringify(aiFallback, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>

      <div className={orgPanel}>
        <div className="mb-5 flex items-center justify-between gap-3"><h2 className="text-xs font-semibold text-gray-900">ALL ATTENDEES (REGISTERED & SCANNED)</h2><span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full text-[8px] animate-pulse border border-emerald-300">LIVE</span></div>
        <div className="space-y-3">
          {attendeesList.map((guest, i) => (
            <div key={i} className="flex flex-col gap-1 border-b border-gray-200 pb-3 text-[10px]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-gray-900 font-bold text-xs">{guest.name.toUpperCase()} <span className="text-gray-500 font-normal">({guest.registration_id})</span></span>
                {guest.scanned_at ? (
                   <span className="text-emerald-600 font-bold">✓ SCANNED: {new Date(guest.scanned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                ) : (
                   <span className="text-amber-600 font-bold">⏳ WAITING AT GATE</span>
                )}
              </div>
              <p className="text-gray-500">REGISTERED: {new Date(guest.registered_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</p>
            </div>
          ))}
          {attendeesList.length === 0 && <p className="text-[10px] text-gray-500">NO ATTENDEES YET</p>}
        </div>
      </div>
    </div>
  </OrganizerPage>
}

function Stat({ label, value }) { return <div className={`${orgPanel} text-center`}><p className="text-3xl text-gray-900 font-medium">{value}</p><p className="mt-2 text-[9px] text-gray-500 font-semibold">{label}</p></div> }

function CreateEvent({ setEvent, onBack, orgToken, existingEvent }) { 
  const [form, setForm] = useState({ 
    name: existingEvent?.name || '', 
    date: existingEvent?.date || '', 
    end_date: existingEvent?.end_date || '', 
    duration_hours: existingEvent?.duration_hours || '', 
    od_start: existingEvent?.od_timings?.split(' - ')[0] || '', 
    od_end: existingEvent?.od_timings?.split(' - ')[1] || '', 
    capacity: existingEvent?.capacity || 100, 
    entry_fee: existingEvent?.entry_fee?.startsWith('Paid') ? 'Paid' : 'Free', 
    image_url: existingEvent?.image_url || '', 
    details: existingEvent?.details || '',
    price_tiers: existingEvent?.entry_fee?.startsWith('Paid:') ? 
      existingEvent.entry_fee.replace('Paid: ', '').split(', ').map(t => { 
        const m = t.match(/(.+) \(₹(\d+)\)/); return m ? { label: m[1], amount: m[2] } : { label: '1 Person', amount: '' } 
      }) : [{ label: '1 Person', amount: '' }] 
  }); 
  const [loading, setLoading] = useState(false);
  const [dateError, setDateError] = useState('');
  
  const handleImage = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => setForm({...form, image_url: e.target.result});
      reader.readAsDataURL(file);
    }
  }

  const handleDateChange = (field, value) => {
    const next = { ...form, [field]: value };
    if (next.date && next.end_date && next.end_date < next.date) {
      setDateError('End date cannot be before start date');
    } else {
      setDateError('');
    }
    setForm(next);
  };

  const addTier = () => setForm({ ...form, price_tiers: [...form.price_tiers, { label: '', amount: '' }] });
  const removeTier = (i) => setForm({ ...form, price_tiers: form.price_tiers.filter((_, idx) => idx !== i) });
  const updateTier = (i, field, value) => {
    const tiers = form.price_tiers.map((t, idx) => idx === i ? { ...t, [field]: value } : t);
    setForm({ ...form, price_tiers: tiers });
  };

  const odInvalid = form.od_start && form.od_end && form.od_end <= form.od_start;

  const save = async (e) => { 
    e.preventDefault(); 
    if (dateError) return alert(dateError);
    if (form.date && form.end_date && form.end_date < form.date) return alert('End date cannot be before start date');
    if (odInvalid) return alert('OD end time must be after start time');

    const od_timings = form.od_start && form.od_end ? `${form.od_start} - ${form.od_end}` : '';
    
    let final_entry_fee = form.entry_fee;
    if (form.entry_fee === 'Paid' && form.price_tiers.length > 0) {
      final_entry_fee = 'Paid: ' + form.price_tiers.map(t => `${t.label} (₹${t.amount})`).join(', ');
    }

    const payload = { ...form, od_timings, entry_fee: final_entry_fee };

    setLoading(true);
    try {
      let res;
      if (existingEvent) {
        res = await fetch(`${API_URL}/events/${existingEvent.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${orgToken}` }, body: JSON.stringify(payload) });
      } else {
        res = await fetch(`${API_URL}/events`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${orgToken}` }, body: JSON.stringify(payload) });
      }
      const text = await res.text();
      let data = {};
      try { data = JSON.parse(text); } catch { data = { error: 'Server error. Try logging out and back in.' }; }
      if (res.status === 401 || res.status === 403) throw new Error('Session expired. Please LOGOUT and log back in.');
      if (!res.ok) throw new Error(data.error || `Failed to ${existingEvent ? 'update' : 'create'} event`);
      setEvent(existingEvent ? { ...existingEvent, ...payload } : { id: data.id, ...payload });
    } catch(err) { 
      alert(err.message || `Failed to ${existingEvent ? 'update' : 'create'} event`); 
    }
    setLoading(false);
  }; 

  return <OrganizerPage title={existingEvent ? "EDIT EVENT" : "NEW EVENT SETUP"} subtitle={existingEvent ? "UPDATE PARAMETERS" : "DEFINE PARAMETERS"} onBack={onBack}>
    <form onSubmit={save} className={`${orgPanel} mx-auto max-w-xl space-y-5`}>
      <Field label="EVENT NAME" value={form.name} onChange={(name) => setForm({ ...form, name })} />
      
      <label className="block text-[10px] text-slate-400 font-semibold">EVENT DETAILS (Optional)
        <textarea rows={4} value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} className={`${orgInput} resize-none`} placeholder="Write about event details..."></textarea>
      </label>
      
      <div className="grid grid-cols-2 gap-4">
        <label className="block text-[10px] text-slate-400 font-semibold">START DATE
          <input required type="date" value={form.date} max={form.end_date || undefined}
            onChange={(e) => handleDateChange('date', e.target.value)} className={orgInput} />
        </label>
        <label className="block text-[10px] text-slate-400 font-semibold">END DATE (Optional)
          <input type="date" value={form.end_date} min={form.date || undefined}
            onChange={(e) => handleDateChange('end_date', e.target.value)} className={orgInput} />
        </label>
      </div>
      {dateError && <p className="text-red-400 text-[10px] -mt-3 bg-red-500/10 p-2 rounded border border-red-500/20">{dateError}</p>}

      <div className="grid grid-cols-2 gap-4">
        <Field label="DURATION (HOURS)" type="number" value={form.duration_hours} onChange={(duration_hours) => setForm({ ...form, duration_hours })} optional />
        <Field label="STRICT CAPACITY LIMIT" type="number" value={form.capacity} onChange={(capacity) => setForm({ ...form, capacity })} />
      </div>

      <div>
        <p className="block text-[10px] text-slate-400 font-semibold mb-1">OD TIMINGS</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-[10px] text-slate-500">FROM
            <input type="time" value={form.od_start} onChange={(e) => setForm({ ...form, od_start: e.target.value })} className={orgInput} />
          </label>
          <label className="block text-[10px] text-slate-500">TO
            <input type="time" value={form.od_end} min={form.od_start || undefined}
              onChange={(e) => setForm({ ...form, od_end: e.target.value })} className={orgInput} />
          </label>
        </div>
        {odInvalid && (
          <p className="text-red-400 text-[10px] mt-1">OD end time must be after start time</p>
        )}
      </div>
      
      <label className="block text-[10px] text-slate-400 font-semibold">ENTRY FEE
        <select required value={form.entry_fee} onChange={(e) => setForm({...form, entry_fee: e.target.value})} className={orgInput}>
          <option value="Free">Free</option>
          <option value="Paid">Paid</option>
        </select>
      </label>

      {form.entry_fee === 'Paid' && (
        <div className="space-y-3 rounded-lg border border-indigo-500/30 bg-indigo-900/20 p-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-indigo-300 font-semibold">PAYMENT TIERS</p>
            <button type="button" onClick={addTier} className="text-[9px] bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-1 rounded transition">+ ADD TIER</button>
          </div>
          {form.price_tiers.map((tier, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
              <label className="block text-[9px] text-slate-500">LABEL (e.g. 1 Person, 2 People)
                <input type="text" required value={tier.label} placeholder="e.g. Solo Ticket"
                  onChange={(e) => updateTier(i, 'label', e.target.value)} className={orgInput} />
              </label>
              <label className="block text-[9px] text-slate-500">AMOUNT (₹)
                <input type="number" required min="1" value={tier.amount} placeholder="e.g. 400"
                  onChange={(e) => updateTier(i, 'amount', e.target.value)} className={orgInput} />
              </label>
              {form.price_tiers.length > 1 && (
                <button type="button" onClick={() => removeTier(i)} className="mb-1 text-red-400 hover:text-red-300 text-lg leading-none transition">×</button>
              )}
            </div>
          ))}
        </div>
      )}
      
      <label className="block text-[10px] text-slate-400 font-semibold">EVENT BANNER IMAGE
        <input type="file" accept="image/*" onChange={handleImage} className={`${orgInput} file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-700`} />
      </label>
      {form.image_url && <img src={form.image_url} alt="Preview" className="w-full h-32 object-cover rounded-md border border-slate-700" />}

      <button disabled={loading || !!dateError || !!odInvalid} className={`${orgButton} mt-3 w-full`}>{loading ? 'SAVING...' : (existingEvent ? 'SAVE CHANGES' : 'CREATE EVENT')}</button>
    </form>
  </OrganizerPage> 
}
function Field({ label, value, onChange, type = 'text', optional = false }) { return <label className="block text-[10px] text-slate-400 font-semibold">{label}<input required={!optional} type={type} value={value} onChange={(e) => onChange(e.target.value)} className={orgInput} /></label> }

function OrganizerLogin({ onLogin, onBack }) {
  const [clubName, setClubName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_URL}/organizer/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clubName, password }) });
      const data = await res.json();
      if(res.ok) { onLogin(data.token); } else { setError(data.error); }
    } catch { setError("Login failed"); }
    setLoading(false);
  }

  return <OrganizerPage title="ORGANIZER LOGIN" subtitle="ACCESS YOUR DASHBOARD" onBack={onBack}>
    <form onSubmit={submit} className={`${orgPanel} mx-auto max-w-sm space-y-5`}>
      {error && <p className="bg-red-500/10 text-red-400 p-3 text-xs text-center rounded-md border border-red-500/20">{error}</p>}
      <label className="block text-[10px] text-slate-400 font-semibold mb-3">CLUB NAME
        <input required value={clubName} onChange={e=>setClubName(e.target.value)} className={orgInput} />
      </label>
      <label className="block text-[10px] text-slate-400 font-semibold mb-3">PASSWORD
        <input required type="password" value={password} onChange={e=>setPassword(e.target.value)} className={orgInput} />
      </label>
      <button disabled={loading} className={`${orgButton} w-full mt-2`}>LOGIN</button>
    </form>
  </OrganizerPage>
}

function Scanner({ event, onBack, orgToken }) {
  const [code, setCode] = useState(''); const [result, setResult] = useState(null); const [cameraStatus, setCameraStatus] = useState('PRESS START CAMERA'); const video = useRef(null); const stream = useRef(null); const timer = useRef(null)
  
  // Offline queue sync logic
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queueCount, setQueueCount] = useState(0);
  const getQueue = () => JSON.parse(localStorage.getItem('offlineQueue') || '[]');
  const setQueue = (q) => { localStorage.setItem('offlineQueue', JSON.stringify(q)); setQueueCount(q.length); };
  
  // Register this device as an active scanner
  useEffect(() => {
    if (!event?.id) return;
    const socket = io(WS_URL);
    socket.emit('scanner-join', { eventId: event.id });
    return () => {
      socket.emit('scanner-leave', { eventId: event.id });
      socket.disconnect();
    };
  }, [event?.id]);

  useEffect(() => {
    if (!localStorage.getItem('deviceId')) localStorage.setItem('deviceId', 'DEVICE_' + Math.random().toString(36).substr(2, 9));
    setQueueCount(getQueue().length);
    const sync = async () => {
      const q = getQueue();
      if(q.length === 0) return;
      const newQ = [];
      for(const item of q) {
        try {
          const res = await fetch(`${API_URL}/checkin`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${orgToken}` }, body: JSON.stringify(item) });
          if (!res.ok && res.status !== 400) newQ.push(item);
        } catch { newQ.push(item); }
      }
      setQueue(newQ);
    };
    const handleOnline = () => { setIsOnline(true); sync(); };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline); window.addEventListener('offline', handleOffline);
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
  }, []);

  const lastScanned = useRef({});
  const submitCode = async (value) => { 
    const now = Date.now();
    if (lastScanned.current[value] && now - lastScanned.current[value] < 3000) return; // Debounce
    lastScanned.current[value] = now;
    setCode('');

    const payload = { token: value, scannedAt: new Date().toISOString(), deviceId: localStorage.getItem('deviceId') };

    // --- LOCAL JWT VALIDATION (Works Offline!) ---
    try {
      const parts = value.split('.');
      if (parts.length !== 3) throw new Error('Invalid JWT format');
      const jwtPayload = JSON.parse(atob(parts[1]));
      
      const scanTime = new Date(payload.scannedAt).getTime() / 1000;
      if (scanTime - jwtPayload.iat > 15) {
        setResult({ ok: false, message: 'EXPIRED QR CODE (Generated > 15s ago)' });
        return;
      }
    } catch (e) {
      setResult({ ok: false, message: 'INVALID TICKET FORMAT' });
      return;
    }
    // ---------------------------------------------
    if (navigator.onLine) {
      try {
        const res = await fetch(`${API_URL}/checkin`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${orgToken}` }, body: JSON.stringify(payload) });
        const data = await res.json();
        setResult({ ok: res.ok, message: res.ok ? `ACCESS GRANTED: ${data.name} (${data.registrationId})` : (data.error || 'ACCESS DENIED') });
      } catch (err) {
        const q = getQueue(); q.push(payload); setQueue(q);
        setResult({ ok: true, message: 'SAVED OFFLINE' });
      }
    } else {
      const q = getQueue(); q.push(payload); setQueue(q);
      setResult({ ok: true, message: 'SAVED OFFLINE' });
    }
  }
  
  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) { setCameraStatus('CAMERA API UNSUPPORTED — USE MANUAL MODE'); return }
    try { 
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); 
      video.current.srcObject = stream.current; 
      await video.current.play(); 
      setCameraStatus('SCANNING FOR A QR TICKET...'); 
      
      const scan = async () => { 
        if (!video.current || video.current.readyState < 2) return; 
        
        // We exclusively use jsQR for scanning because the native BarcodeDetector API 
        // is notoriously buggy on Windows (it exists in Chrome but returns empty arrays).
        if (jsQR) {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = video.current.videoWidth;
            canvas.height = video.current.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video.current, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "attemptBoth" });
            if (code && code.data) {
              const now = Date.now();
              if (!lastScanned.current[code.data] || now - lastScanned.current[code.data] >= 3000) {
                submitCode(code.data);
                setCameraStatus('TICKET CAPTURED'); 
                setTimeout(() => setCameraStatus('SCANNING FOR A QR TICKET...'), 2000); 
              }
            }
          } catch (e) {
            console.error('jsQR Error:', e);
          }
        } else {
          setCameraStatus('QR SCANNING NOT SUPPORTED BY BROWSER');
          return;
        }
        
        // Throttle scan rate to prevent freezing the UI (approx 10 FPS)
        timer.current = setTimeout(scan, 100);
      }; 
      timer.current = setTimeout(scan, 100);
    } catch { setCameraStatus('CAMERA ACCESS DENIED — USE MANUAL MODE') }
  }
  useEffect(() => () => { clearTimeout(timer.current); stream.current?.getTracks().forEach((track) => track.stop()) }, [])
  const submit = (e) => { e.preventDefault(); submitCode(code) }
  
  return <OrganizerPage title="QR SCANNER" subtitle={event?.name || 'NO EVENT'} onBack={onBack}>
    <div className="mx-auto max-w-lg">
      <div className={`mb-4 p-2 text-center text-[10px] font-semibold text-white rounded-sm ${isOnline ? 'bg-green-600' : 'bg-red-500'}`}>
        {isOnline ? 'NETWORK: ONLINE' : `NETWORK: OFFLINE (${queueCount} PENDING SYNC)`}
      </div>
      <div className="relative aspect-square overflow-hidden bg-slate-900 rounded-md shadow-md border border-slate-300">
        <video ref={video} muted playsInline className="absolute inset-0 h-full w-full object-cover" />
        <div className="relative h-full border-[6px] border-blue-500 opacity-80 m-4">
          <div className="absolute left-0 right-0 h-1 bg-blue-400 shadow-[0_0_12px_#60a5fa] animate-[scan-line_2s_ease-in-out_infinite]" />
        </div>
        <span className="absolute left-6 top-6 text-[10px] text-white font-semibold tracking-wider">VIEWFINDER</span>
      </div>
      <button className={`${orgButton} mt-5 w-full bg-blue-600 hover:bg-blue-700`} onClick={startCamera}>START CAMERA</button>
      <p className="mt-4 text-center text-[10px] text-slate-500">{cameraStatus}</p>
      
      <div className="mt-8 border-t border-slate-200 pt-6">
        <h3 className="text-xs font-semibold text-slate-700 mb-3">MANUAL FALLBACK</h3>
        <form onSubmit={submit} className="flex gap-2">
          <input aria-label="Ticket code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="MANUAL TICKET ENTRY..." className="min-w-0 flex-1 border rounded-sm bg-slate-50 p-3 text-xs outline-none focus:border-blue-500 focus:bg-white" />
          <button className={orgButton}>SUBMIT</button>
        </form>
      </div>
      
      {result && (
        <div className={`mt-5 p-4 text-center text-xs font-bold uppercase rounded-md shadow-sm border ${
          result.ok ? 'bg-green-50 text-green-700 border-green-200' 
          : (result.message === 'Already checked in' || result.message.includes('Already')) ? 'bg-orange-50 text-orange-700 border-orange-200'
          : 'bg-red-50 text-red-700 border-red-200'
        }`}>
          {result.message}
        </div>
      )}
    </div>
  </OrganizerPage>
}

function Attendee({ onBack }) { 
  // Global Profile State
  const [profile, setProfile] = useState(() => JSON.parse(localStorage.getItem('my-profile') || 'null'));
  const [name, setName] = useState(profile?.name || '');
  const [registrationId, setRegistrationId] = useState(profile?.registrationId || '');

  const [tickets, setTickets] = useState(() => profile ? JSON.parse(localStorage.getItem(`my-tickets-${profile.registrationId}`) || '{}') : {});
  const [activeTicket, setActiveTicket] = useState(null);
  
  useEffect(() => {
    if (profile) {
      setTickets(JSON.parse(localStorage.getItem(`my-tickets-${profile.registrationId}`) || '{}'));
    } else {
      setTickets({});
    }
  }, [profile]);

  const [token, setToken] = useState('');
  const [timeLeft, setTimeLeft] = useState(15);
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  // Multi-event selection
  const [availableEvents, setAvailableEvents] = useState([]);
  const [pastEvents, setPastEvents] = useState([]);
  const [fetchingEvents, setFetchingEvents] = useState(false);

  const [viewingEvent, setViewingEvent] = useState(null);

  useEffect(() => {
    if (!activeTicket && profile) {
      setFetchingEvents(true);
      fetch(`${API_URL}/events`).then(r => r.json()).then(data => {
        setAvailableEvents(data);
        setFetchingEvents(false);
      }).catch(err => {
        setFetchingEvents(false);
      });
      fetch(`${API_URL}/events/past/${profile.registrationId}`).then(r => r.json()).then(data => {
        setPastEvents(Array.isArray(data) ? data : []);
      }).catch(err => console.error(err));
    }
  }, [activeTicket, profile]);

  const fetchToken = async (id) => {
    try {
      const res = await fetch(`${API_URL}/attendee/${id}/token`);
      const data = await res.json();
      if(res.ok) { setToken(data.token); setTimeLeft(15); setIsCheckedIn(data.checkedIn); }
    } catch (err) {}
  };

  useEffect(() => {
    if (!activeTicket) return;
    fetchToken(activeTicket);
    const interval = setInterval(() => fetchToken(activeTicket), 15000); // JWT rotation sync
    return () => clearInterval(interval);
  }, [activeTicket]);

  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => setTimeLeft(p => p - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  const [profileError, setProfileError] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);

  const saveProfile = async (e) => {
    e.preventDefault();
    setProfileLoading(true); setProfileError('');
    try {
      const res = await fetch(`${API_URL}/verify-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, registrationId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      const p = { name, registrationId };
      setProfile(p);
      localStorage.setItem('my-profile', JSON.stringify(p));
    } catch(err) {
      setProfileError(err.message || "Network Error");
    }
    setProfileLoading(false);
  };

  const register = async (ev) => {
    if (!profile) return;
    setLoading(true); setErrorMsg('');
    try {
      const res = await fetch(`${API_URL}/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId: ev.id, name: profile.name, registrationId: profile.registrationId }) });
      const data = await res.json();
      if(res.ok) {
        const newTickets = { ...tickets, [ev.id]: data.id };
        setTickets(newTickets);
        localStorage.setItem(`my-tickets-${profile.registrationId}`, JSON.stringify(newTickets));
        setActiveTicket(data.id);
        setViewingEvent(null);
      } else {
        setErrorMsg(data.error || 'REGISTRATION FAILED');
      }
    } catch(err) { setErrorMsg("NETWORK ERROR"); }
    setLoading(false);
  }

  if (!profile) {
    return <main className="min-h-screen bg-[#5cc7f2] px-4 py-8 font-pixel relative overflow-hidden">
      <PixelGame />
      <div className="mx-auto max-w-xl relative z-10 pt-24">
        <button onClick={onBack} className="absolute top-4 left-4 sm:top-6 sm:left-6 z-50 text-[10px] text-white font-bold bg-black/40 px-3 py-2 border-2 border-black shadow-[2px_2px_0_0_#000] hover:bg-black/60 transition-colors hover:-translate-y-0.5">← EXIT LEVEL</button>
        <header className="mb-8 text-center text-white drop-shadow-[3px_3px_0_#b6302f]">
          <h1 className="text-xl leading-9 sm:text-3xl">ENTER PLAYER DETAILS</h1>
        </header>
        <form onSubmit={saveProfile} className={`${panel} text-black min-h-[350px] flex flex-col justify-center`}>
          {profileError && <div className="bg-[#e7513b] text-white p-3 text-[10px] text-center border-2 border-black mb-4">{profileError}</div>}
          <label className="block text-[10px] leading-6 text-black mb-3">PLAYER NAME
            <input required type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. MARIO" className="mt-2 w-full border-4 border-black bg-[#f5f0df] p-3 text-xs outline-none uppercase" />
          </label>
          <label className="block text-[10px] leading-6 text-black mb-3">REGISTRATION ID
            <input required type="text" value={registrationId} onChange={(e) => setRegistrationId(e.target.value)} placeholder="e.g. STU-12345" className="mt-2 w-full border-4 border-black bg-[#f5f0df] p-3 text-xs outline-none uppercase" />
          </label>
          <button disabled={profileLoading} className={`${pixelButton} mt-5 w-full ${profileLoading ? 'bg-slate-400' : 'bg-[#5cc7f2]'}`}>
            {profileLoading ? 'VERIFYING...' : 'CONTINUE'}
          </button>
        </form>
      </div>
    </main>
  }

  if (!activeTicket) {
    return <main className="min-h-screen bg-[#5cc7f2] px-4 py-8 font-pixel relative overflow-hidden">
      <PixelGame />
      <div className="mx-auto max-w-xl relative z-10 pt-24">
        
        {/* STUDENT PROFILE HEADER */}
        {!viewingEvent && (
          <div className="mb-6 flex items-center justify-between bg-white border-4 border-black p-3 shadow-[4px_4px_0_0_#000]">
            <div>
              <p className="text-[9px] text-slate-500 font-bold">LOGGED IN AS</p>
              <p className="text-xs text-black font-bold uppercase">{profile.name} <span className="text-slate-400">({profile.registrationId})</span></p>
            </div>
            <button onClick={() => { setProfile(null); localStorage.removeItem('my-profile'); setActiveTicket(null); }} className="text-[9px] bg-[#e7513b] text-white px-2 py-1 border-2 border-black hover:bg-red-500 active:translate-y-1">LOGOUT</button>
          </div>
        )}

        {viewingEvent && (
          <button onClick={() => setViewingEvent(null)} className="mb-8 text-[9px] text-white underline">
            ← BACK TO QUESTS
          </button>
        )}
        
        <header className="mb-8 text-center text-white drop-shadow-[3px_3px_0_#b6302f]">
          <h1 className="text-xl leading-9 sm:text-3xl">{viewingEvent ? 'QUEST DETAILS' : 'SELECT QUEST'}</h1>
        </header>
        {fetchingEvents ? (
           <p className="text-center text-white text-xs animate-pulse">LOADING EVENTS...</p>
        ) : availableEvents.length === 0 ? (
           <div className="border-4 border-black bg-[#e7513b] p-8 text-center shadow-[6px_6px_0_0_#000]">
             <p className="text-2xl text-white">NO EVENTS FOR NOW</p>
           </div>
        ) : viewingEvent ? (
           <div className="border-4 border-black bg-white p-5 shadow-[6px_6px_0_0_#000]">
             <div className="flex flex-col md:flex-row gap-6 mb-6">
               {viewingEvent.image_url && (
                 <div className="w-full md:w-1/2 shrink-0">
                   <img src={viewingEvent.image_url} className="w-full h-full object-cover border-4 border-black" alt="Banner" />
                 </div>
               )}
               <div className="flex-1 flex flex-col">
                 <div className="flex justify-between items-start mb-4 gap-2">
                   <h2 className="text-lg font-bold text-black break-words leading-6">{viewingEvent.name.toUpperCase()}</h2>
                   <span className={`text-[10px] px-2 py-1 font-bold shrink-0 ${viewingEvent.entry_fee === 'Free' ? 'bg-[#54a946] text-white' : 'bg-[#f7c948] text-black'} border-2 border-black`}>{viewingEvent.entry_fee ? viewingEvent.entry_fee.toUpperCase() : 'FREE'}</span>
                 </div>
                 <div className="text-[10px] text-slate-700 space-y-3 font-semibold flex-1">
                   <p>📅 {viewingEvent.date} {viewingEvent.end_date ? `TO ${viewingEvent.end_date}` : ''}</p>
                   {viewingEvent.duration_hours && <p>⏱ {viewingEvent.duration_hours} HOURS</p>}
                   {viewingEvent.od_timings && <p>📋 OD: {viewingEvent.od_timings}</p>}
                   {viewingEvent.details && (
                     <div className="mt-4 text-xs font-sans text-slate-800 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto pr-2">
                       {viewingEvent.details}
                     </div>
                   )}
                 </div>
               </div>
             </div>
             <div className="flex gap-4">
               <button disabled={loading} onClick={() => setViewingEvent(null)} className={`${pixelButton} flex-1 bg-slate-200 hover:bg-slate-300 text-black`}>CANCEL</button>
               <button disabled={loading || viewingEvent.spotsLeft <= 0} onClick={() => register(viewingEvent)} className={`${pixelButton} flex-1 ${viewingEvent.spotsLeft <= 0 ? 'bg-slate-400 cursor-not-allowed text-slate-200' : 'bg-[#54a946] text-white hover:bg-[#438a37]'}`}>
                 {loading ? 'WAIT...' : viewingEvent.spotsLeft <= 0 ? 'REGISTRATION FULL' : 'ACCEPT QUEST'}
               </button>
             </div>
           </div>
        ) : (
           <div className="flex flex-col gap-4">
             {errorMsg && <div className="bg-[#e7513b] text-white p-3 text-[10px] text-center border-2 border-black">{errorMsg}</div>}
             {availableEvents.map(ev => (
               <button disabled={loading} key={ev.id} onClick={() => tickets[ev.id] ? setActiveTicket(tickets[ev.id]) : setViewingEvent(ev)} className="w-full border-4 border-black bg-white text-left shadow-[6px_6px_0_0_#000] hover:bg-slate-50 transition active:translate-y-1 active:shadow-none overflow-hidden flex flex-col p-4">
                 <div className="flex justify-between items-start mb-3 gap-2">
                   <p className="text-sm font-bold text-black break-words leading-5">{ev.name.toUpperCase()}</p>
                   <span className={`text-[10px] px-2 py-1 font-bold shrink-0 ${ev.entry_fee === 'Free' ? 'bg-[#54a946] text-white' : 'bg-[#f7c948] text-black'} border-2 border-black`}>{ev.entry_fee ? ev.entry_fee.toUpperCase() : 'FREE'}</span>
                 </div>
                 <div className="text-[10px] text-slate-700 space-y-2 mb-5 font-semibold">
                   <p>📅 {ev.date} {ev.end_date ? `TO ${ev.end_date}` : ''}</p>
                 </div>
                 <div className="flex justify-between items-center text-[10px] border-t-2 border-dashed border-slate-300 pt-3">
                   <span className="text-blue-600 font-bold underline">{tickets[ev.id] ? 'VIEW TICKET' : 'VIEW DETAILS'}</span>
                   <span className={ev.spotsLeft <= 0 ? 'text-[#e7513b] font-bold' : 'text-[#54a946] font-bold'}>SPOTS LEFT: {ev.spotsLeft}</span>
                 </div>
               </button>
             ))}
             
             {pastEvents.length > 0 && (
               <div className="mt-8">
                 <h2 className="text-center text-white drop-shadow-[2px_2px_0_#b6302f] font-bold text-lg mb-4">PAST EVENTS (REPORT)</h2>
                 <div className="flex flex-col gap-4">
                   {pastEvents.map(ev => (
                     <div key={ev.id} className="w-full border-4 border-black bg-slate-200 opacity-90 text-left overflow-hidden flex flex-col p-4 shadow-[inset_2px_2px_0_0_#000]">
                       <div className="flex justify-between items-start mb-2 gap-2">
                         <p className="text-xs font-bold text-slate-800 break-words">{ev.name.toUpperCase()}</p>
                         <span className="text-[9px] px-2 py-1 font-bold shrink-0 bg-slate-700 text-white border-2 border-slate-900">TERMINATED</span>
                       </div>
                       <p className="text-[9px] text-slate-600 font-semibold mb-3">📅 {ev.date}</p>
                       <div className="text-[10px] font-bold border-t-2 border-dashed border-slate-400 pt-2">
                         {ev.scanned_at ? (
                           <span className="text-[#3d8137]">✓ ATTENDED</span>
                         ) : (
                           <span className="text-[#b6302f]">✗ MISSED</span>
                         )}
                       </div>
                     </div>
                   ))}
                 </div>
               </div>
             )}
           </div>
        )}
      </div>
    </main>
  }

  const activeEventId = Object.keys(tickets).find(key => tickets[key] === activeTicket);
  const activeEvent = availableEvents.find(ev => ev.id.toString() === activeEventId?.toString());

  return <main className="min-h-screen bg-[#5cc7f2] px-4 py-8 font-pixel relative overflow-hidden">
    <PixelGame />
    <div className="mx-auto max-w-xl relative z-10">
      <button onClick={() => setActiveTicket(null)} className="mb-8 text-[9px] text-white underline">← BACK TO QUESTS</button>
      <header className="mb-8 text-center text-white drop-shadow-[3px_3px_0_#b6302f]">
        <h1 className="text-xl leading-9 sm:text-3xl">MY POWER-UP</h1>
        <p className="mt-4 text-[9px] leading-5">TICKET ASSIGNED</p>
      </header>
      
      <div className="flex flex-col md:flex-row gap-5">
        <div className={`${panel} text-black flex-1 h-fit`}>
          <div className="border-4 border-black bg-white p-5 text-left shadow-[6px_6px_0_0_#000]">
            <p className="text-xs font-bold text-slate-400 mb-4 border-b-2 border-dashed border-slate-300 pb-2">PLAYER PROFILE</p>
            <div className="space-y-4 font-semibold">
              <div>
                <p className="text-[9px] text-slate-500 mb-1">NAME</p>
                <p className="text-sm text-black uppercase break-words">{profile.name}</p>
              </div>
              <div>
                <p className="text-[9px] text-slate-500 mb-1">REGISTRATION ID</p>
                <p className="text-sm text-black uppercase break-words">{profile.registrationId}</p>
              </div>
              {activeEvent && (
                <div className="mt-4 pt-4 border-t-2 border-dashed border-slate-300">
                  <p className="text-[9px] text-slate-500 mb-1">QUEST (EVENT)</p>
                  <p className="text-sm text-black uppercase break-words">{activeEvent.name}</p>
                  <p className="text-[10px] text-slate-700 mt-2">📅 {activeEvent.date}</p>
                  <span className={`inline-block mt-3 text-[10px] px-2 py-1 font-bold ${activeEvent.entry_fee === 'Free' ? 'bg-[#54a946] text-white' : 'bg-[#f7c948] text-black'} border-2 border-black`}>{activeEvent.entry_fee ? activeEvent.entry_fee.toUpperCase() : 'FREE'}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={`${panel} text-black flex-1 h-fit`}>
          <div className="border-4 border-black bg-[#f7c948] p-5 text-center shadow-[6px_6px_0_0_#000]">
            <p className="text-xs leading-7 font-bold">INVENTORY SLOT</p>
            {isCheckedIn ? (
              <div className="mx-auto my-5 flex flex-col items-center justify-center border-4 border-black bg-[#54a946] w-48 h-48 shadow-[inset_4px_4px_0_0_#3f8234] text-white p-2">
                <div className="animate-bounce">
                  <span className="text-5xl block mb-2 drop-shadow-[2px_2px_0_#206616]">🎉</span>
                </div>
                <p className="text-center text-[10px] leading-4 font-bold drop-shadow-[1px_1px_0_#206616] px-2 break-words">YEAH YOU ENTERED!</p>
                <p className="text-center text-[8px] leading-3 mt-2 drop-shadow-[1px_1px_0_#206616] opacity-90">ENJOY THE EVENT</p>
              </div>
            ) : (
              <div className="mx-auto my-5 flex items-center justify-center border-4 border-black bg-[#f5f0df] w-48 h-48 shadow-[inset_4px_4px_0_0_#c7b98d]">
                {token ? (
                  <div className="bg-white p-2 border-2 border-dashed border-black">
                     <QRCodeSVG value={token} size={140} level="M" />
                  </div>
                ) : (
                  <div className="w-[140px] h-[140px] animate-pulse bg-[#c7b98d]" />
                )}
              </div>
            )}
            
            {isCheckedIn ? (
               <p className="text-[12px] leading-6 text-[#248a3d] animate-pulse font-bold">✨ ACCESS GRANTED! ✨</p>
            ) : (
               <p className="text-[10px] leading-6 text-slate-700">STATUS: WAITING AT GATES...</p>
            )}
            {!isCheckedIn && <p className="mt-3 text-[8px] leading-5 text-black font-bold">REFRESHES IN: 00:{timeLeft.toString().padStart(2, '0')}</p>}
          </div>
        </div>
      </div>
    </div>
  </main> 
}

function Page({ title, subtitle, onBack, children }) { return <main className="min-h-screen bg-[#5cc7f2] px-4 py-8 font-pixel"><div className="mx-auto max-w-5xl"><button onClick={onBack} className="absolute top-4 left-4 sm:top-6 sm:left-6 z-50 text-[10px] text-white font-bold bg-black/40 px-3 py-2 border-2 border-black shadow-[2px_2px_0_0_#000] hover:bg-black/60 transition-colors hover:-translate-y-0.5">← EXIT LEVEL</button><header className="mb-8 text-center text-white drop-shadow-[3px_3px_0_#b6302f] mt-12"><h1 className="text-xl leading-9 sm:text-3xl">{title}</h1><p className="mt-4 text-[9px] leading-5">{subtitle.toUpperCase()}</p></header>{children}</div></main> }

function OrganizerPage({ title, subtitle, onBack, onLogout, children }) { 
  return (
    <main className="min-h-screen bg-gray-100 px-4 py-8 font-pixel text-gray-900">
      <div className="mx-auto max-w-5xl">
        <div className="flex justify-between items-center mb-8">
          <button onClick={onBack} className="text-[10px] text-gray-500 hover:text-gray-800 underline transition-colors">← EXIT DASHBOARD</button>
          {onLogout && <button onClick={onLogout} className="text-[10px] text-red-500 hover:text-red-700 underline transition-colors">LOGOUT</button>}
        </div>
        <header className="mb-10 border-b-2 border-gray-300 pb-5">
          <h1 className="text-2xl sm:text-3xl font-medium text-gray-900">{title}</h1>
          <p className="mt-2 text-[10px] text-teal-600 font-semibold tracking-widest">{subtitle.toUpperCase()}</p>
        </header>
        {children}
      </div>
    </main>
  );
}

export default App
