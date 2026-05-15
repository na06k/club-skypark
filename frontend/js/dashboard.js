const dashboardRoomOrder = [
  'Club Family Rooms',
  'Executive Suites',
  'Family Suites',
  'Junior Suite',
  'Platinum Rooms',
  'Pooja Rooms',
  'Premium Rooms',
  'Presidential Suite',
  'Twin Bed Rooms'
];

function dashDateValue() {
  return new Date().toISOString().slice(0, 10);
}

function formatDashDate(value) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

function roomLabel(type) {
  return String(type || 'Other Rooms').replace(/Rooms$/i, 'Room');
}

function attachGuestContext(guests, rooms, bookings) {
  return guests.map((guest) => {
    const room = rooms.find((item) => String(item.id) === String(guest.room_id));
    const booking = bookings.find((item) => String(item.id) === String(guest.booking_id))
      || bookings.find((item) => item.guest_phone && guest.phone && item.guest_phone === guest.phone && item.status !== 'checked_out' && item.status !== 'cancelled')
      || null;
    return { ...guest, room, booking };
  }).filter((guest) => !guest.check_out_date);
}

function checkoutPendingGuests(activeGuests, date) {
  return activeGuests.filter((guest) => guest.booking?.check_out && guest.booking.check_out <= date);
}

function continueGuests(activeGuests, date) {
  return activeGuests.filter((guest) => !guest.booking?.check_out || guest.booking.check_out > date);
}

async function loadDashboard(date = dashDateValue()) {
  const main = document.getElementById('main-content');
  document.body.classList.add('dashboard-mode');

  try {
    const [{ rooms }, { guests }, { bookings }, daily] = await Promise.all([
      api.get('/rooms'),
      api.get('/guests/active'),
      api.get('/bookings'),
      api.get(`/reports/daily?date=${date}`)
    ]);

    const activeGuests = attachGuestContext(guests, rooms, bookings);
    const checkoutPending = checkoutPendingGuests(activeGuests, date);
    const continueRooms = continueGuests(activeGuests, date);
    const countsByType = new Map();

    rooms.forEach((room) => {
      const current = countsByType.get(room.room_type) || { total: 0, booked: 0 };
      current.total += 1;
      if (room.status === 'occupied' || room.status === 'reserved') current.booked += 1;
      countsByType.set(room.room_type, current);
    });

    const orderedTypes = [
      ...dashboardRoomOrder.filter((type) => countsByType.has(type)),
      ...Array.from(countsByType.keys()).filter((type) => !dashboardRoomOrder.includes(type)).sort()
    ];

    main.innerHTML = `
      <div class="dash-topbar">
        <button class="dash-menu" onclick="toggleSidebar()">☰</button>
        <button class="dash-link" onclick="loadModule('dashboard')">Home</button>
        <button class="dash-link" onclick="logout()">Log-out <span>➜</span></button>
      </div>

      <section class="dash-page-head">
        <h1>Dashboard</h1>
        <div class="breadcrumb"><span>Home</span> / Dashboard v1</div>
      </section>

      <section class="dashboard-grid">
        <div class="room-card-grid">
          ${orderedTypes.map((type) => {
            const counts = countsByType.get(type);
            return `
              <article class="dash-room-card total-card">
                <strong>${counts.total}</strong>
                <span>${roomLabel(type)}</span>
                <small>Total Room</small>
              </article>
              <article class="dash-room-card booked-card">
                <strong>${counts.booked}</strong>
                <span>${roomLabel(type)}</span>
                <small>Book Room</small>
              </article>
            `;
          }).join('')}
        </div>

        <aside class="date-filter-card">
          <h3>FILTER BY DATE</h3>
          <div class="date-row">
            <input id="dashboardDate" type="date" value="${date}">
            <button onclick="loadDashboard(document.getElementById('dashboardDate').value)">Search</button>
          </div>
          <div class="date-stats">
            <div><strong>${daily.summary.checkins}</strong><span>Check-ins: ${formatDashDate(date)}</span></div>
            <div><strong>${continueRooms.length}</strong><span>Continue Rooms</span></div>
          </div>
        </aside>
      </section>

      <section class="checkout-panel">
        <h2>Today Checkout Pending List</h2>
        <div class="table-tools"><span>Show <select><option>10</option></select> entries</span><label>Search: <input></label></div>
        <table class="dashboard-table">
          <tr><th>Check-in No</th><th>Booking No</th><th>Name</th><th>Mobile</th><th>Check-in Date</th><th>Check-in Time</th><th>Room Details</th><th>Addons</th><th>Username</th><th>Action</th></tr>
          ${checkoutPending.length ? checkoutPending.map((guest, index) => `
            <tr>
              <td>${400 + index + 1}</td>
              <td>${guest.booking_id || guest.booking?.id || ''}</td>
              <td>${guest.name}</td>
              <td>${guest.phone || ''}</td>
              <td>${formatDashDate(guest.check_in_date.slice(0, 10))}</td>
              <td>${new Date(guest.check_in_date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</td>
              <td>${guest.room_number || guest.room?.room_number || '-'} (${roomLabel(guest.room?.room_type || '')})</td>
              <td></td>
              <td>${api.user?.name || api.user?.email || 'admin'}</td>
              <td>
                <button class="mini-btn green" onclick="loadRestaurant()">Add Food & Other</button>
                <button class="mini-btn cyan" onclick="checkoutGuest('${guest.id}')">Check Out</button>
                <button class="mini-btn slate" onclick="showPaymentForm()">Advance Amount</button>
              </td>
            </tr>
          `).join('') : '<tr><td colspan="10">No checkout pending rooms.</td></tr>'}
        </table>
        <div class="pager"><span>Showing ${checkoutPending.length ? 1 : 0} to ${checkoutPending.length} of ${checkoutPending.length} entries</span><div><button>Previous</button><button class="active">1</button><button>Next</button></div></div>
      </section>

      <section class="checkin-cards-section">
        <h2>Check In Details</h2>
        <div class="checkin-card-grid">
          ${activeGuests.map((guest) => `
            <article class="checkin-room-card">
              <h3>${guest.room_number || guest.room?.room_number || '-'} (${roomLabel(guest.room?.room_type || '')}) - CP</h3>
              <div>
                <button class="mini-btn red">View Detail</button>
                <button class="mini-btn slate" onclick="loadRestaurant()">Add Food & Other</button>
                <button class="mini-btn dark" onclick="checkoutGuest('${guest.id}')">Check Out</button>
                <button class="mini-btn cyan" onclick="showPaymentForm()">Advance Amount</button>
              </div>
            </article>
          `).join('') || '<p>No active check-ins.</p>'}
        </div>
      </section>

      <footer class="dashboard-footer"><span>Copyright ©. All rights reserved.</span><strong>Version 1.0</strong></footer>
    `;
  } catch (error) {
    main.innerHTML = `<p>${error.message}</p>`;
  }
}
