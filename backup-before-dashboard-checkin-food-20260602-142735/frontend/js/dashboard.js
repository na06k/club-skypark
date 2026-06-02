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
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDashDate(value) {
  if (!value) return '-';
  const date = new Date(String(value).length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return String(value);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}

function formatDashTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function dashMoney(value) {
  return Number(value || 0).toLocaleString('en-IN');
}

function roomLabel(type) {
  return String(type || 'Other Rooms').replace(/Rooms$/i, 'Room');
}

function dashStatusClass(status) {
  return `status-${String(status || '').replace(/_/g, '-')}`;
}

function dashFloorRank(room) {
  const floor = String(room.floor || '').toLowerCase();
  if (floor.includes('ground')) return 0;
  const floorNumber = floor.match(/\d+/);
  if (floorNumber) return Number(floorNumber[0]);

  const roomNumber = String(room.room_number || '').toUpperCase();
  if (roomNumber.startsWith('G')) return 0;
  const numeric = Number.parseInt(roomNumber, 10);
  return Number.isFinite(numeric) ? Math.floor(numeric / 100) : 99;
}

function dashRoomNumberRank(room) {
  const roomNumber = String(room.room_number || '').toUpperCase();
  if (roomNumber.startsWith('G')) return Number.parseInt(roomNumber.replace(/\D/g, ''), 10) || 0;
  const numeric = Number.parseInt(roomNumber, 10);
  return Number.isFinite(numeric) ? numeric : 9999;
}

function compareDashboardRooms(a, b) {
  return (dashFloorRank(a) - dashFloorRank(b))
    || (dashRoomNumberRank(a) - dashRoomNumberRank(b))
    || String(a.room_number || '').localeCompare(String(b.room_number || ''), undefined, { numeric: true });
}

function sortDashboardRooms(rooms, sortBy = 'floor_asc') {
  const sorted = [...rooms].sort(compareDashboardRooms);
  if (sortBy === 'floor_desc') return sorted.reverse();
  if (sortBy === 'status') {
    return sorted.sort((a, b) => String(a.status || '').localeCompare(String(b.status || '')) || compareDashboardRooms(a, b));
  }
  return sorted;
}

function reloadDashboardWithControls() {
  loadDashboard(document.getElementById('dashboardDate')?.value || dashDateValue(), {
    planFilter: document.getElementById('dashboardPlanFilter')?.value || 'all',
    roomSort: document.getElementById('dashboardRoomSort')?.value || 'floor_asc'
  });
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

function dashboardQuickActions() {
  const actions = [
    ['bookings', 'bookings.create', 'New Booking', 'Create or confirm reservation'],
    ['checkin', 'checkin.create', 'Check In', 'Register guest and upload ID'],
    ['checkout', 'checkout.create', 'Check Out', 'Generate final bill'],
    ['restaurant', 'restaurant.view', 'Restaurant POS', 'KOT and food billing'],
    ['receipts', 'receipts.create', 'Receipt', 'Advance or event receipt'],
    ['dailyReport', 'reports.daily', 'Close Day', 'Daily revenue and occupancy']
  ].filter(([, permission]) => window.pmsCan?.(permission));

  return `
    <div class="quick-action-grid">
      ${actions.length ? actions.map(([moduleName, , title, subtitle]) => `<button onclick="loadModule('${moduleName}')"><strong>${title}</strong><span>${subtitle}</span></button>`).join('') : '<p>No quick actions assigned to this staff account.</p>'}
    </div>
  `;
}

async function loadDashboard(date = dashDateValue(), options = {}) {
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
    const planFilter = options.planFilter || document.getElementById('dashboardPlanFilter')?.value || 'all';
    const roomSort = options.roomSort || document.getElementById('dashboardRoomSort')?.value || 'floor_asc';
    const planOptions = [...new Set(['CP', 'EP', 'MAP', 'AP', ...activeGuests.map((guest) => guest.room_plan || 'CP')])].filter(Boolean);
    const planFilteredGuests = planFilter === 'all'
      ? activeGuests
      : activeGuests.filter((guest) => String(guest.room_plan || 'CP').toLowerCase() === String(planFilter).toLowerCase());
    const checkoutPending = checkoutPendingGuests(activeGuests, date);
    const continueRooms = continueGuests(activeGuests, date);
    const occupiedRooms = rooms.filter((room) => room.status === 'occupied');
    const pendingPayments = bookings.filter((booking) => Number(booking.balance_amount || booking.total_price || 0) > Number(booking.paid_amount || 0) && !['cancelled', 'checked_out', 'completed'].includes(booking.status));
    const revenueToday = Number(daily.summary.cash_received || daily.summary.receipt_total || 0);
    const occupancy = rooms.length ? Math.round((occupiedRooms.length / rooms.length) * 100) : 0;

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

    const sortedRooms = sortDashboardRooms(rooms, roomSort);
    const roomTiles = sortedRooms.slice(0, 24).map((room) => `
      <article class="pms-room-tile ${dashStatusClass(room.status)}">
        <strong>${room.room_number}</strong>
        <span>${room.room_type}</span>
        <small>${room.status}</small>
      </article>
    `).join('');

    main.innerHTML = `
      <div class="pms-topbar">
        <button class="global-inline-menu" onclick="toggleSidebar()">Menu</button>
        <div>
          <p>Club Skypark PMS</p>
          <h1>Dashboard</h1>
        </div>
        <div class="pms-top-actions">
          <button onclick="loadModule('dashboard')">Refresh</button>
          <button onclick="logout()">Log out</button>
        </div>
      </div>

      <section class="pms-content">
        <div class="pms-title-row">
          <div>
            <span>Live hotel control room</span>
            <h2>Today at a glance</h2>
          </div>
          <div class="date-row compact-date-row">
            <input id="dashboardDate" type="date" value="${date}">
            <button onclick="reloadDashboardWithControls()">Search</button>
          </div>
        </div>

        <div class="dashboard-direct-actions">
          ${window.pmsCan?.('checkin.create') ? '<button onclick="loadModule(\'checkin\')"><strong>Direct Check In</strong><span>Register guest now</span></button>' : ''}
          ${window.pmsCan?.('checkout.create') ? '<button onclick="loadModule(\'checkout\')"><strong>Direct Check Out</strong><span>Open final bill screen</span></button>' : ''}
          ${window.pmsCan?.('bookings.create') ? '<button onclick="loadModule(\'reservations\')"><strong>Reserve Room</strong><span>Advance booking</span></button>' : ''}
        </div>

        <div class="pms-kpi-grid">
          <article><span>Today's Bookings</span><strong>${daily.summary.reservations || 0}</strong><small>${formatDashDate(date)}</small></article>
          <article><span>Check-ins</span><strong>${daily.summary.checkins || 0}</strong><small>${activeGuests.length} active guests</small></article>
          <article><span>Check-outs</span><strong>${daily.summary.checkouts || 0}</strong><small>${checkoutPending.length} pending today</small></article>
          <article><span>Occupancy</span><strong>${occupancy}%</strong><small>${occupiedRooms.length} of ${rooms.length} rooms</small></article>
          <article><span>Revenue Today</span><strong>Rs ${dashMoney(revenueToday)}</strong><small>Cash / ledger received</small></article>
          <article><span>Pending Payments</span><strong>${pendingPayments.length}</strong><small>Bookings with due amount</small></article>
        </div>

        <div class="pms-two-col">
          <section class="pms-panel">
            <div class="pms-panel-head">
              <h3>Room Category Summary</h3>
              <button onclick="loadModule('rooms')">Manage Rooms</button>
            </div>
            <div class="room-summary-grid">
              ${orderedTypes.map((type) => {
                const counts = countsByType.get(type);
                return `
                  <article>
                    <span>${roomLabel(type)}</span>
                    <strong>${counts.booked}/${counts.total}</strong>
                    <small>Booked / total</small>
                  </article>
                `;
              }).join('')}
            </div>
          </section>

          <aside class="pms-panel">
            <div class="pms-panel-head">
              <h3>Quick Actions</h3>
            </div>
            ${dashboardQuickActions()}
          </aside>
        </div>

        <div class="pms-two-col wide-left">
          <section class="pms-panel">
            <div class="pms-panel-head">
              <h3>Today Checkout Pending</h3>
              <span>${checkoutPending.length} rooms</span>
            </div>
            <table class="pms-table">
              <thead><tr><th>Check-in No</th><th>Guest</th><th>Mobile</th><th>Room</th><th>Check-in</th><th>Action</th></tr></thead>
              <tbody>
                ${checkoutPending.length ? checkoutPending.map((guest) => `
                  <tr>
                    <td>${guest.check_in_no || guest.id}</td>
                    <td>${guest.name}</td>
                    <td>${guest.phone || '-'}</td>
                    <td>${guest.room_number || guest.room?.room_number || '-'} (${roomLabel(guest.room?.room_type || guest.room_type || '')})</td>
                    <td>${formatDashDate(guest.check_in_date)} ${formatDashTime(guest.check_in_date)}</td>
                    <td>
                      ${window.pmsCan?.('checkout.create') ? `<button class="mini-btn cyan" onclick="checkoutGuest('${guest.id}')">Check Out</button>` : ''}
                      ${window.pmsCan?.('restaurant.create_order') ? '<button class="mini-btn slate" onclick="loadRestaurant()">Add Food</button>' : ''}
                    </td>
                  </tr>
                `).join('') : '<tr><td colspan="6">No checkout pending rooms.</td></tr>'}
              </tbody>
            </table>
          </section>

          <aside class="pms-panel">
            <div class="pms-panel-head">
              <h3>Room Status Board</h3>
              <span>${continueRooms.length} continue rooms</span>
            </div>
            <div class="pms-filter-row">
              <label>Room sorting
                <select id="dashboardRoomSort" onchange="reloadDashboardWithControls()">
                  <option value="floor_asc" ${roomSort === 'floor_asc' ? 'selected' : ''}>Floor wise ascending</option>
                  <option value="floor_desc" ${roomSort === 'floor_desc' ? 'selected' : ''}>Floor wise descending</option>
                  <option value="status" ${roomSort === 'status' ? 'selected' : ''}>Status wise</option>
                </select>
              </label>
            </div>
            <div class="pms-room-board">${roomTiles || '<p>No room data found.</p>'}</div>
          </aside>
        </div>

        <section class="pms-panel">
          <div class="pms-panel-head">
            <h3>Current Check-ins</h3>
              ${window.pmsCan?.('checkin.list') ? '<button onclick="loadModule(\'checkinList\')">Open Check-in List</button>' : ''}
          </div>
          <div class="pms-filter-row">
            <label>Sort by plan
              <select id="dashboardPlanFilter" onchange="reloadDashboardWithControls()">
                <option value="all" ${planFilter === 'all' ? 'selected' : ''}>All plans</option>
                ${planOptions.map((plan) => `<option value="${plan}" ${planFilter === plan ? 'selected' : ''}>${plan}</option>`).join('')}
              </select>
            </label>
          </div>
          <div class="active-room-grid">
            ${planFilteredGuests.length ? planFilteredGuests.map((guest) => `
              <article>
                <strong>${guest.room_number || guest.room?.room_number || '-'}</strong>
                <span>${guest.name}</span>
                <small>${roomLabel(guest.room?.room_type || guest.room_type || '')} - ${guest.room_plan || 'CP'}</small>
                <div>
                  ${window.pmsCan?.('restaurant.create_order') ? '<button class="mini-btn slate" onclick="loadRestaurant()">Food</button>' : ''}
                  ${window.pmsCan?.('checkout.create') ? `<button class="mini-btn cyan" onclick="checkoutGuest('${guest.id}')">Checkout</button>` : ''}
                </div>
              </article>
            `).join('') : '<p>No active check-ins for this plan.</p>'}
          </div>
        </section>
      </section>
    `;
  } catch (error) {
    main.innerHTML = `<section class="pms-content"><div class="pms-panel"><h2>Dashboard could not load</h2><p>${error.message}</p></div></section>`;
  }
}
