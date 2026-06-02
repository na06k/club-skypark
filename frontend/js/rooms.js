function roomStatusLabel(status) {
  const labels = {
    vacant: 'Available',
    occupied: 'Occupied',
    reserved: 'Reserved',
    dirty: 'Dirty',
    maintenance: 'Maintenance'
  };
  return labels[status] || status || '-';
}

function roomStatusClass(status) {
  return `status-pill status-${String(status || '').replace(/_/g, '-')}`;
}

function roomMoney(value) {
  return Number(value || 0).toLocaleString('en-IN');
}

function roomEscape(value) {
  return String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

async function loadRooms(filter = 'all') {
  const main = document.getElementById('main-content');
  try {
    const { rooms } = await api.get('/rooms');
    const categories = [...new Set(rooms.map((room) => room.room_type).filter(Boolean))].sort();
    const filteredRooms = filter === 'all' ? rooms : rooms.filter((room) => room.room_type === filter);
    const counts = ['vacant', 'occupied', 'reserved', 'dirty', 'maintenance'].reduce((acc, status) => {
      acc[status] = rooms.filter((room) => room.status === status).length;
      return acc;
    }, {});
    const canCreate = window.pmsCan?.('rooms.create');
    const canEdit = window.pmsCan?.('rooms.edit');
    const canDelete = window.pmsCan?.('rooms.delete');
    const canStatus = window.pmsCan?.('rooms.status_update');

    main.innerHTML = `
      <section class="pms-content">
        <div class="pms-title-row">
          <div>
            <span>Room Management</span>
            <h2>Rooms, availability and housekeeping status</h2>
          </div>
          <div class="pms-top-actions">
            <select id="roomCategoryFilter" onchange="loadRooms(this.value)">
              <option value="all">All categories</option>
              ${categories.map((category) => `<option value="${roomEscape(category)}" ${filter === category ? 'selected' : ''}>${roomEscape(category)}</option>`).join('')}
            </select>
            ${canCreate ? '<button onclick="showAddRoom()">Add Room</button>' : ''}
          </div>
        </div>

        <div class="pms-kpi-grid compact-kpis">
          <article><span>Available</span><strong>${counts.vacant}</strong><small>Ready for sale</small></article>
          <article><span>Occupied</span><strong>${counts.occupied}</strong><small>Guest in house</small></article>
          <article><span>Reserved</span><strong>${counts.reserved}</strong><small>Upcoming booking</small></article>
          <article><span>Dirty</span><strong>${counts.dirty}</strong><small>Needs housekeeping</small></article>
          <article><span>Maintenance</span><strong>${counts.maintenance}</strong><small>Blocked room</small></article>
        </div>

        <div class="pms-panel">
          <div class="pms-panel-head">
            <h3>Room List</h3>
            <span>${filteredRooms.length} rooms</span>
          </div>
          <table class="pms-table">
            <thead><tr><th>Floor</th><th>Room No.</th><th>Category</th><th>Price</th><th>Status</th><th>Quick Update</th><th>Action</th></tr></thead>
            <tbody>
              ${filteredRooms.map((room) => `
                <tr>
                  <td>${roomEscape(room.floor || '-')}</td>
                  <td><strong>${roomEscape(room.room_number)}</strong></td>
                  <td>${roomEscape(room.room_type)}</td>
                  <td>Rs ${roomMoney(room.price)}</td>
                  <td><span class="${roomStatusClass(room.status)}">${roomStatusLabel(room.status)}</span></td>
                  <td>${canStatus ? `
                    <select onchange="updateRoomStatus('${room.id}', this.value)">
                      ${['vacant', 'occupied', 'reserved', 'dirty', 'maintenance'].map((status) => `<option value="${status}" ${room.status === status ? 'selected' : ''}>${roomStatusLabel(status)}</option>`).join('')}
                    </select>
                  ` : '-'}</td>
                  <td>
                    ${canEdit ? `<button class="mini-btn slate" onclick="showEditRoom('${room.id}','${roomEscape(room.room_number)}','${roomEscape(room.room_type)}','${room.price}','${room.status}','${roomEscape(room.floor || '')}')">Edit</button>` : ''}
                    ${canDelete ? `<button class="mini-btn red" onclick="deleteRoom('${room.id}')">Delete</button>` : ''}
                    ${!canEdit && !canDelete ? '-' : ''}
                  </td>
                </tr>
              `).join('') || '<tr><td colspan="7">No rooms found.</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>
    `;
  } catch (error) {
    main.innerHTML = `<section class="pms-content"><div class="pms-panel"><p>${error.message}</p></div></section>`;
  }
}

function roomForm(room = {}) {
  return `
    <section class="pms-content">
      <div class="pms-panel narrow-panel">
        <div class="pms-panel-head">
          <h3>${room.id ? 'Edit Room' : 'Add Room'}</h3>
          <button onclick="loadRooms()">Back</button>
        </div>
        <div class="form-grid">
          <label>Floor<input id="roomFloor" placeholder="Floor" value="${roomEscape(room.floor || '')}"></label>
          <label>Room Number<input id="roomNo" placeholder="Room Number" value="${roomEscape(room.room_number || '')}"></label>
          <label>Type<input id="roomType" placeholder="Type" value="${roomEscape(room.room_type || '')}"></label>
          <label>Price<input id="roomPrice" placeholder="Price" type="number" value="${room.price || ''}"></label>
          <label>Status<select id="roomStatus">
            ${['vacant', 'occupied', 'reserved', 'dirty', 'maintenance'].map((status) => `<option value="${status}" ${room.status === status ? 'selected' : ''}>${roomStatusLabel(status)}</option>`).join('')}
          </select></label>
        </div>
        <div class="form-actions">
          <button onclick="${room.id ? `updateRoom('${room.id}')` : 'addRoom()'}">Save</button>
          <button onclick="loadRooms()">Cancel</button>
        </div>
      </div>
    </section>
  `;
}

function showAddRoom() {
  if (!window.pmsCan?.('rooms.create')) {
    alert('You do not have permission to create rooms.');
    return;
  }
  document.getElementById('main-content').innerHTML = roomForm();
}

function showEditRoom(id, room_number, room_type, price, status, floor = '') {
  if (!window.pmsCan?.('rooms.edit')) {
    alert('You do not have permission to edit rooms.');
    return;
  }
  document.getElementById('main-content').innerHTML = roomForm({ id, room_number, room_type, price, status, floor });
}

function readRoomForm() {
  return {
    floor: document.getElementById('roomFloor').value,
    room_number: document.getElementById('roomNo').value,
    room_type: document.getElementById('roomType').value,
    price: document.getElementById('roomPrice').value,
    status: document.getElementById('roomStatus').value
  };
}

async function addRoom() {
  if (!window.pmsCan?.('rooms.create')) return;
  await api.post('/rooms', readRoomForm());
  loadRooms();
}

async function updateRoom(id) {
  if (!window.pmsCan?.('rooms.edit')) return;
  await api.patch(`/rooms/${id}`, readRoomForm());
  loadRooms();
}

async function updateRoomStatus(id, status) {
  if (!window.pmsCan?.('rooms.status_update')) return;
  await api.patch(`/rooms/${id}`, { status });
  loadRooms(document.getElementById('roomCategoryFilter')?.value || 'all');
}

async function deleteRoom(id) {
  if (!window.pmsCan?.('rooms.delete')) return;
  if (confirm('Delete room?')) {
    await api.delete(`/rooms/${id}`);
    loadRooms();
  }
}
