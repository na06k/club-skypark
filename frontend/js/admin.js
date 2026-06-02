const moduleAccess = {
  dashboard: ['dashboard.view'],
  bookings: ['bookings.view'],
  rooms: ['rooms.view'],
  checkin: ['checkin.view'],
  checkinList: ['checkin.list', 'checkin.room_swap'],
  cancelCheckinList: ['checkin.list'],
  allCheckinReport: ['checkin.list'],
  checkout: ['checkout.view'],
  checkoutList: ['checkout.list'],
  cancelCheckoutList: ['checkout.list'],
  payments: ['payments.view'],
  restaurant: ['restaurant.view'],
  receipts: ['receipts.view'],
  dailyReport: ['reports.daily'],
  store: ['store.view'],
  reservations: ['bookings.view', 'bookings.bulk'],
  items: ['items.view', 'restaurant.view'],
  ledger: ['ledger.view'],
  gstReport: ['reports.gst'],
  settings: ['staff.view', 'staff.create', 'staff.edit', 'staff.permissions']
};

function currentUser() {
  return api.user || {};
}

function pmsPermissions() {
  const user = currentUser();
  return Array.isArray(user.permissions) ? user.permissions : [];
}

function pmsCan(permission) {
  const user = currentUser();
  if (!user || !permission) return false;
  return user.role === 'super_admin' || pmsPermissions().includes(permission);
}

function pmsCanAny(...permissions) {
  return permissions.some((permission) => pmsCan(permission));
}

function canOpenModule(moduleName) {
  const permissions = moduleAccess[moduleName] || [];
  return permissions.length === 0 || pmsCanAny(...permissions);
}

function roleLabel(role) {
  return String(role || '').replace(/_/g, ' ');
}

async function checkAuth() {
  if (!api.token) {
    window.location.href = 'login.html';
    return null;
  }

  try {
    const { user } = await api.get('/auth/me');
    sessionStorage.setItem('role', user.role);
    sessionStorage.setItem('user', JSON.stringify(user));
    return user;
  } catch (error) {
    console.error(error);
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

function printCurrentDocument() {
  window.print();
}

function saveCurrentDocumentAsPdf() {
  window.print();
}

function toggleSidebarMenu(id) {
  const menu = document.getElementById(id);
  if (menu) menu.classList.toggle('open');
}

function sidebarLink(moduleName, label) {
  if (!canOpenModule(moduleName)) return '';
  return `<li><a href="#" onclick="loadModule('${moduleName}')">${label}</a></li>`;
}

function sidebarSubLink(moduleName, label) {
  if (!canOpenModule(moduleName)) return '';
  return `<li><a href="#" onclick="loadModule('${moduleName}')"><span></span>${label}</a></li>`;
}

function sidebarGroup(id, label, icon, links) {
  const visibleLinks = links.filter(Boolean).join('');
  if (!visibleLinks) return '';
  return `
    <li class="sidebar-group">
      <button class="sidebar-parent" onclick="toggleSidebarMenu('${id}')"><span class="hotel-icon">${icon}</span> ${label} <span class="chevron">v</span></button>
      <ul id="${id}" class="sidebar-submenu open">${visibleLinks}</ul>
    </li>
  `;
}

function buildSidebar(user) {
  const sidebar = document.getElementById('sidebar');
  const staffAccessLabel = pmsCan('staff.permissions') ? 'Settings / Staff Access' : 'Settings';
  const checkinLinks = [
    sidebarSubLink('checkin', 'Check In'),
    sidebarSubLink('checkinList', 'Check In List'),
    sidebarSubLink('cancelCheckinList', 'Cancel Check In List'),
    sidebarSubLink('allCheckinReport', 'All Checkin Report')
  ];
  const checkoutLinks = [
    sidebarSubLink('checkout', 'Check Out'),
    sidebarSubLink('checkoutList', 'Check Out List'),
    sidebarSubLink('cancelCheckoutList', 'Cancel Check Out List')
  ];

  const html = `
    <div class="sidebar-header">
      <h2>CLUB SKYPARK</h2>
      <small>${roleLabel(user.role)} PMS / POS</small>
    </div>
    <ul class="sidebar-menu">
      ${sidebarLink('dashboard', 'Dashboard')}
      ${sidebarLink('bookings', 'Booking Management')}
      ${sidebarLink('rooms', 'Room Management')}
      ${sidebarGroup('checkinSubmenu', 'Check In', 'IN', checkinLinks)}
      ${sidebarGroup('checkoutSubmenu', 'Check Out', 'OUT', checkoutLinks)}
      ${sidebarLink('receipts', 'Receipts / Advance')}
      ${sidebarLink('dailyReport', 'Daily Report')}
      ${sidebarLink('reservations', 'Reservations Calendar')}
      ${sidebarLink('payments', 'Billing / Payments')}
      ${sidebarLink('store', 'Store Management')}
      ${sidebarLink('ledger', 'Store / Cash Ledger')}
      ${sidebarLink('gstReport', 'GST Report')}
      ${sidebarLink('restaurant', 'Restaurant POS')}
      ${sidebarLink('items', 'Menu / Store Items')}
      ${sidebarLink('settings', staffAccessLabel)}
    </ul>
    <div class="sidebar-footer"><button onclick="logout()">Logout</button></div>
  `;
  sidebar.innerHTML = html;
}

function getModuleLoader(moduleName) {
  const loaders = {
    dashboard: window.loadDashboard,
    bookings: window.loadBookings,
    rooms: window.loadRooms,
    checkin: window.loadCheckin,
    checkinList: window.loadCheckinList,
    cancelCheckinList: window.loadCancelCheckinList,
    allCheckinReport: window.loadAllCheckinReport,
    checkout: window.loadCheckout,
    checkoutList: window.loadCheckoutList,
    cancelCheckoutList: window.loadCancelCheckoutList,
    payments: window.loadPayments,
    restaurant: window.loadRestaurant,
    receipts: window.loadReceipts,
    dailyReport: window.loadDailyReport,
    store: window.loadStore,
    reservations: window.loadReservations,
    items: window.loadItems,
    ledger: window.loadLedger,
    gstReport: window.loadGstReport,
    settings: window.loadSettings
  };

  return typeof loaders[moduleName] === 'function' ? loaders[moduleName] : null;
}

function getModuleTitle(moduleName) {
  return moduleName
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (letter) => letter.toUpperCase());
}

function firstAccessibleModule() {
  const orderedModules = [
    'dashboard',
    'bookings',
    'rooms',
    'checkin',
    'checkinList',
    'checkout',
    'checkoutList',
    'restaurant',
    'receipts',
    'dailyReport',
    'reservations',
    'payments',
    'store',
    'ledger',
    'gstReport',
    'settings'
  ];
  return orderedModules.find((moduleName) => canOpenModule(moduleName));
}

async function loadModule(moduleName) {
  document.body.classList.toggle('dashboard-mode', moduleName === 'dashboard');
  document.body.classList.add('pms-mode');
  document.body.classList.remove('sidebar-open');
  const main = document.getElementById('main-content');
  main.innerHTML = '<p>Loading...</p>';

  if (!canOpenModule(moduleName)) {
    main.innerHTML = `
      <section class="panel">
        <h2>Access denied</h2>
        <p>Your staff account does not have permission to open ${getModuleTitle(moduleName)}.</p>
      </section>
    `;
    return;
  }

  const loader = getModuleLoader(moduleName);
  if (!loader) {
    main.innerHTML = '<p>Module not found or failed to load.</p>';
    return;
  }

  try {
    await loader();
  } catch (error) {
    console.error(error);
    main.innerHTML = `
      <section class="panel">
        <h2>${getModuleTitle(moduleName)} could not load</h2>
        <p>${error.message || 'Please refresh the page and try again.'}</p>
        <button class="primary" onclick="loadModule('${moduleName}')">Retry</button>
      </section>
    `;
  }
}

window.pmsCan = pmsCan;
window.pmsCanAny = pmsCanAny;
window.canOpenModule = canOpenModule;

(async () => {
  try {
    const user = await checkAuth();
    if (user) {
      buildSidebar(user);
      const moduleName = firstAccessibleModule();
      if (moduleName) {
        await loadModule(moduleName);
      } else {
        document.getElementById('main-content').innerHTML = `
          <section class="panel">
            <h2>No access assigned</h2>
            <p>Please ask the super admin to assign PMS permissions to this staff account.</p>
          </section>
        `;
      }
    }
  } catch (error) {
    console.error(error);
    document.getElementById('main-content').innerHTML = `
      <section class="panel">
        <h2>Backend system could not load</h2>
        <p>${error.message || 'Please restart the backend server and refresh this page.'}</p>
      </section>
    `;
  }
})();
