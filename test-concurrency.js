// Native fetch available in Node.js v18+

const API_URL = 'http://localhost:3002/api';

async function runTests() {
  console.log("==========================================");
  console.log("🚀 STARTING CONCURRENCY TESTS (100 REQUESTS)");
  console.log("==========================================\n");

  // 1. Organizer Login to get token
  const loginRes = await fetch(`${API_URL}/organizer/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clubName: 'admin', password: 'admin' })
  });
  const { token: orgToken } = await loginRes.json();

  // 2. Create an event with CAPACITY = 1
  const eventRes = await fetch(`${API_URL}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${orgToken}` },
    body: JSON.stringify({ name: 'Concurrency Test Event', date: '2026-08-20', capacity: 1 })
  });
  const event = await eventRes.json();
  const eventId = event.id;

  console.log(`✅ Created Test Event ID ${eventId} with CAPACITY = 1\n`);

  // ---------------------------------------------------------
  // TEST 1: CONCURRENT REGISTRATION (100 students trying to grab 1 spot)
  // ---------------------------------------------------------
  console.log("🔥 TEST 1: Firing 100 concurrent REGISTRATION requests...");
  
  const regRequests = [];
  for (let i = 0; i < 100; i++) {
    regRequests.push(
      fetch(`${API_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, name: `Student ${i}`, registrationId: `REG_${i}` })
      }).then(async r => ({ status: r.status, data: await r.json() }))
    );
  }

  // Fire them all at once using Promise.all
  const regResults = await Promise.all(regRequests);
  
  const regSuccesses = regResults.filter(r => r.status === 200);
  const regFailures = regResults.filter(r => r.status === 400 && r.data.error === 'Event is full!');

  console.log(`   -> 🟢 SUCCESSES: ${regSuccesses.length}`);
  console.log(`   -> 🔴 REJECTED (Capacity Full): ${regFailures.length}`);
  
  if (regSuccesses.length === 1 && regFailures.length === 99) {
    console.log("   -> ✅ REGISTRATION TEST PASSED: Exactly 1 success, 99 cleanly rejected. Capacity NEVER exceeded.\n");
  } else {
    console.log("   -> ❌ REGISTRATION TEST FAILED\n");
  }

  const successfulAttendeeId = regSuccesses[0].data.id;

  // ---------------------------------------------------------
  // TEST 2: CONCURRENT CHECK-INS (100 scanners scanning the same QR at exact same time)
  // ---------------------------------------------------------
  console.log("🔥 TEST 2: Firing 100 concurrent CHECK-IN requests (Scanning the same ticket)...");
  
  // Get the token for the successful attendee
  const tokenRes = await fetch(`${API_URL}/attendee/${successfulAttendeeId}/token`);
  const { token: qrToken } = await tokenRes.json();

  const checkinRequests = [];
  for (let i = 0; i < 100; i++) {
    checkinRequests.push(
      fetch(`${API_URL}/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${orgToken}` },
        body: JSON.stringify({ token: qrToken, scannedAt: new Date().toISOString(), deviceId: `DEVICE_${i}` })
      }).then(async r => ({ status: r.status, data: await r.json() }))
    );
  }

  const checkinResults = await Promise.all(checkinRequests);

  const checkinSuccesses = checkinResults.filter(r => r.status === 200);
  const checkinFailures = checkinResults.filter(r => r.status === 400 && r.data.error.includes('Already checked in'));

  console.log(`   -> 🟢 SUCCESSES: ${checkinSuccesses.length}`);
  console.log(`   -> 🔴 REJECTED (Already checked in): ${checkinFailures.length}`);

  if (checkinSuccesses.length === 1 && checkinFailures.length === 99) {
    console.log("   -> ✅ CHECK-IN TEST PASSED: Exactly 1 success, 99 cleanly rejected. Duplicate scans completely prevented.\n");
  } else {
    console.log("   -> ❌ CHECK-IN TEST FAILED\n");
  }
}

runTests().catch(console.error);
