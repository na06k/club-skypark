let checkinState = {
  rooms: [],
  reservations: [],
  guests: [],
  documents: [],
  selectedRoomId: ''
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

function dateFromValue(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function inputDateValue(value = new Date()) {
  const date = dateFromValue(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateOnly(value) {
  if (!value) return '-';
  const date = dateFromValue(value);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = dateFromValue(value);
  const time = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  return `${formatDateOnly(date)} ${time}`;
}

function todayInputValue() {
  return inputDateValue(new Date());
}

function timeInputValue() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function getNextCheckinNo(guests) {
  const max = guests.reduce((highest, guest) => Math.max(highest, Number(guest.check_in_no || guest.id || 0)), 433);
  return String(max + 1);
}

function roomTypeOptions(rooms) {
  return [...new Set(rooms.map((room) => room.room_type).filter(Boolean))]
    .sort()
    .map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`)
    .join('');
}

function availableCheckinRooms() {
  return checkinState.rooms.filter((room) => room.status === 'vacant' || room.status === 'reserved');
}

async function loadCheckin() {
  const main = document.getElementById('main-content');
  const [{ rooms }, { reservations }, { guests }] = await Promise.all([
    api.get('/rooms'),
    api.get('/reservations'),
    api.get('/guests')
  ]);

  checkinState = {
    rooms,
    reservations,
    guests,
    documents: [],
    selectedRoomId: ''
  };
  const canUploadDocuments = window.pmsCan?.('documents.upload');
  const canCreateCheckin = window.pmsCan?.('checkin.create');

  main.innerHTML = `
    <section class="checkin-page">
      <div class="module-topbar">
        <button class="dash-menu" onclick="toggleSidebar()">Menu</button>
        <button class="dash-link" onclick="loadModule('dashboard')">Home</button>
        <button class="dash-link" onclick="logout()">Log-out <span>&gt;</span></button>
      </div>

      <div class="module-title-row">
        <h1>CHECK IN</h1>
        <div class="breadcrumb"><span>Home</span> / Room</div>
      </div>

      <div class="checkin-panel">
        <div class="checkin-panel-title">Check-in</div>
        <div class="checkin-panel-body">
          <div class="checkin-two-col">
            <div class="checkin-left">
              <div class="checkin-form-grid top-grid">
                <label class="field bill-field span-2">Bill Type
                  <span class="radio-line"><input type="radio" name="ciBillType" value="gst" checked> GST</span>
                  <span class="radio-line"><input type="radio" name="ciBillType" value="without_gst"> WITHOUT GST</span>
                </label>
                <label class="field">Check in Date<input id="ciDate" type="date" value="${todayInputValue()}"></label>
                <label class="field">Check in Time<input id="ciTime" type="time" value="${timeInputValue()}"></label>
                <label class="field">Check in No.<input id="ciNo" type="text" value="${getNextCheckinNo(guests)}"></label>
                <label class="field">Booking No.<select id="ciBooking" onchange="fillCheckinFromBooking()"><option value="">Select</option>${reservations.map((booking) => `<option value="${booking.id}">${booking.id} - ${escapeHtml(booking.guest_name)} - ${escapeHtml(booking.room_number || booking.room_name || '')}</option>`).join('')}</select></label>
                <label class="field">Days<input id="ciDays" type="number" min="1" value="1"></label>
                <label class="field">Adults<input id="ciAdults" type="number" min="0" value="1"></label>
                <label class="field">Children<input id="ciChildren" type="number" min="0" value="0"></label>
              </div>

              <div class="guest-line">
                <label class="field grow">Name of Visitor<input id="ciName" type="text"></label>
                <button class="green-action" onclick="checkGuestReservation()">Check Guest</button>
                <button class="red-action" onclick="clearCheckinForm()">Clear</button>
              </div>

              <div class="checkin-form-grid">
                <label class="field">Contact No. 1<input id="ciPhone1" type="text"></label>
                <label class="field">Contact No. 2<input id="ciPhone2" type="text"></label>
                <label class="field">Email<input id="ciEmail" type="email"></label>
                <label class="field">Date Of Birth<input id="ciDob" type="date"></label>
                <label class="field gender-field">Gender
                  <span class="radio-line"><input type="radio" name="ciGender" value="male" checked> Male</span>
                  <span class="radio-line"><input type="radio" name="ciGender" value="female"> Female</span>
                </label>
              </div>

              <div class="section-strip">Organization Details</div>
              <div class="checkin-form-grid">
                <label class="field">GST NO.<input id="ciGstNo" type="text"></label>
                <label class="field">Company<input id="ciCompany" type="text"></label>
                <label class="field small-field">Department<input id="ciDepartment" type="text"></label>
                <label class="field small-field">Designation<input id="ciDesignation" type="text"></label>
                <label class="field">Website<input id="ciWebsite" type="text"></label>
              </div>

              <div class="section-strip">Correspondence</div>
              <div class="checkin-form-grid">
                <label class="field">Address<input id="ciAddress" type="text"></label>
                <label class="field small-field">Town/City<input id="ciTownCity" type="text"></label>
                <label class="field small-field">Zip/Postal Code<input id="ciPostal" type="text"></label>
                <label class="field small-field">State / Province<input id="ciState" type="text"></label>
                <label class="field small-field">Country<input id="ciCountry" type="text"></label>
                <label class="field small-field">Nationality<input id="ciNationality" type="text"></label>
                <label class="field small-field">Purpose of Visit<input id="ciPurpose" type="text"></label>
                <label class="field small-field">Coming From<input id="ciComingFrom" type="text"></label>
                <label class="field small-field">Going To<input id="ciGoingTo" type="text"></label>
                <label class="field">Vehicle No.<input id="ciVehicle" type="text"></label>
              </div>
            </div>

            <div class="checkin-right">
              <div class="section-strip room-title">Room Details</div>
              <label class="field full-width">Select Room Type<select id="ciRoomType" onchange="renderCheckinRoomRows()"><option value="">Select Room Type</option>${roomTypeOptions(availableCheckinRooms())}</select></label>
              <div class="rooms-scroll">
                <table class="room-select-table">
                  <thead><tr><th></th><th>Room No.</th><th>Type</th><th>Rate</th><th>D.%</th><th>Disc.</th><th>Plan</th></tr></thead>
                  <tbody id="ciRoomRows"></tbody>
                </table>
              </div>

              <div class="section-strip doc-title">Documents</div>
              <div class="doc-box">
                ${canUploadDocuments ? `
                  <label class="field">Document Name<select id="ciDocType"><option>Aadhaar</option><option>PAN</option><option>Passport</option><option>Driving License</option><option>Voter ID</option><option>Other ID</option></select></label>
                  <label class="field">id Card<input id="ciDocFile" type="file"></label>
                  <button class="dark-action" onclick="addCheckinDocument()">Add +</button>
                ` : '<p>Document upload is not assigned to this staff account.</p>'}
                <div id="ciDocList" class="doc-list"></div>
              </div>

              <div class="payment-line">
                <label class="field">Advance Amount<input id="ciAdvance" type="number" min="0" value="0"></label>
                <label class="payment-mode">Payment Mode
                  <span class="radio-line"><input type="radio" name="ciPaymentMode" value="cash" checked> Cash</span>
                  <span class="radio-line"><input type="radio" name="ciPaymentMode" value="online"> Online</span>
                  <span class="radio-line"><input type="radio" name="ciPaymentMode" value="card"> Card Payment</span>
                </label>
              </div>
            </div>
          </div>

          <div class="save-line">
            <label class="field remark-field">Remark<input id="ciRemark" type="text"></label>
            ${canCreateCheckin ? '<button class="save-checkin" onclick="checkinGuest()">SAVE</button>' : ''}
          </div>
        </div>
      </div>
      <footer class="dashboard-footer"><span>Copyright. All rights reserved.</span><strong>Version 1.0</strong></footer>
    </section>
  `;

  renderCheckinRoomRows();
}

function renderCheckinRoomRows() {
  const target = document.getElementById('ciRoomRows');
  if (!target) return;
  const selectedType = document.getElementById('ciRoomType')?.value || '';
  const rooms = availableCheckinRooms().filter((room) => !selectedType || room.room_type === selectedType);

  target.innerHTML = rooms.length ? rooms.map((room) => `
    <tr>
      <td><input type="radio" name="ciRoom" value="${room.id}" ${String(checkinState.selectedRoomId) === String(room.id) ? 'checked' : ''} onchange="selectCheckinRoom('${room.id}')"></td>
      <td>${escapeHtml(room.room_number)}</td>
      <td>${escapeHtml(room.room_type)}</td>
      <td>${Number(room.price || 0).toFixed(2)}</td>
      <td><input class="mini-input" id="ciDiscPct-${room.id}" type="number" min="0" value="0"></td>
      <td><input class="mini-input" id="ciDiscAmt-${room.id}" type="number" min="0" value="0"></td>
      <td><select class="mini-select" id="ciPlan-${room.id}"><option>CP</option><option>EP</option><option>MAP</option><option>AP</option></select></td>
    </tr>
  `).join('') : '<tr><td colspan="7">No rooms available for selected type.</td></tr>';
}

function selectCheckinRoom(roomId) {
  checkinState.selectedRoomId = String(roomId);
}

function selectedBooking() {
  const id = document.getElementById('ciBooking')?.value;
  return checkinState.reservations.find((booking) => String(booking.id) === String(id));
}

function fillCheckinFromBooking() {
  const booking = selectedBooking();
  if (!booking) return;
  document.getElementById('ciName').value = booking.guest_name || '';
  document.getElementById('ciEmail').value = booking.guest_email || '';
  document.getElementById('ciPhone1').value = booking.guest_phone || '';
  document.getElementById('ciAdults').value = booking.guests || 1;
  document.getElementById('ciDate').value = todayInputValue();
  if (booking.check_in && booking.check_out) {
    const nights = Math.max(1, Math.round((new Date(booking.check_out) - new Date(booking.check_in)) / 86400000));
    document.getElementById('ciDays').value = nights;
  }
  if (booking.room_id) {
    const room = checkinState.rooms.find((item) => String(item.id) === String(booking.room_id));
    if (room) {
      document.getElementById('ciRoomType').value = room.room_type;
      checkinState.selectedRoomId = String(room.id);
      renderCheckinRoomRows();
    }
  }
}

function checkGuestReservation() {
  const name = document.getElementById('ciName').value.trim().toLowerCase();
  const phone = document.getElementById('ciPhone1').value.trim();
  const match = checkinState.reservations.find((booking) => {
    const sameName = name && String(booking.guest_name || '').toLowerCase().includes(name);
    const samePhone = phone && String(booking.guest_phone || '').includes(phone);
    return sameName || samePhone;
  });

  if (!match) {
    alert('No matching reservation found. You can continue as a walk-in guest.');
    return;
  }

  document.getElementById('ciBooking').value = match.id;
  fillCheckinFromBooking();
}

function clearCheckinForm() {
  loadCheckin();
}

function fileToDocument(file, documentType) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      document_type: documentType,
      file_name: file.name,
      mime_type: file.type || 'application/octet-stream',
      data_url: reader.result
    });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function addCheckinDocument() {
  if (!window.pmsCan?.('documents.upload')) {
    alert('You do not have permission to upload guest documents.');
    return;
  }
  const input = document.getElementById('ciDocFile');
  const file = input.files?.[0];
  if (!file) {
    alert('Please choose a document file first.');
    return;
  }
  const doc = await fileToDocument(file, document.getElementById('ciDocType').value);
  checkinState.documents.push(doc);
  input.value = '';
  renderCheckinDocuments();
}

function removeCheckinDocument(index) {
  checkinState.documents.splice(index, 1);
  renderCheckinDocuments();
}

function renderCheckinDocuments() {
  const list = document.getElementById('ciDocList');
  if (!list) return;
  list.innerHTML = checkinState.documents.length
    ? checkinState.documents.map((doc, index) => `<div><span>${escapeHtml(doc.document_type)} - ${escapeHtml(doc.file_name)}</span><button onclick="removeCheckinDocument(${index})">Remove</button></div>`).join('')
    : '';
}

function getRadioValue(name) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value || '';
}

async function checkinGuest() {
  if (!window.pmsCan?.('checkin.create')) {
    alert('You do not have permission to create check-ins.');
    return;
  }
  const roomId = checkinState.selectedRoomId || document.querySelector('input[name="ciRoom"]:checked')?.value;
  if (!roomId) {
    alert('Please select a room.');
    return;
  }

  const checkInAt = `${document.getElementById('ciDate').value}T${document.getElementById('ciTime').value || '00:00'}`;
  const { guest } = await api.post('/checkins', {
    bill_type: getRadioValue('ciBillType'),
    check_in_no: document.getElementById('ciNo').value,
    check_in_at: checkInAt,
    booking_id: document.getElementById('ciBooking').value || null,
    days: document.getElementById('ciDays').value,
    adults: document.getElementById('ciAdults').value,
    children: document.getElementById('ciChildren').value,
    name: document.getElementById('ciName').value,
    phone: document.getElementById('ciPhone1').value,
    contact_2: document.getElementById('ciPhone2').value,
    email: document.getElementById('ciEmail').value,
    dob: document.getElementById('ciDob').value,
    gender: getRadioValue('ciGender'),
    room_id: roomId,
    room_plan: document.getElementById(`ciPlan-${roomId}`)?.value || 'CP',
    discount_percent: document.getElementById(`ciDiscPct-${roomId}`)?.value || 0,
    discount_amount: document.getElementById(`ciDiscAmt-${roomId}`)?.value || 0,
    gst_no: document.getElementById('ciGstNo').value,
    company: document.getElementById('ciCompany').value,
    department: document.getElementById('ciDepartment').value,
    designation: document.getElementById('ciDesignation').value,
    website: document.getElementById('ciWebsite').value,
    address: document.getElementById('ciAddress').value,
    town_city: document.getElementById('ciTownCity').value,
    postal_code: document.getElementById('ciPostal').value,
    state: document.getElementById('ciState').value,
    country: document.getElementById('ciCountry').value,
    nationality: document.getElementById('ciNationality').value,
    purpose: document.getElementById('ciPurpose').value,
    coming_from: document.getElementById('ciComingFrom').value,
    going_to: document.getElementById('ciGoingTo').value,
    vehicle_no: document.getElementById('ciVehicle').value,
    remark: document.getElementById('ciRemark').value,
    advance_amount: document.getElementById('ciAdvance').value,
    payment_mode: getRadioValue('ciPaymentMode'),
    documents: checkinState.documents
  });

  showGuestRegistrationCard(guest);
}

function renderGuestRows(guests, options = {}) {
  return guests.length ? guests.map((guest) => `
    <tr>
      <td>${escapeHtml(guest.check_in_no || guest.id)}</td>
      <td>${escapeHtml(guest.name)}</td>
      <td>${escapeHtml(guest.phone || '')}</td>
      <td>${escapeHtml(guest.room_number || '-')} (${escapeHtml(guest.room_type || '-')})</td>
      <td>${formatDateTime(guest.check_in_date)}</td>
      <td>${escapeHtml(guest.adults || 0)} / ${escapeHtml(guest.children || 0)}</td>
      <td>${escapeHtml(guest.payment_mode || '-')}</td>
      <td>Rs ${Number(guest.advance_amount || 0).toFixed(2)}</td>
      <td>${escapeHtml(guest.status || (guest.check_out_date ? 'checked_out' : 'active'))}</td>
      ${options.actions ? `<td>${options.actions(guest)}</td>` : ''}
    </tr>
  `).join('') : `<tr><td colspan="${options.actions ? 10 : 9}">No records found.</td></tr>`;
}

function checkinListShell(title, body) {
  const main = document.getElementById('main-content');
  main.innerHTML = `
    <section class="checkin-page">
      <div class="module-topbar">
        <button class="dash-menu" onclick="toggleSidebar()">Menu</button>
        <button class="dash-link" onclick="loadModule('dashboard')">Home</button>
        <button class="dash-link" onclick="logout()">Log-out <span>&gt;</span></button>
      </div>
      <div class="module-title-row"><h1>${title}</h1><div class="breadcrumb"><span>Home</span> / Check In</div></div>
      <div class="checkin-panel"><div class="checkin-panel-title">${title}</div><div class="checkin-panel-body">${body}</div></div>
    </section>
  `;
}

async function loadCheckinList() {
  const { guests } = await api.get('/guests/active');
  checkinListShell('CHECK IN LIST', `
    <div class="table-actions">${window.pmsCan?.('checkin.create') ? '<button class="green-action" onclick="loadCheckin()">New Check In</button>' : ''}</div>
    <table class="checkin-report-table"><thead><tr><th>Check-in No</th><th>Name</th><th>Mobile</th><th>Room Details</th><th>Check-in Time</th><th>Adults / Children</th><th>Payment</th><th>Advance</th><th>Status</th><th>Action</th></tr></thead><tbody>${renderGuestRows(guests, { actions: (guest) => `
      ${window.pmsCan?.('checkin.print_grc') && guest.grc_required !== false ? `<button class="green-action" onclick="showGuestRegistrationCardById('${guest.id}')">Print GRC</button>` : ''}
      ${window.pmsCan?.('checkin.room_swap') ? `<button class="dark-action" onclick="showRoomSwap('${guest.id}')">Room Swap</button>` : ''}
      ${window.pmsCan?.('checkin.cancel') ? `<button class="red-action" onclick="cancelCheckin('${guest.id}')">Cancel</button>` : ''}
      ${!window.pmsCan?.('checkin.print_grc') && !window.pmsCan?.('checkin.room_swap') && !window.pmsCan?.('checkin.cancel') ? '-' : ''}
    ` })}</tbody></table>
  `);
}

async function cancelCheckin(id) {
  if (!window.pmsCan?.('checkin.cancel')) return;
  if (!confirm('Cancel this check-in and release the room?')) return;
  await api.patch(`/guests/${id}/cancel`, {});
  loadCheckinList();
}

async function showRoomSwap(id) {
  if (!window.pmsCan?.('checkin.room_swap')) {
    alert('You do not have permission to swap rooms.');
    return;
  }
  const [{ guests }, { rooms }] = await Promise.all([api.get('/guests/active'), api.get('/rooms')]);
  const guest = guests.find((item) => String(item.id) === String(id));
  if (!guest) {
    alert('Active guest not found.');
    return;
  }
  const options = rooms
    .filter((room) => String(room.room_type || '').toLowerCase() === String(guest.room_type || '').toLowerCase())
    .filter((room) => ['vacant', 'reserved'].includes(room.status))
    .filter((room) => String(room.id) !== String(guest.room_id))
    .sort((a, b) => String(a.room_number).localeCompare(String(b.room_number), undefined, { numeric: true }));

  checkinListShell('ROOM SWAP', `
    <div class="form-grid">
      <label class="field">Guest<input value="${escapeHtml(guest.name)}" readonly></label>
      <label class="field">Current Room<input value="${escapeHtml(guest.room_number || '-')} (${escapeHtml(guest.room_type || '-')})" readonly></label>
      <label class="field">New Room
        <select id="swapRoomId">
          ${options.length ? options.map((room) => `<option value="${room.id}">${escapeHtml(room.room_number)} - ${escapeHtml(room.room_type)} (${escapeHtml(room.status)})</option>`).join('') : '<option value="">No same-category rooms available</option>'}
        </select>
      </label>
      <label class="field">Remark<input id="swapRemark" placeholder="Reason / note"></label>
    </div>
    <p>Room swap is allowed only within the same room category.</p>
    <button class="green-action" onclick="saveRoomSwap('${guest.id}')" ${options.length ? '' : 'disabled'}>Swap Room</button>
    <button class="dark-action" onclick="loadCheckinList()">Cancel</button>
  `);
}

async function saveRoomSwap(id) {
  if (!window.pmsCan?.('checkin.room_swap')) return;
  const newRoomId = document.getElementById('swapRoomId')?.value;
  if (!newRoomId) {
    alert('Please select an available room.');
    return;
  }
  await api.patch(`/guests/${id}/room-swap`, {
    new_room_id: newRoomId,
    remark: document.getElementById('swapRemark')?.value || ''
  });
  alert('Room swapped successfully. Previous room is marked dirty for housekeeping.');
  loadCheckinList();
}

async function loadCancelCheckinList() {
  const { guests } = await api.get('/guests');
  const cancelled = guests.filter((guest) => guest.status === 'cancelled');
  checkinListShell('CANCEL CHECK IN LIST', `
    <table class="checkin-report-table"><thead><tr><th>Check-in No</th><th>Name</th><th>Mobile</th><th>Room Details</th><th>Check-in Time</th><th>Adults / Children</th><th>Payment</th><th>Advance</th><th>Status</th><th>Action</th></tr></thead><tbody>${renderGuestRows(cancelled, { actions: (guest) => window.pmsCan?.('checkin.print_grc') && guest.grc_required !== false ? `<button class="green-action" onclick="showGuestRegistrationCardById('${guest.id}')">Print GRC</button>` : '-' })}</tbody></table>
  `);
}

async function loadAllCheckinReport() {
  const { guests } = await api.get('/guests');
  checkinListShell('ALL CHECKIN REPORT', `
    <table class="checkin-report-table"><thead><tr><th>Check-in No</th><th>Name</th><th>Mobile</th><th>Room Details</th><th>Check-in Time</th><th>Adults / Children</th><th>Payment</th><th>Advance</th><th>Status</th><th>Action</th></tr></thead><tbody>${renderGuestRows(guests, { actions: (guest) => window.pmsCan?.('checkin.print_grc') && guest.grc_required !== false ? `<button class="green-action" onclick="showGuestRegistrationCardById('${guest.id}')">Print GRC</button>` : '-' })}</tbody></table>
  `);
}
function grcRow(label, value) {
  return `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value || '')}</td></tr>`;
}

function grcMoney(value) {
  return Number(value || 0).toFixed(2);
}

function showGuestRegistrationCard(guest) {
  if (guest.grc_required === false) {
    checkinListShell('CHECK IN COMPLETED', `
      <p>This guest is marked as a bulk wedding/group check-in. ID proof and GRC are not required for this record.</p>
      <button class="green-action" onclick="loadCheckinList()">Back to Check In List</button>
    `);
    return;
  }
  document.body.classList.remove('dashboard-mode');
  const main = document.getElementById('main-content');
  const tariff = Number(guest.room_rate || 0);
  main.innerHTML = `
    <section class="document-screen">
      <div class="print-toolbar">
        ${window.pmsCan?.('checkin.print_grc') ? '<button class="dark-action" onclick="saveCurrentDocumentAsPdf()">Save PDF</button><button class="green-action" onclick="printCurrentDocument()">Print GRC</button>' : ''}
        <button class="dark-action" onclick="loadCheckinList()">Back to Check In List</button>
      </div>
      <div class="print-area grc-card">
        <div class="doc-border">
          <div class="grc-header">
            <div>
              <div>Sr. No. ${escapeHtml(guest.check_in_no || guest.id)}</div>
              <div>Date : ${formatDateOnly(guest.check_in_date)}</div>
            </div>
            <div class="brand-center">
              <div class="brand-mark">CLUB SKYPARK</div>
              <small>HOTEL & RESORT</small>
              <h1>Guest Registration Card</h1>
            </div>
            <div class="doc-contact">
              <strong>CLUB SKYPARK HOTEL & RESORT</strong><br>
              Manasa Road Neemuch (MP) 458441<br>
              info@clubskypark.com<br>
              GSTIN: 23AAOFC4777E1ZC
            </div>
          </div>

          <div class="doc-section-title">GUEST DETAILS</div>
          <table class="doc-info-table">
            ${grcRow('Guest Name', guest.name)}
            ${grcRow('Mobile No.', guest.phone)}
            ${grcRow('Address', guest.address)}
            ${grcRow('GSTIN', guest.gst_no)}
            ${grcRow('Email', guest.email)}
            ${grcRow('Nationality', guest.nationality)}
            ${grcRow('Coming From', guest.coming_from)}
            ${grcRow('Going To', guest.going_to)}
          </table>

          <div class="doc-section-title">BOOKING DETAILS</div>
          <table class="doc-info-table">
            ${grcRow('Room No.', guest.room_number)}
            ${grcRow('Room Tariff', `Rs ${grcMoney(tariff)} (${guest.room_plan || 'CP'})`)}
            ${grcRow('Room Type', guest.room_type)}
            ${grcRow('Check-In', formatDateTime(guest.check_in_date))}
            ${grcRow('Days', guest.days || 1)}
            ${grcRow('Adults / Children', `${guest.adults || 0} / ${guest.children || 0}`)}
          </table>

          <div class="advance-line"><strong>ADVANCE AMOUNT :</strong><span>${grcMoney(guest.advance_amount)}</span></div>

          <div class="grc-footer-grid">
            <div>
              <h3>Terms and Conditions</h3>
              <ul>
                <li>Check-in time is 11:00 AM and checkout time is 10:00 AM.</li>
                <li>Guest is responsible for any damage caused during the stay.</li>
                <li>Hotel is not responsible for valuables left unattended.</li>
                <li>Valid government ID is required for all guests.</li>
              </ul>
            </div>
            <div class="signature-box"><strong>Guest Signature</strong></div>
            <div class="signature-box"><strong>Authorized Signature</strong></div>
          </div>
        </div>
      </div>
    </section>
  `;
}

async function showGuestRegistrationCardById(id) {
  const { guests } = await api.get('/guests');
  const guest = guests.find((item) => String(item.id) === String(id));
  if (!guest) {
    alert('Guest record not found.');
    return;
  }
  showGuestRegistrationCard(guest);
}
