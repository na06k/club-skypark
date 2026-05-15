async function loadCheckin() {
  const main = document.getElementById('main-content');
  try {
    const [{ rooms }, { reservations }] = await Promise.all([api.get('/rooms'), api.get('/reservations')]);
    const available = rooms.filter((room) => room.status === 'vacant' || room.status === 'reserved');
    main.innerHTML = `<h1>Guest Check-In</h1>
      <input id="gName" placeholder="Name"><br>
      <input id="gEmail" placeholder="Email"><br>
      <input id="gPhone" placeholder="Phone"><br>
      <select id="roomSelect">${available.map((r) => `<option value="${r.id}">${r.room_number} - ${r.room_type} (${r.status})</option>`).join('')}</select><br>
      <select id="bookingSelect"><option value="">No linked reservation</option>${reservations.map((r) => `<option value="${r.id}">${r.guest_name} - ${r.check_in} - ${r.room_number || r.room_name || ''}</option>`).join('')}</select><br>
      <label>Guest Documents</label><br>
      <select id="docType"><option value="Aadhaar">Aadhaar</option><option value="PAN">PAN</option><option value="Passport">Passport</option><option value="Driving License">Driving License</option><option value="Other ID">Other ID</option></select><br>
      <input id="guestDocs" type="file" multiple><br>
      <button onclick="checkinGuest()">Check In</button>
    `;
  } catch (error) {
    main.innerHTML = `<p>${error.message}</p>`;
  }
}

function readGuestDocuments() {
  const files = Array.from(document.getElementById('guestDocs').files || []);
  const documentType = document.getElementById('docType').value;
  return Promise.all(files.map((file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ document_type: documentType, file_name: file.name, mime_type: file.type || 'application/octet-stream', data_url: reader.result });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  })));
}

async function checkinGuest() {
  const documents = await readGuestDocuments();
  await api.post('/checkins', {
    name: document.getElementById('gName').value,
    email: document.getElementById('gEmail').value,
    phone: document.getElementById('gPhone').value,
    room_id: document.getElementById('roomSelect').value,
    booking_id: document.getElementById('bookingSelect').value || null,
    documents
  });
  alert('Checked in!');
  loadCheckin();
}
