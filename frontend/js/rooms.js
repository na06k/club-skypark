async function loadRooms() {
  const main = document.getElementById('main-content');
  try {
    const { rooms } = await api.get('/rooms');
    let html = `<h1>Rooms</h1><button onclick="showAddRoom()">+ Add Room</button><table>`;
    html += `<tr><th>Floor</th><th>Room #</th><th>Type</th><th>Price</th><th>Status</th><th>Action</th></tr>`;
    rooms.forEach((r) => {
      html += `<tr>
        <td>${r.floor || '-'}</td>
        <td>${r.room_number}</td>
        <td>${r.room_type}</td>
        <td>Rs ${Number(r.price).toLocaleString()}</td>
        <td>${r.status}</td>
        <td>
          <button onclick="showEditRoom('${r.id}','${r.room_number}','${r.room_type}','${r.price}','${r.status}','${r.floor || ''}')">Edit</button>
          <button onclick="deleteRoom('${r.id}')">Delete</button>
        </td>
      </tr>`;
    });
    html += `</table>`;
    main.innerHTML = html;
  } catch (error) {
    main.innerHTML = `<p>${error.message}</p>`;
  }
}

function roomForm(room = {}) {
  return `
    <h2>${room.id ? 'Edit Room' : 'Add Room'}</h2>
    <input id="roomFloor" placeholder="Floor" value="${room.floor || ''}"><br>
    <input id="roomNo" placeholder="Room Number" value="${room.room_number || ''}"><br>
    <input id="roomType" placeholder="Type" value="${room.room_type || ''}"><br>
    <input id="roomPrice" placeholder="Price" type="number" value="${room.price || ''}"><br>
    <select id="roomStatus">
      ${['vacant', 'occupied', 'reserved', 'maintenance'].map((status) => `
        <option value="${status}" ${room.status === status ? 'selected' : ''}>${status}</option>
      `).join('')}
    </select><br>
    <button onclick="${room.id ? `updateRoom('${room.id}')` : 'addRoom()'}">Save</button>
    <button onclick="loadRooms()">Cancel</button>
  `;
}

function showAddRoom() {
  document.getElementById('main-content').innerHTML = roomForm();
}

function showEditRoom(id, room_number, room_type, price, status, floor = '') {
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
  await api.post('/rooms', readRoomForm());
  loadRooms();
}

async function updateRoom(id) {
  await api.patch(`/rooms/${id}`, readRoomForm());
  loadRooms();
}

async function deleteRoom(id) {
  if (confirm('Delete room?')) {
    await api.delete(`/rooms/${id}`);
    loadRooms();
  }
}
