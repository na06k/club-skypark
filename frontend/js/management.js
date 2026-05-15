const rs = (value) => `Rs ${Number(value || 0).toLocaleString()}`;
const todayValue = () => new Date().toISOString().slice(0, 10);
const linesFromText = (text) => text.split('\n').map((line) => line.split(',').map((part) => part.trim())).filter((parts) => parts[0]);

function tableOrEmpty(rows, emptyText = 'No records found.') {
  return rows.length ? rows.join('') : `<tr><td colspan="10">${emptyText}</td></tr>`;
}

async function loadReceipts() {
  const main = document.getElementById('main-content');
  try {
    const { receipts } = await api.get('/receipts');
    main.innerHTML = `<h1>Receipts</h1>
      <button onclick="showReceiptForm()">+ Create Receipt</button>
      <table>
        <tr><th>No.</th><th>Customer</th><th>Type</th><th>Total</th><th>Paid</th><th>Balance</th><th>Action</th></tr>
        ${tableOrEmpty(receipts.map((receipt) => `<tr>
          <td>${receipt.receipt_number}</td>
          <td>${receipt.customer_name}</td>
          <td>${receipt.receipt_type}</td>
          <td>${rs(receipt.grand_total)}</td>
          <td>${rs(receipt.paid_amount)}</td>
          <td>${rs(receipt.balance_amount)}</td>
          <td><button onclick="viewReceipt('${receipt.id}')">View</button></td>
        </tr>`))}
      </table>`;
  } catch (error) {
    main.innerHTML = `<p>${error.message}</p>`;
  }
}

function showReceiptForm() {
  document.getElementById('main-content').innerHTML = `<h1>Create Receipt</h1>
    <div class="form-grid">
      <input id="receiptCustomer" placeholder="Customer / Party Name">
      <input id="receiptPhone" placeholder="Phone">
      <input id="receiptEmail" placeholder="Email optional">
      <input id="receiptGstin" placeholder="Customer GSTIN optional">
      <select id="receiptType"><option value="room_booking">Room Booking</option><option value="event">Event</option><option value="restaurant">Restaurant</option><option value="store">Store</option><option value="misc">Misc</option></select>
      <input id="receiptEvent" placeholder="Event Type e.g. Wedding / Birthday">
      <input id="receiptEventDate" type="date">
      <input id="receiptVenue" placeholder="Venue / Hall / Room">
      <input id="receiptPaid" type="number" placeholder="Paid Amount">
      <input id="receiptDiscount" type="number" placeholder="Discount">
      <input id="receiptMethod" placeholder="Payment Method" value="cash">
    </div>
    <textarea id="receiptItems" rows="5" placeholder="Items one per line: Description, Quantity, Rate, GST%"></textarea>
    <textarea id="receiptNotes" rows="2" placeholder="Notes"></textarea><br>
    <button onclick="createReceipt()">Save Receipt</button>
    <button onclick="loadReceipts()">Cancel</button>`;
}

async function createReceipt() {
  const items = linesFromText(document.getElementById('receiptItems').value).map(([description, quantity, rate, gst_percent]) => ({ description, quantity, rate, gst_percent: gst_percent || 0 }));
  await api.post('/receipts', {
    receipt_type: document.getElementById('receiptType').value,
    customer_name: document.getElementById('receiptCustomer').value,
    customer_phone: document.getElementById('receiptPhone').value,
    customer_email: document.getElementById('receiptEmail').value,
    customer_gstin: document.getElementById('receiptGstin').value,
    event_type: document.getElementById('receiptEvent').value,
    event_date: document.getElementById('receiptEventDate').value,
    venue: document.getElementById('receiptVenue').value,
    paid_amount: document.getElementById('receiptPaid').value || 0,
    discount_amount: document.getElementById('receiptDiscount').value || 0,
    payment_method: document.getElementById('receiptMethod').value,
    notes: document.getElementById('receiptNotes').value,
    items
  });
  loadReceipts();
}

async function viewReceipt(id) {
  const { receipt } = await api.get(`/receipts/${id}`);
  document.getElementById('main-content').innerHTML = `<h1>Receipt ${receipt.receipt_number}</h1>
    <p><strong>${receipt.customer_name}</strong> ${receipt.customer_phone || ''}</p>
    <p>${receipt.receipt_type} ${receipt.event_type ? `- ${receipt.event_type}` : ''} ${receipt.event_date || ''}</p>
    <table><tr><th>Description</th><th>Qty</th><th>Rate</th><th>GST</th><th>Total</th></tr>
      ${receipt.items.map((item) => `<tr><td>${item.description}</td><td>${item.quantity}</td><td>${rs(item.rate)}</td><td>${item.gst_percent}%</td><td>${rs(item.line_total)}</td></tr>`).join('')}
    </table>
    <h3>Total: ${rs(receipt.grand_total)} | Paid: ${rs(receipt.paid_amount)} | Balance: ${rs(receipt.balance_amount)}</h3>
    <button onclick="window.print()">Print</button>
    <button onclick="loadReceipts()">Back</button>`;
}

async function loadDailyReport(date = todayValue()) {
  const main = document.getElementById('main-content');
  try {
    const report = await api.get(`/reports/daily?date=${date}`);
    main.innerHTML = `<h1>Daily Report</h1>
      <input id="dailyDate" type="date" value="${report.date}">
      <button onclick="loadDailyReport(document.getElementById('dailyDate').value)">Load</button>
      <button onclick="closeDailyReport()">Close Day</button>
      <div class="stats">
        ${Object.entries(report.summary).map(([key, value]) => `<div class="stat-card"><h3>${key.replaceAll('_', ' ')}</h3><p>${typeof value === 'number' ? value.toLocaleString() : value}</p></div>`).join('')}
      </div>
      <h2>Check-ins</h2><table><tr><th>Name</th><th>Room</th><th>Time</th></tr>${tableOrEmpty(report.checkins.map((g) => `<tr><td>${g.name}</td><td>${g.room_id}</td><td>${g.check_in_date}</td></tr>`))}</table>
      <h2>Restaurant Orders</h2><table><tr><th>Table</th><th>Total</th><th>Status</th></tr>${tableOrEmpty(report.restaurant_orders.map((o) => `<tr><td>${o.table_number}</td><td>${rs(o.total)}</td><td>${o.status}</td></tr>`))}</table>
      <h2>Stock Updates</h2><table><tr><th>Item</th><th>Type</th><th>Old</th><th>New</th></tr>${tableOrEmpty(report.stock_movements.map((m) => `<tr><td>${m.store_item_id}</td><td>${m.movement_type}</td><td>${m.previous_stock}</td><td>${m.new_stock}</td></tr>`))}</table>`;
  } catch (error) {
    main.innerHTML = `<p>${error.message}</p>`;
  }
}

async function closeDailyReport() {
  await api.post('/reports/daily/close', { date: document.getElementById('dailyDate').value });
  alert('Daily report closed.');
}

async function loadStore() {
  const main = document.getElementById('main-content');
  try {
    const [{ items }, { movements }] = await Promise.all([api.get('/store-items'), api.get(`/stock-movements?date=${todayValue()}`)]);
    main.innerHTML = `<h1>Store Management</h1>
      <button onclick="showStoreItemForm()">+ Add Stock Item</button>
      <table><tr><th>Name</th><th>Category</th><th>Stock</th><th>Unit</th><th>Reorder</th><th>Action</th></tr>
        ${tableOrEmpty(items.map((item) => `<tr><td>${item.name}</td><td>${item.category}</td><td>${item.current_stock}</td><td>${item.unit}</td><td>${item.reorder_level}</td><td><button onclick="showStockMovement('${item.id}','${item.name}')">Update Stock</button></td></tr>`))}
      </table>
      <h2>Today's Stock Updates</h2>
      <table><tr><th>Item</th><th>Type</th><th>Previous</th><th>New</th><th>Reason</th></tr>${tableOrEmpty(movements.map((m) => `<tr><td>${m.item_name || m.store_item_id}</td><td>${m.movement_type}</td><td>${m.previous_stock}</td><td>${m.new_stock}</td><td>${m.reason || ''}</td></tr>`))}</table>`;
  } catch (error) {
    main.innerHTML = `<p>${error.message}</p>`;
  }
}

function showStoreItemForm() {
  document.getElementById('main-content').innerHTML = `<h1>Add Store Item</h1>
    <div class="form-grid">
      <input id="storeName" placeholder="Item Name">
      <input id="storeCategory" placeholder="Category">
      <input id="storeUnit" placeholder="Unit" value="pcs">
      <input id="storeStock" type="number" placeholder="Current Stock">
      <input id="storeReorder" type="number" placeholder="Reorder Level">
      <input id="storeCost" type="number" placeholder="Cost Price">
      <input id="storeSell" type="number" placeholder="Selling Price">
      <input id="storeGst" type="number" placeholder="GST %">
    </div>
    <button onclick="addStoreItem()">Save</button>
    <button onclick="loadStore()">Cancel</button>`;
}

async function addStoreItem() {
  await api.post('/store-items', {
    name: document.getElementById('storeName').value,
    category: document.getElementById('storeCategory').value,
    unit: document.getElementById('storeUnit').value,
    current_stock: document.getElementById('storeStock').value || 0,
    reorder_level: document.getElementById('storeReorder').value || 0,
    cost_price: document.getElementById('storeCost').value || 0,
    selling_price: document.getElementById('storeSell').value || 0,
    gst_percent: document.getElementById('storeGst').value || 0
  });
  loadStore();
}

function showStockMovement(id, name) {
  document.getElementById('main-content').innerHTML = `<h1>Update Stock - ${name}</h1>
    <select id="stockType"><option value="in">In</option><option value="out">Out</option><option value="adjustment">Adjustment</option><option value="closing">Night Closing Stock</option></select>
    <input id="stockQty" type="number" placeholder="Quantity / Closing Stock">
    <input id="stockReason" placeholder="Reason">
    <textarea id="stockNote" placeholder="Note"></textarea><br>
    <button onclick="saveStockMovement('${id}')">Save</button>
    <button onclick="loadStore()">Cancel</button>`;
}

async function saveStockMovement(id) {
  await api.post(`/store-items/${id}/movements`, {
    movement_type: document.getElementById('stockType').value,
    quantity: document.getElementById('stockQty').value,
    reason: document.getElementById('stockReason').value,
    note: document.getElementById('stockNote').value,
    movement_date: todayValue()
  });
  loadStore();
}

async function loadReservations() {
  const main = document.getElementById('main-content');
  try {
    const [{ reservations }, { rooms }] = await Promise.all([api.get('/reservations'), api.get('/rooms')]);
    window.__reservationRooms = rooms;
    main.innerHTML = `<h1>Reservation System</h1>
      <button onclick="showReservationForm()">+ Reserve Room</button>
      <table><tr><th>Guest</th><th>Room</th><th>Dates</th><th>Total</th><th>Status</th></tr>
        ${tableOrEmpty(reservations.map((r) => `<tr><td>${r.guest_name}<br>${r.guest_phone}</td><td>${r.room_number || r.room_name || '-'}</td><td>${r.check_in} to ${r.check_out}</td><td>${rs(r.total_price)}</td><td>${r.status}</td></tr>`))}
      </table>`;
  } catch (error) {
    main.innerHTML = `<p>${error.message}</p>`;
  }
}

function showReservationForm() {
  const rooms = window.__reservationRooms || [];
  document.getElementById('main-content').innerHTML = `<h1>Reserve Room</h1>
    <div class="form-grid">
      <input id="resName" placeholder="Guest / Party Name">
      <input id="resEmail" type="email" placeholder="Email">
      <input id="resPhone" placeholder="Phone">
      <select id="resRoom">${rooms.map((room) => `<option value="${room.id}">${room.room_number} - ${room.room_type} (${room.status})</option>`).join('')}</select>
      <select id="resType"><option value="room">Room</option><option value="wedding">Wedding</option><option value="birthday">Birthday</option><option value="party">Party</option><option value="event">Event</option></select>
      <input id="resPurpose" placeholder="Purpose / Notes">
      <input id="resCheckin" type="date">
      <input id="resCheckout" type="date">
      <input id="resGuests" type="number" placeholder="Guests" value="1">
      <input id="resTotal" type="number" placeholder="Total optional">
    </div>
    <button onclick="createReservation()">Reserve</button>
    <button onclick="loadReservations()">Cancel</button>`;
}

async function createReservation() {
  const room = (window.__reservationRooms || []).find((item) => String(item.id) === document.getElementById('resRoom').value);
  await api.post('/reservations', {
    guest_name: document.getElementById('resName').value,
    guest_email: document.getElementById('resEmail').value,
    guest_phone: document.getElementById('resPhone').value,
    room_id: document.getElementById('resRoom').value,
    room_name: room?.room_type || '',
    booking_type: document.getElementById('resType').value,
    event_type: document.getElementById('resType').value,
    purpose: document.getElementById('resPurpose').value,
    guests: document.getElementById('resGuests').value,
    check_in: document.getElementById('resCheckin').value,
    check_out: document.getElementById('resCheckout').value,
    total_price: document.getElementById('resTotal').value || undefined
  });
  loadReservations();
}

async function loadItems() {
  const main = document.getElementById('main-content');
  try {
    const { items } = await api.get('/items');
    main.innerHTML = `<h1>Restaurant & Store Items</h1>
      <button onclick="showItemForm()">+ Create Item</button>
      <table><tr><th>Name</th><th>Type</th><th>Category</th><th>Unit</th><th>Price</th><th>GST</th><th>Status</th></tr>
        ${tableOrEmpty(items.map((item) => `<tr><td>${item.name}</td><td>${item.item_type}</td><td>${item.category}</td><td>${item.unit}</td><td>${rs(item.price)}</td><td>${item.gst_percent}%</td><td>${item.active ? 'active' : 'inactive'}</td></tr>`))}
      </table>`;
  } catch (error) {
    main.innerHTML = `<p>${error.message}</p>`;
  }
}

function showItemForm() {
  document.getElementById('main-content').innerHTML = `<h1>Create Item</h1>
    <div class="form-grid">
      <select id="itemType"><option value="restaurant">Restaurant</option><option value="store">Store</option></select>
      <input id="itemName" placeholder="Item Name">
      <input id="itemCategory" placeholder="Category">
      <input id="itemUnit" placeholder="Unit" value="pcs">
      <input id="itemPrice" type="number" placeholder="Selling Price">
      <input id="itemCost" type="number" placeholder="Cost Price">
      <input id="itemGst" type="number" placeholder="GST %">
    </div>
    <button onclick="createItem()">Save</button>
    <button onclick="loadItems()">Cancel</button>`;
}

async function createItem() {
  await api.post('/items', {
    item_type: document.getElementById('itemType').value,
    name: document.getElementById('itemName').value,
    category: document.getElementById('itemCategory').value,
    unit: document.getElementById('itemUnit').value,
    price: document.getElementById('itemPrice').value || 0,
    cost_price: document.getElementById('itemCost').value || 0,
    gst_percent: document.getElementById('itemGst').value || 0,
    active: true
  });
  loadItems();
}

async function loadLedger(date = todayValue()) {
  const main = document.getElementById('main-content');
  try {
    const { entries, summary } = await api.get(`/ledger?date=${date}`);
    main.innerHTML = `<h1>Ledger</h1>
      <input id="ledgerDate" type="date" value="${date}">
      <button onclick="loadLedger(document.getElementById('ledgerDate').value)">Load</button>
      <button onclick="showLedgerForm()">+ Manual Entry</button>
      <div class="stats">
        <div class="stat-card"><h3>Credit</h3><p>${rs(summary.credit)}</p></div>
        <div class="stat-card"><h3>Debit</h3><p>${rs(summary.debit)}</p></div>
        <div class="stat-card"><h3>Balance</h3><p>${rs(summary.balance)}</p></div>
      </div>
      <table><tr><th>Date</th><th>Type</th><th>Description</th><th>Amount</th><th>Method</th></tr>
        ${tableOrEmpty(entries.map((entry) => `<tr><td>${entry.entry_date}</td><td>${entry.type}</td><td>${entry.description}</td><td>${rs(entry.amount)}</td><td>${entry.payment_method}</td></tr>`))}
      </table>`;
  } catch (error) {
    main.innerHTML = `<p>${error.message}</p>`;
  }
}

function showLedgerForm() {
  document.getElementById('main-content').innerHTML = `<h1>Manual Ledger Entry</h1>
    <input id="ledgerEntryDate" type="date" value="${todayValue()}">
    <select id="ledgerType"><option value="credit">Credit</option><option value="debit">Debit</option></select>
    <input id="ledgerDesc" placeholder="Description">
    <input id="ledgerAmount" type="number" placeholder="Amount">
    <input id="ledgerMethod" placeholder="Payment Method" value="cash"><br>
    <button onclick="saveLedgerEntry()">Save</button>
    <button onclick="loadLedger()">Cancel</button>`;
}

async function saveLedgerEntry() {
  await api.post('/ledger', {
    entry_date: document.getElementById('ledgerEntryDate').value,
    type: document.getElementById('ledgerType').value,
    description: document.getElementById('ledgerDesc').value,
    amount: document.getElementById('ledgerAmount').value,
    payment_method: document.getElementById('ledgerMethod').value
  });
  loadLedger(document.getElementById('ledgerEntryDate').value);
}

async function loadGstReport(from = todayValue(), to = todayValue()) {
  const main = document.getElementById('main-content');
  try {
    const report = await api.get(`/reports/gst?from=${from}&to=${to}`);
    main.innerHTML = `<h1>GST Report</h1>
      <input id="gstFrom" type="date" value="${report.from}">
      <input id="gstTo" type="date" value="${report.to}">
      <button onclick="loadGstReport(document.getElementById('gstFrom').value, document.getElementById('gstTo').value)">Load</button>
      <div class="stats">
        <div class="stat-card"><h3>Taxable</h3><p>${rs(report.summary.taxable_value)}</p></div>
        <div class="stat-card"><h3>CGST</h3><p>${rs(report.summary.cgst)}</p></div>
        <div class="stat-card"><h3>SGST</h3><p>${rs(report.summary.sgst)}</p></div>
        <div class="stat-card"><h3>Total GST</h3><p>${rs(report.summary.total_gst)}</p></div>
      </div>
      <table><tr><th>Date</th><th>Receipt</th><th>Customer</th><th>Item</th><th>Taxable</th><th>GST %</th><th>CGST</th><th>SGST</th><th>Total</th></tr>
        ${tableOrEmpty(report.rows.map((row) => `<tr><td>${row.date}</td><td>${row.receipt_number}</td><td>${row.customer_name}</td><td>${row.description}</td><td>${rs(row.taxable_value)}</td><td>${row.gst_percent}%</td><td>${rs(row.cgst)}</td><td>${rs(row.sgst)}</td><td>${rs(row.line_total)}</td></tr>`))}
      </table>`;
  } catch (error) {
    main.innerHTML = `<p>${error.message}</p>`;
  }
}
