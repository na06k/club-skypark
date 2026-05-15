async function checkAuth() {
  if (!api.token) {
    window.location.href = 'login.html';
    return null;
  }

  try {
    const { user } = await api.get('/auth/me');
    sessionStorage.setItem('role', user.role);
    sessionStorage.setItem('user', JSON.stringify(user));
    return user.role;
  } catch (error) {
    api.clearSession();
    window.location.href = 'login.html';
    return null;
  }
}

function logout() {
  api.clearSession();
  window.location.href = 'login.html';
}

function toggleSidebar() {
  document.body.classList.toggle('sidebar-open');
}

function buildSidebar(role) {
  const sidebar = document.getElementById('sidebar');
  let html = `
    <div class="sidebar-header">
      <h2>CLUB SKYPARK</h2>
      <small>${role.replace('_', ' ')}</small>
    </div>
    <ul class="sidebar-menu">
      <li><a href="#" onclick="loadModule('dashboard')">Dashboard</a></li>
      <li><a href="#" onclick="loadModule('bookings')">Reservations</a></li>
      <li><a href="#" onclick="loadModule('rooms')">Rooms</a></li>
      <li><a href="#" onclick="loadModule('checkin')">Check In</a></li>
      <li><a href="#" onclick="loadModule('checkout')">Check Out</a></li>
      <li><a href="#" onclick="loadModule('receipts')">Receipts</a></li>
      <li><a href="#" onclick="loadModule('dailyReport')">Daily Report</a></li>
      <li><a href="#" onclick="loadModule('reservations')">Reservation</a></li>
  `;

  if (role === 'super_admin' || role === 'manager') {
    html += `<li><a href="#" onclick="loadModule('payments')">Payments</a></li>`;
    html += `<li><a href="#" onclick="loadModule('store')">Store</a></li>`;
    html += `<li><a href="#" onclick="loadModule('ledger')">Ledger</a></li>`;
    html += `<li><a href="#" onclick="loadModule('gstReport')">GST Report</a></li>`;
  }
  if (role === 'super_admin' || role === 'restaurant') {
    html += `<li><a href="#" onclick="loadModule('restaurant')">Restaurant</a></li>`;
    html += `<li><a href="#" onclick="loadModule('items')">Items</a></li>`;
  }
  if (role === 'super_admin') {
    html += `<li><a href="#" onclick="loadModule('settings')">Settings</a></li>`;
  }
  html += `</ul><div class="sidebar-footer"><button onclick="logout()">Logout</button></div>`;
  sidebar.innerHTML = html;
}

function loadModule(moduleName) {
  document.body.classList.toggle('dashboard-mode', moduleName === 'dashboard');
  document.body.classList.remove('sidebar-open');
  const main = document.getElementById('main-content');
  main.innerHTML = '<p>Loading...</p>';

  switch (moduleName) {
    case 'dashboard': return loadDashboard();
    case 'bookings': return loadBookings();
    case 'rooms': return loadRooms();
    case 'checkin': return loadCheckin();
    case 'checkout': return loadCheckout();
    case 'payments': return loadPayments();
    case 'restaurant': return loadRestaurant();
    case 'receipts': return loadReceipts();
    case 'dailyReport': return loadDailyReport();
    case 'store': return loadStore();
    case 'reservations': return loadReservations();
    case 'items': return loadItems();
    case 'ledger': return loadLedger();
    case 'gstReport': return loadGstReport();
    case 'settings': return loadSettings();
    default:
      main.innerHTML = '<p>Module not found.</p>';
  }
}

(async () => {
  const role = await checkAuth();
  if (role) {
    buildSidebar(role);
    loadModule('dashboard');
  }
})();
