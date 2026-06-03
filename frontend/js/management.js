const rs = (value) => `Rs ${Number(value || 0).toLocaleString()}`;
function dateInputValue(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
const todayValue = () => dateInputValue(new Date());
function displayDate(value) {
  if (!value) return '-';
  const date = new Date(String(value).length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return String(value);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}
function displayDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const time = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  return `${displayDate(date)} ${time}`;
}
const linesFromText = (text) => text.split('\n').map((line) => line.split(',').map((part) => part.trim())).filter((parts) => parts[0]);

function tableOrEmpty(rows, emptyText = 'No records found.') {
  return rows.length ? rows.join('') : `<tr><td colspan="10">${emptyText}</td></tr>`;
}

function receiptSafe(value) {
  return String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

function receiptDate(value) {
  return displayDate(value);
}

async function loadReceipts() {
  const main = document.getElementById('main-content');
  try {
    const { receipts } = await api.get('/receipts');
    main.innerHTML = `<h1>Receipts</h1>
      ${window.pmsCan?.('receipts.create') ? '<button onclick="showReceiptForm()">+ Create Receipt</button>' : ''}
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
  if (!window.pmsCan?.('receipts.create')) {
    alert('You do not have permission to create receipts.');
    return;
  }
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
      <select id="receiptMethod">
        <option value="cash">Cash</option>
        <option value="upi">UPI</option>
        <option value="card">Card</option>
      </select>
    </div>
    <textarea id="receiptItems" rows="5" placeholder="Items one per line: Description, Quantity, Rate, GST%"></textarea>
    <textarea id="receiptNotes" rows="2" placeholder="Notes"></textarea><br>
    <button onclick="createReceipt()">Save Receipt</button>
    <button onclick="loadReceipts()">Cancel</button>`;
}

async function createReceipt() {
  if (!window.pmsCan?.('receipts.create')) return;
  const paidAmount = Number(document.getElementById('receiptPaid').value || 0);
  const enteredItems = linesFromText(document.getElementById('receiptItems').value)
    .map(([description, quantity, rate, gst_percent]) => ({ description, quantity, rate, gst_percent: gst_percent || 0 }));
  const items = enteredItems.length
    ? enteredItems
    : [{ description: 'Receipt Payment', quantity: 1, rate: paidAmount, gst_percent: 0 }];

  try {
    const { receipt } = await api.post('/receipts', {
      receipt_type: document.getElementById('receiptType').value,
      customer_name: document.getElementById('receiptCustomer').value,
      customer_phone: document.getElementById('receiptPhone').value,
      customer_email: document.getElementById('receiptEmail').value,
      customer_gstin: document.getElementById('receiptGstin').value,
      event_type: document.getElementById('receiptEvent').value,
      event_date: document.getElementById('receiptEventDate').value,
      venue: document.getElementById('receiptVenue').value,
      paid_amount: paidAmount,
      discount_amount: document.getElementById('receiptDiscount').value || 0,
      payment_method: document.getElementById('receiptMethod').value,
      notes: document.getElementById('receiptNotes').value,
      items
    });
    await viewReceipt(receipt.id);
  } catch (error) {
    alert(error.message || 'Receipt could not be saved. Please fill guest name and amount.');
  }
}
async function viewReceipt(id) {
  const { receipt } = await api.get(`/receipts/${id}`);
  const items = Array.isArray(receipt.items) ? receipt.items : [];
  const itemRows = items.length ? items.map((item) => `<tr><td>${receiptSafe(item.description)}</td><td>${receiptSafe(item.quantity)}</td><td>${rs(item.rate)}</td><td>${receiptSafe(item.gst_percent)}%</td><td>${rs(item.line_total)}</td></tr>`).join('') : '<tr><td colspan="5">Receipt payment</td></tr>';
  document.getElementById('main-content').innerHTML = `
    <section class="document-screen">
      <div class="print-toolbar">
        ${window.pmsCan?.('receipts.print') ? '<button class="dark-action" onclick="saveCurrentDocumentAsPdf()">Save PDF</button><button class="green-action" onclick="printCurrentDocument()">Print Receipt</button>' : ''}
        <button class="dark-action" onclick="loadReceipts()">Back to Receipts</button>
      </div>
      <div class="print-area receipt-card">
        <div class="doc-border receipt-document">
          <header class="receipt-doc-header">
            <div class="receipt-doc-brand">
              <h1>CLUB SKYPARK</h1>
              <p>Hotel & Resort</p>
            </div>
            <div class="receipt-side-fields">
              <div class="receipt-side-line"><span>Date</span><span>${receiptDate(receipt.receipt_date)}</span></div>
              <div class="receipt-side-line"><span>Room No</span><span>${receiptSafe(receipt.venue || '')}</span></div>
              <div class="receipt-side-line"><span>Mobile No</span><span>${receiptSafe(receipt.customer_phone || '')}</span></div>
              <div class="receipt-side-line"><span>Contact No</span><span>${receiptSafe(receipt.customer_phone || '')}</span></div>
            </div>
          </header>

          <div class="receipt-title"><h2>Receipt</h2></div>
          <div class="receipt-line-grid">
            <div class="receipt-hand-line"><span>Receipt No</span><span>${receiptSafe(receipt.receipt_number)}</span></div>
            <div class="receipt-hand-line"><span>Guest Name</span><span>${receiptSafe(receipt.customer_name)}</span></div>
            <div class="receipt-hand-line"><span>Address</span><span>${receiptSafe(receipt.notes || '')}</span></div>
            <div class="receipt-hand-line"><span>Booking Amount</span><span>${rs(receipt.grand_total)}</span></div>
            <div class="receipt-hand-line"><span>Paid Amount</span><span>${rs(receipt.paid_amount)}</span></div>
            <div class="receipt-hand-line"><span>Advance Amount</span><span>${rs(receipt.paid_amount)}</span></div>
            <div class="receipt-hand-line"><span>Balance / Due Amount</span><span>${rs(receipt.balance_amount)}</span></div>
          </div>

          <table class="bill-table" style="margin-top:32px">
            <thead><tr><th>Description</th><th>Qty</th><th>Rate</th><th>GST</th><th>Total</th></tr></thead>
            <tbody>${itemRows}</tbody>
          </table>

          <h3 style="text-align:right;margin:18px 0 0">Balance / Due: ${rs(receipt.balance_amount)}</h3>

          <footer class="receipt-doc-footer">
            <section class="terms">
              <h3>Terms & Conditions</h3>
              <ol>
                <li>Payment once received is subject to hotel policy.</li>
                <li>Original receipt must be shown for adjustment or refund.</li>
                <li>Guest must follow hotel rules during the stay.</li>
              </ol>
            </section>
            <section class="receipt-signature-line"><span></span><strong>Authorized Signature</strong></section>
          </footer>
        </div>
      </div>
    </section>`;
}
function reportLabel(key) {
  return String(key || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function reportSummaryCards(summary = {}, labels = {}) {
  return Object.entries(summary).map(([key, value]) => `
    <article>
      <span>${receiptSafe(labels[key] || reportLabel(key))}</span>
      <strong>${typeof value === 'number' ? Number(value).toLocaleString('en-IN') : receiptSafe(value)}</strong>
    </article>
  `).join('');
}

function reportDocumentHeader(title, period) {
  return `
    <header class="report-doc-header">
      <div>
        <img src="images/clublogo.jpg" alt="Club Skypark" class="report-logo" onerror="this.style.display='none'">
        <h1>CLUB SKYPARK</h1>
        <p>Hotel & Resort PMS Report</p>
      </div>
      <div>
        <strong>${receiptSafe(title)}</strong>
        <span>${receiptSafe(period)}</span>
      </div>
    </header>
  `;
}

async function loadNightAudit(date = todayValue()) {
  const main = document.getElementById('main-content');
  try {
    const report = await api.get(`/reports/night-audit?date=${date}`);
    const summary = report.summary || {};
    const modes = summary.payment_modes || {};
    main.innerHTML = `
      <section class="document-screen">
        <div class="print-toolbar">
          <input id="nightAuditDate" type="date" value="${report.date}">
          <button class="dark-action" onclick="loadNightAudit(document.getElementById('nightAuditDate').value)">Load</button>
          ${window.pmsCan?.('reports.close_day') ? '<button class="dark-action" onclick="closeNightAuditDay()">Close Day</button>' : ''}
          ${window.pmsCan?.('reports.export') ? '<button class="dark-action" onclick="saveCurrentDocumentAsPdf()">Save PDF</button><button class="green-action" onclick="printCurrentDocument()">Print Night Audit</button>' : ''}
        </div>

        <div class="print-area report-document wide-report-document">
          <div class="doc-border report-border">
            <section class="report-page">
              ${reportDocumentHeader('Night Audit', displayDate(report.date))}
              <section class="report-summary-grid">
                ${reportSummaryCards({
                  total_revenue: summary.total_revenue,
                  total_checkins: summary.total_checkins,
                  total_checkout_amount: summary.total_checkout_amount,
                  expenses: summary.expenses,
                  subtotal: summary.subtotal,
                  due_amount: summary.due_amount
                }, {
                  total_revenue: 'Total Revenue Today',
                  total_checkins: 'Total Check-ins Today',
                  total_checkout_amount: 'Total Checkout Amount',
                  expenses: 'Expenses / Cash Out',
                  subtotal: 'Subtotal Revenue',
                  due_amount: 'Due Amount'
                })}
              </section>
              <h2>Payment Mode Summary</h2>
              <table class="report-table"><thead><tr><th>Cash</th><th>UPI</th><th>Card</th></tr></thead><tbody>
                <tr><td>${rs(modes.cash)}</td><td>${rs(modes.upi)}</td><td>${rs(modes.card)}</td></tr>
              </tbody></table>
            </section>

            <section class="report-section report-page">
              <h2>Check-in Rooms</h2>
              <table class="report-table"><thead><tr><th>Guest Name</th><th>Room No.</th><th>Room Category</th><th>Check-in Date</th><th>Mobile No.</th><th>Amount</th><th>Mode</th></tr></thead><tbody>
                ${tableOrEmpty((report.checkin_rooms || []).map((room) => `<tr><td>${receiptSafe(room.guest_name)}</td><td>${receiptSafe(room.room_no)}</td><td>${receiptSafe(room.room_category)}</td><td>${displayDateTime(room.check_in_date)}</td><td>${receiptSafe(room.mobile_no)}</td><td>${rs(room.amount)}</td><td>${receiptSafe(room.payment_mode || '-')}</td></tr>`))}
              </tbody></table>
            </section>

            <section class="report-section report-page">
              <h2>Check-out Rooms</h2>
              <table class="report-table"><thead><tr><th>Guest Name</th><th>Room No.</th><th>Room Category</th><th>Check-out Date</th><th>Mobile No.</th><th>Amount</th><th>Mode</th></tr></thead><tbody>
                ${tableOrEmpty((report.checkout_rooms || []).map((room) => `<tr><td>${receiptSafe(room.guest_name)}</td><td>${receiptSafe(room.room_no)}</td><td>${receiptSafe(room.room_category)}</td><td>${displayDateTime(room.check_out_date)}</td><td>${receiptSafe(room.mobile_no)}</td><td>${rs(room.amount)}</td><td>${receiptSafe(room.payment_mode || '-')}</td></tr>`))}
              </tbody></table>
            </section>

            <section class="report-section report-page">
              <h2>Continuing Rooms</h2>
              <table class="report-table"><thead><tr><th>Guest Name</th><th>Room No.</th><th>Room Category</th><th>Check-in Date</th><th>Mobile No.</th></tr></thead><tbody>
                ${tableOrEmpty((report.continuing_rooms || []).map((room) => `<tr><td>${receiptSafe(room.guest_name)}</td><td>${receiptSafe(room.room_no)}</td><td>${receiptSafe(room.room_category)}</td><td>${displayDateTime(room.check_in_date)}</td><td>${receiptSafe(room.mobile_no)}</td></tr>`))}
              </tbody></table>
            </section>

            <section class="report-section report-page">
              <h2>Restaurant Orders Summary</h2>
              <table class="report-table"><thead><tr><th>Table / Room</th><th>Items</th><th>Total</th><th>Status</th></tr></thead><tbody>
                ${tableOrEmpty((report.restaurant_orders_summary || []).map((order) => `<tr><td>${receiptSafe(order.table_number)}</td><td>${receiptSafe(order.items)}</td><td>${rs(order.total)}</td><td>${receiptSafe(order.status)}</td></tr>`))}
              </tbody></table>
            </section>

            <section class="report-section report-page">
              <h2>Room Food Summary</h2>
              <table class="report-table"><thead><tr><th>Room No.</th><th>Items</th><th>Total</th><th>Status</th></tr></thead><tbody>
                ${tableOrEmpty((report.room_food_summary || []).map((order) => `<tr><td>${receiptSafe(order.room_no)}</td><td>${receiptSafe(order.items)}</td><td>${rs(order.total)}</td><td>${receiptSafe(order.status)}</td></tr>`))}
              </tbody></table>
            </section>

            <section class="report-section report-page">
              <h2>Expenses / Cash Out</h2>
              <table class="report-table"><thead><tr><th>Date</th><th>Reason</th><th>Mode</th><th>Amount</th></tr></thead><tbody>
                ${tableOrEmpty((report.expenses_list || []).map((entry) => `<tr><td>${displayDate(entry.entry_date || entry.created_at)}</td><td>${receiptSafe(entry.description)}</td><td>${receiptSafe(entry.payment_method || '-')}</td><td>${rs(entry.amount)}</td></tr>`))}
              </tbody></table>
            </section>
          </div>
        </div>
      </section>`;
  } catch (error) {
    main.innerHTML = `<p>${error.message}</p>`;
  }
}

async function closeNightAuditDay() {
  const field = document.getElementById('nightAuditDate');
  if (!field) return;
  try {
    const { closing } = await api.post('/reports/daily/close', { date: field.value });
    const summary = closing.summary || {};
    alert(`Day closed.\nRevenue: ${rs(summary.total_revenue)}\nBookings: ${summary.total_bookings || 0}\nCheck-ins: ${summary.checkins || 0}\nCheck-outs: ${summary.checkouts || 0}\nExpenses: ${rs(summary.expenses)}\nDue: ${rs(summary.due_amount)}`);
    loadNightAudit(field.value);
  } catch (error) {
    alert(error.message || 'Day could not be closed.');
  }
}

async function loadDailyReport(date = todayValue()) {
  const main = document.getElementById('main-content');
  try {
    const report = await api.get(`/reports/daily?date=${date}`);
    main.innerHTML = `
      <section class="document-screen">
        <div class="print-toolbar">
          <input id="dailyDate" type="date" value="${report.date}">
          <button class="dark-action" onclick="loadDailyReport(document.getElementById('dailyDate').value)">Load</button>
          ${window.pmsCan?.('reports.close_day') ? '<button class="dark-action" onclick="closeDailyReport()">Close Day</button>' : ''}
          ${window.pmsCan?.('reports.export') ? '<button class="dark-action" onclick="saveCurrentDocumentAsPdf()">Save PDF</button><button class="green-action" onclick="printCurrentDocument()">Print Report</button>' : ''}
        </div>

        <div class="print-area report-document">
          <div class="doc-border report-border">
            ${reportDocumentHeader('Daily Report', displayDate(report.date))}

            <section class="report-summary-grid">
              ${reportSummaryCards(report.summary, {
                checkins: 'Check-ins',
                checkouts: 'Check-outs',
                occupied_rooms: 'Occupied Rooms',
                reserved_rooms: 'Reserved Rooms',
                vacant_rooms: 'Vacant Rooms',
                dirty_rooms: 'Dirty Rooms',
                restaurant_orders: 'Restaurant Orders',
                stock_updates: 'Stock Updates',
                receipt_total: 'Receipt Total',
                cash_received: 'Cash Received',
                expenses_total: 'Expenses / Cash Out',
                payment_cash: 'Cash Collection',
                payment_upi: 'UPI Collection',
                payment_card: 'Card Collection'
              })}
            </section>

            <section class="report-section">
              <h2>Check-ins</h2>
              <table class="report-table"><thead><tr><th>Name</th><th>Room</th><th>Mobile</th><th>Time</th></tr></thead><tbody>
                ${tableOrEmpty(report.checkins.map((g) => `<tr><td>${receiptSafe(g.name)}</td><td>${receiptSafe(g.room_number || g.room_id || '-')}</td><td>${receiptSafe(g.phone || '-')}</td><td>${displayDateTime(g.check_in_date)}</td></tr>`))}
              </tbody></table>
            </section>

            <section class="report-section">
              <h2>Check-outs</h2>
              <table class="report-table"><thead><tr><th>Name</th><th>Room</th><th>Mobile</th><th>Time</th></tr></thead><tbody>
                ${tableOrEmpty(report.checkouts.map((g) => `<tr><td>${receiptSafe(g.name)}</td><td>${receiptSafe(g.room_number || g.room_id || '-')}</td><td>${receiptSafe(g.phone || '-')}</td><td>${displayDateTime(g.check_out_date)}</td></tr>`))}
              </tbody></table>
            </section>

            <section class="report-section">
              <h2>Restaurant Orders</h2>
              <table class="report-table"><thead><tr><th>Table / Room</th><th>Items</th><th>Total</th><th>Status</th></tr></thead><tbody>
                ${tableOrEmpty(report.restaurant_orders.map((o) => `<tr><td>${receiptSafe(o.table_number)}</td><td>${receiptSafe((o.items || []).map((item) => `${item.quantity} x ${item.name}`).join(', '))}</td><td>${rs(o.total)}</td><td>${receiptSafe(o.status)}</td></tr>`))}
              </tbody></table>
            </section>

            <section class="report-section">
              <h2>Receipts and Ledger</h2>
              <table class="report-table"><thead><tr><th>Type</th><th>Description</th><th>Amount</th><th>Mode</th></tr></thead><tbody>
                ${tableOrEmpty([
                  ...report.receipts.map((receipt) => `<tr><td>Receipt</td><td>${receiptSafe(receipt.receipt_number)} - ${receiptSafe(receipt.customer_name)}</td><td>${rs(receipt.grand_total)}</td><td>${receiptSafe(receipt.payment_method || '-')}</td></tr>`),
                  ...report.ledger_entries.map((entry) => `<tr><td>${receiptSafe(entry.type)}</td><td>${receiptSafe(entry.description)}</td><td>${rs(entry.amount)}</td><td>${receiptSafe(entry.payment_method || '-')}</td></tr>`)
                ])}
              </tbody></table>
            </section>

            <section class="report-section">
              <h2>Stock Updates</h2>
              <table class="report-table"><thead><tr><th>Item</th><th>Type</th><th>Old Stock</th><th>New Stock</th><th>Reason</th></tr></thead><tbody>
                ${tableOrEmpty(report.stock_movements.map((m) => `<tr><td>${receiptSafe(m.item_name || m.store_item_id)}</td><td>${receiptSafe(m.movement_type)}</td><td>${receiptSafe(m.previous_stock)}</td><td>${receiptSafe(m.new_stock)}</td><td>${receiptSafe(m.reason || '')}</td></tr>`))}
              </tbody></table>
            </section>

            <footer class="report-signature-row">
              <span>Prepared By</span>
              <span>Manager Signature</span>
            </footer>
          </div>
        </div>
      </section>`;
  } catch (error) {
    main.innerHTML = `<p>${error.message}</p>`;
  }
}

async function closeDailyReport() {
  if (!window.pmsCan?.('reports.close_day')) return;
  try {
    const { closing } = await api.post('/reports/daily/close', { date: document.getElementById('dailyDate').value });
    const summary = closing.summary || {};
    alert(`Day closed.\nRevenue: ${rs(summary.total_revenue)}\nBookings: ${summary.total_bookings || 0}\nCheck-ins: ${summary.checkins || 0}\nCheck-outs: ${summary.checkouts || 0}\nExpenses: ${rs(summary.expenses)}\nDue: ${rs(summary.due_amount)}`);
  } catch (error) {
    alert(error.message || 'Day could not be closed.');
  }
}

async function loadStore() {
  const main = document.getElementById('main-content');
  try {
    const [{ items }, { movements }] = await Promise.all([api.get('/store-items'), api.get(`/stock-movements?date=${todayValue()}`)]);
    main.innerHTML = `<h1>Store Management</h1>
      ${window.pmsCan?.('store.create') ? '<button onclick="showStoreItemForm()">+ Add Stock Item</button>' : ''}
      <table><tr><th>Name</th><th>Category</th><th>Stock</th><th>Unit</th><th>Reorder</th><th>Action</th></tr>
        ${tableOrEmpty(items.map((item) => `<tr><td>${item.name}</td><td>${item.category}</td><td>${item.current_stock}</td><td>${item.unit}</td><td>${item.reorder_level}</td><td>${window.pmsCan?.('store.update_stock') ? `<button onclick="showStockMovement('${item.id}','${item.name}')">Update Stock</button>` : '-'}</td></tr>`))}
      </table>
      <h2>Today's Stock Updates</h2>
      <table><tr><th>Item</th><th>Type</th><th>Previous</th><th>New</th><th>Reason</th></tr>${tableOrEmpty(movements.map((m) => `<tr><td>${m.item_name || m.store_item_id}</td><td>${m.movement_type}</td><td>${m.previous_stock}</td><td>${m.new_stock}</td><td>${m.reason || ''}</td></tr>`))}</table>`;
  } catch (error) {
    main.innerHTML = `<p>${error.message}</p>`;
  }
}

function showStoreItemForm() {
  if (!window.pmsCan?.('store.create')) {
    alert('You do not have permission to create store items.');
    return;
  }
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
  if (!window.pmsCan?.('store.create')) return;
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
  if (!window.pmsCan?.('store.update_stock')) {
    alert('You do not have permission to update stock.');
    return;
  }
  document.getElementById('main-content').innerHTML = `<h1>Update Stock - ${name}</h1>
    <select id="stockType"><option value="in">In</option><option value="out">Out</option><option value="adjustment">Adjustment</option><option value="closing">Night Closing Stock</option></select>
    <input id="stockQty" type="number" placeholder="Quantity / Closing Stock">
    <input id="stockReason" placeholder="Reason">
    <textarea id="stockNote" placeholder="Note"></textarea><br>
    <button onclick="saveStockMovement('${id}')">Save</button>
    <button onclick="loadStore()">Cancel</button>`;
}

async function saveStockMovement(id) {
  if (!window.pmsCan?.('store.update_stock')) return;
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
    window.__reservations = reservations;
    main.innerHTML = `<h1>Reservation System</h1>
      <div class="table-actions">
        ${window.pmsCan?.('bookings.create') ? '<button onclick="showReservationForm()">+ Reserve Room</button>' : ''}
        ${window.pmsCan?.('bookings.bulk') ? '<button onclick="showBulkReservationForm()">+ Bulk Reserve Rooms</button>' : ''}
      </div>
      <table><tr><th>Guest</th><th>Room / Category</th><th>Dates</th><th>ETA</th><th>Group</th><th>Total</th><th>Status</th><th>Action</th></tr>
        ${tableOrEmpty(reservations.map((r) => `<tr>
          <td>${r.guest_name}<br>${r.guest_phone}</td>
          <td>${r.room_number ? `${r.room_number} (${r.room_type || r.room_name || '-'})` : (r.room_name || '-')}</td>
          <td>${displayDate(r.check_in)} to ${displayDate(r.check_out)}</td>
          <td>${r.estimated_checkin_time || '-'}</td>
          <td>${r.bulk_group_id || '-'}</td>
          <td>${rs(r.total_price)}</td>
          <td>${r.status}</td>
          <td>${r.bulk_group_id && window.pmsCan?.('checkin.bulk') ? `<button onclick="bulkCheckinGroup('${r.bulk_group_id}')">Bulk Check In</button>` : '-'}</td>
        </tr>`))}
      </table>`;
  } catch (error) {
    main.innerHTML = `<p>${error.message}</p>`;
  }
}

function showReservationForm() {
  if (!window.pmsCan?.('bookings.create')) {
    alert('You do not have permission to create reservations.');
    return;
  }
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
      <input id="resEta" type="time" value="11:00">
      <input id="resCheckout" type="date">
      <input id="resGuests" type="number" placeholder="Guests" value="1">
      <input id="resTotal" type="number" placeholder="Total optional">
    </div>
    <button onclick="createReservation()">Reserve</button>
    <button onclick="loadReservations()">Cancel</button>`;
}

async function createReservation() {
  if (!window.pmsCan?.('bookings.create')) return;
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
    estimated_checkin_time: document.getElementById('resEta').value,
    check_out: document.getElementById('resCheckout').value,
    total_price: document.getElementById('resTotal').value || undefined
  });
  loadReservations();
}

function showBulkReservationForm() {
  if (!window.pmsCan?.('bookings.bulk')) {
    alert('You do not have permission to create bulk reservations.');
    return;
  }
  document.getElementById('main-content').innerHTML = `<h1>Bulk Reservation</h1>
    <p>Use room ranges like G1-G5, 101-108, 110, 115-129.</p>
    <div class="form-grid">
      <input id="bulkName" placeholder="Wedding / Party / Group Name">
      <input id="bulkEmail" type="email" placeholder="Email optional">
      <input id="bulkPhone" placeholder="Phone">
      <select id="bulkType"><option value="wedding">Wedding</option><option value="event">Event</option><option value="party">Party</option><option value="room">Room</option><option value="other">Other</option></select>
      <input id="bulkCheckin" type="date">
      <input id="bulkEta" type="time" value="11:00">
      <input id="bulkCheckout" type="date">
      <input id="bulkGuests" type="number" min="1" value="1" placeholder="Guests per room">
      <input id="bulkPrice" type="number" min="0" placeholder="Price per room optional">
    </div>
    <textarea id="bulkRooms" rows="4" placeholder="Rooms: G1-G5, 101-108, 110, 115-129"></textarea>
    <textarea id="bulkPurpose" rows="2" placeholder="Purpose / notes">Bulk wedding reservation</textarea>
    <div class="table-actions">
      <label><input id="bulkNoId" type="checkbox" checked> No ID required</label>
      <label><input id="bulkNoGrc" type="checkbox" checked> No GRC required</label>
    </div>
    <button onclick="createBulkReservation()">Create Bulk Reservation</button>
    <button onclick="loadReservations()">Cancel</button>`;
}

async function createBulkReservation() {
  if (!window.pmsCan?.('bookings.bulk')) return;
  const response = await api.post('/reservations/bulk', {
    guest_name: document.getElementById('bulkName').value,
    guest_email: document.getElementById('bulkEmail').value,
    guest_phone: document.getElementById('bulkPhone').value,
    room_numbers: document.getElementById('bulkRooms').value,
    booking_type: document.getElementById('bulkType').value,
    event_type: document.getElementById('bulkType').value,
    purpose: document.getElementById('bulkPurpose').value,
    check_in: document.getElementById('bulkCheckin').value,
    check_out: document.getElementById('bulkCheckout').value,
    estimated_checkin_time: document.getElementById('bulkEta').value,
    guests_per_room: document.getElementById('bulkGuests').value || 1,
    total_price_per_room: document.getElementById('bulkPrice').value || 0,
    no_id_required: document.getElementById('bulkNoId').checked,
    grc_required: !document.getElementById('bulkNoGrc').checked
  });
  alert(`Bulk reservation created for ${response.reservations?.length || 0} rooms. Group ID: ${response.group_id}`);
  loadReservations();
}

async function bulkCheckinGroup(groupId) {
  if (!window.pmsCan?.('checkin.bulk')) {
    alert('You do not have permission for bulk check-in.');
    return;
  }
  if (!confirm(`Bulk check-in all pending rooms in ${groupId}? ID proof and GRC will be skipped for these wedding/group records.`)) return;
  const response = await api.post(`/reservations/bulk/${groupId}/checkin`, {});
  alert(`Bulk check-in completed for ${response.guests?.length || 0} rooms.`);
  loadReservations();
}

async function loadItems() {
  const main = document.getElementById('main-content');
  try {
    const { items } = await api.get('/items');
    main.innerHTML = `<h1>Restaurant & Store Items</h1>
      ${window.pmsCan?.('items.create') ? '<button onclick="showItemForm()">+ Create Item</button>' : ''}
      <table><tr><th>Name</th><th>Type</th><th>Category</th><th>Unit</th><th>Price</th><th>GST</th><th>Status</th></tr>
        ${tableOrEmpty(items.map((item) => `<tr><td>${item.name}</td><td>${item.item_type}</td><td>${item.category}</td><td>${item.unit}</td><td>${rs(item.price)}</td><td>${item.gst_percent}%</td><td>${item.active ? 'active' : 'inactive'}</td></tr>`))}
      </table>`;
  } catch (error) {
    main.innerHTML = `<p>${error.message}</p>`;
  }
}

function showItemForm() {
  if (!window.pmsCan?.('items.create')) {
    alert('You do not have permission to create items.');
    return;
  }
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
  if (!window.pmsCan?.('items.create')) return;
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
    main.innerHTML = `
      <section class="document-screen">
        <div class="print-toolbar">
          <input id="ledgerDate" type="date" value="${date}">
          <button class="dark-action" onclick="loadLedger(document.getElementById('ledgerDate').value)">Load</button>
          ${window.pmsCan?.('ledger.create') ? '<button class="dark-action" onclick="showLedgerForm()">+ Manual Entry</button>' : ''}
          ${window.pmsCan?.('reports.export') ? '<button class="dark-action" onclick="saveCurrentDocumentAsPdf()">Save PDF</button><button class="green-action" onclick="printCurrentDocument()">Print Ledger</button>' : ''}
        </div>

        <div class="print-area report-document">
          <div class="doc-border report-border">
            ${reportDocumentHeader('Cash / Store Ledger', displayDate(date))}

            <section class="report-summary-grid three">
              <article><span>Credit</span><strong>${rs(summary.credit)}</strong></article>
              <article><span>Debit</span><strong>${rs(summary.debit)}</strong></article>
              <article><span>Balance</span><strong>${rs(summary.balance)}</strong></article>
            </section>

            <section class="report-section">
              <h2>Ledger Entries</h2>
              <table class="report-table"><thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Amount</th><th>Payment Method</th></tr></thead><tbody>
                ${tableOrEmpty(entries.map((entry) => `<tr><td>${displayDate(entry.entry_date)}</td><td>${receiptSafe(entry.type)}</td><td>${receiptSafe(entry.description)}</td><td>${rs(entry.amount)}</td><td>${receiptSafe(entry.payment_method || '-')}</td></tr>`))}
              </tbody></table>
            </section>

            <footer class="report-signature-row">
              <span>Prepared By</span>
              <span>Manager Signature</span>
            </footer>
          </div>
        </div>
      </section>`;
  } catch (error) {
    main.innerHTML = `<p>${error.message}</p>`;
  }
}

function showLedgerForm() {
  if (!window.pmsCan?.('ledger.create')) {
    alert('You do not have permission to create ledger entries.');
    return;
  }
  document.getElementById('main-content').innerHTML = `<h1>Manual Ledger Entry</h1>
    <input id="ledgerEntryDate" type="date" value="${todayValue()}">
    <select id="ledgerType"><option value="credit">Credit</option><option value="debit">Debit</option></select>
    <input id="ledgerDesc" placeholder="Description">
    <input id="ledgerAmount" type="number" placeholder="Amount">
    <select id="ledgerMethod">
      <option value="cash">Cash</option>
      <option value="upi">UPI</option>
      <option value="card">Card</option>
    </select><br>
    <button onclick="saveLedgerEntry()">Save</button>
    <button onclick="loadLedger()">Cancel</button>`;
}

async function loadExpenses(date = todayValue()) {
  const main = document.getElementById('main-content');
  try {
    const { entries, summary } = await api.get(`/ledger?date=${date}`);
    const expenses = entries.filter((entry) => entry.type === 'debit');
    main.innerHTML = `
      <section class="panel">
        <div class="module-title-row">
          <h1>Expenses / Cash Out</h1>
          ${window.pmsCan?.('ledger.create') ? '<button onclick="showExpenseForm()">+ Add Cash Out</button>' : ''}
        </div>
        <div class="date-row compact-date-row">
          <input id="expenseDate" type="date" value="${date}">
          <button onclick="loadExpenses(document.getElementById('expenseDate').value)">Search</button>
        </div>
        <div class="report-summary-grid three">
          <article><span>Today Cash Out</span><strong>${rs(summary.debit)}</strong></article>
          <article><span>Cash In</span><strong>${rs(summary.credit)}</strong></article>
          <article><span>Net Balance</span><strong>${rs(summary.balance)}</strong></article>
        </div>
        <table class="checkin-report-table">
          <thead><tr><th>Date</th><th>Reason</th><th>Payment Mode</th><th>Amount</th></tr></thead>
          <tbody>${tableOrEmpty(expenses.map((entry) => `<tr><td>${displayDate(entry.entry_date || entry.created_at)}</td><td>${receiptSafe(entry.description)}</td><td>${receiptSafe(entry.payment_method || '-')}</td><td>${rs(entry.amount)}</td></tr>`))}</tbody>
        </table>
      </section>`;
  } catch (error) {
    main.innerHTML = `<p>${error.message}</p>`;
  }
}

function showExpenseForm() {
  if (!window.pmsCan?.('ledger.create')) {
    alert('You do not have permission to add expenses.');
    return;
  }
  document.getElementById('main-content').innerHTML = `
    <section class="panel">
      <h1>Add Expenses / Cash Out</h1>
      <div class="form-grid">
        <input id="expenseEntryDate" type="date" value="${todayValue()}">
        <input id="expenseReason" placeholder="Reason">
        <input id="expenseAmount" type="number" min="0" placeholder="Amount">
        <select id="expenseMethod">
          <option value="cash">Cash</option>
          <option value="upi">UPI</option>
          <option value="card">Card</option>
        </select>
      </div>
      <button onclick="saveExpenseEntry()">Save Cash Out</button>
      <button onclick="loadExpenses()">Cancel</button>
    </section>`;
}

async function saveExpenseEntry() {
  if (!window.pmsCan?.('ledger.create')) return;
  const amount = Number(document.getElementById('expenseAmount').value || 0);
  const reason = document.getElementById('expenseReason').value.trim();
  if (!reason || amount <= 0) {
    alert('Please enter expense reason and amount.');
    return;
  }
  await api.post('/ledger', {
    entry_date: document.getElementById('expenseEntryDate').value,
    type: 'debit',
    description: reason,
    amount,
    payment_method: document.getElementById('expenseMethod').value
  });
  loadExpenses(document.getElementById('expenseEntryDate').value);
}

function attendanceStatusOptions(selected = 'Present') {
  return ['Present', 'Absent', 'Half Day', 'Paid Leave', 'Unpaid Leave', 'Week Off']
    .map((status) => `<option value="${status}" ${status === selected ? 'selected' : ''}>${status}</option>`)
    .join('');
}

function attendanceQueryFromFilters() {
  const date = document.getElementById('attendanceFilterDate')?.value || '';
  const month = document.getElementById('attendanceFilterMonth')?.value || '';
  const staffName = document.getElementById('attendanceFilterStaff')?.value || '';
  const department = document.getElementById('attendanceFilterDepartment')?.value || '';
  const status = document.getElementById('attendanceFilterStatus')?.value || '';
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  else if (month) params.set('month', month);
  if (staffName) params.set('staffName', staffName);
  if (department) params.set('department', department);
  if (status) params.set('status', status);
  return params.toString();
}

function attendanceMonthValue(value = todayValue()) {
  return String(value).slice(0, 7);
}

async function loadStaffAttendance(date = todayValue()) {
  const main = document.getElementById('main-content');
  try {
    const month = attendanceMonthValue(date);
    const [{ attendance }, summaryResponse] = await Promise.all([
      api.get(`/attendance?month=${month}`),
      api.get(`/attendance/summary?month=${month}`)
    ]);
    main.innerHTML = `
      <section class="panel attendance-page">
        <div class="module-title-row">
          <h1>Attendance</h1>
          <div class="table-actions">
            ${window.pmsCan?.('staff.attendance') ? '<button onclick="showAttendanceForm()">+ Add Attendance</button>' : ''}
            <button onclick="exportAttendanceCsv()">Export CSV</button>
            <button onclick="printAttendanceReport()">Print Monthly Report</button>
          </div>
        </div>
        <div class="form-grid attendance-filter-grid">
          <label>Filter by Date<input id="attendanceFilterDate" type="date"></label>
          <label>Filter by Month<input id="attendanceFilterMonth" type="month" value="${month}"></label>
          <label>Staff Name<input id="attendanceFilterStaff" placeholder="Staff name"></label>
          <label>Department<input id="attendanceFilterDepartment" placeholder="Department"></label>
          <label>Status<select id="attendanceFilterStatus"><option value="">All Status</option>${attendanceStatusOptions('')}</select></label>
          <button onclick="filterAttendance()">Search</button>
        </div>

        <div id="attendanceTableMount">${renderAttendanceTable(attendance || [])}</div>

        <h2>Monthly Summary</h2>
        <div id="attendanceSummaryMount">${renderAttendanceSummary(summaryResponse.summary || [])}</div>
      </section>`;
  } catch (error) {
    main.innerHTML = `<p>${error.message}</p>`;
  }
}

function renderAttendanceTable(rows) {
  window.__attendanceRows = rows || [];
  return `
    <table class="checkin-report-table">
      <thead><tr><th>Date</th><th>Staff Name</th><th>Staff ID</th><th>Department</th><th>Shift</th><th>In Time</th><th>Out Time</th><th>Status</th><th>Total Hours</th><th>Remarks</th><th>Actions</th></tr></thead>
      <tbody>${tableOrEmpty((rows || []).map((row) => `<tr>
        <td>${displayDate(row.date)}</td>
        <td>${receiptSafe(row.staffName)}</td>
        <td>${receiptSafe(row.staffId)}</td>
        <td>${receiptSafe(row.department)}</td>
        <td>${receiptSafe(row.shift)}</td>
        <td>${receiptSafe(row.inTime || '-')}</td>
        <td>${receiptSafe(row.outTime || '-')}</td>
        <td>${receiptSafe(row.status)}</td>
        <td>${receiptSafe(row.totalHours || 0)}</td>
        <td>${receiptSafe(row.remarks || '-')}</td>
        <td><button onclick="showAttendanceForm('${row.id}')">Edit</button><button class="red-action" onclick="deleteAttendance('${row.id}')">Delete</button></td>
      </tr>`))}</tbody>
    </table>`;
}

function renderAttendanceSummary(rows) {
  return `
    <table class="checkin-report-table">
      <thead><tr><th>Staff Name</th><th>Staff ID</th><th>Department</th><th>Present Days</th><th>Absent Days</th><th>Half Days</th><th>Paid Leaves</th><th>Unpaid Leaves</th><th>Week Offs</th><th>Total Working Hours</th></tr></thead>
      <tbody>${tableOrEmpty((rows || []).map((row) => `<tr>
        <td>${receiptSafe(row.staffName)}</td>
        <td>${receiptSafe(row.staffId)}</td>
        <td>${receiptSafe(row.department)}</td>
        <td>${row.presentDays || 0}</td>
        <td>${row.absentDays || 0}</td>
        <td>${row.halfDays || 0}</td>
        <td>${row.paidLeaves || 0}</td>
        <td>${row.unpaidLeaves || 0}</td>
        <td>${row.weekOffs || 0}</td>
        <td>${row.totalWorkingHours || 0}</td>
      </tr>`), 'No monthly summary found.')}</tbody>
    </table>`;
}

async function filterAttendance() {
  const query = attendanceQueryFromFilters();
  const month = document.getElementById('attendanceFilterMonth')?.value || todayValue().slice(0, 7);
  const [rows, summary] = await Promise.all([
    api.get(`/attendance?${query}`),
    api.get(`/attendance/summary?month=${month}&staffName=${encodeURIComponent(document.getElementById('attendanceFilterStaff')?.value || '')}&department=${encodeURIComponent(document.getElementById('attendanceFilterDepartment')?.value || '')}&status=${encodeURIComponent(document.getElementById('attendanceFilterStatus')?.value || '')}`)
  ]);
  document.getElementById('attendanceTableMount').innerHTML = renderAttendanceTable(rows.attendance || []);
  document.getElementById('attendanceSummaryMount').innerHTML = renderAttendanceSummary(summary.summary || []);
}

function showAttendanceForm(id = '') {
  if (!window.pmsCan?.('staff.attendance')) return;
  const record = (window.__attendanceRows || []).find((row) => String(row.id) === String(id)) || {};
  document.getElementById('main-content').innerHTML = `
    <section class="panel">
      <h1>${id ? 'Edit' : 'Add'} Attendance</h1>
      <div class="form-grid">
        <input id="attendanceId" type="hidden" value="${receiptSafe(id)}">
        <label>Date<input id="attendanceEntryDate" type="date" value="${record.date || todayValue()}"></label>
        <label>Staff Name<input id="attendanceStaffName" placeholder="Staff name" value="${receiptSafe(record.staffName || '')}"></label>
        <label>Staff ID<input id="attendanceStaffId" placeholder="EMP001" value="${receiptSafe(record.staffId || '')}"></label>
        <label>Department<input id="attendanceDepartment" placeholder="Reception" value="${receiptSafe(record.department || '')}"></label>
        <label>Shift<input id="attendanceShift" placeholder="Morning" value="${receiptSafe(record.shift || 'Morning')}"></label>
        <label>In Time<input id="attendanceIn" type="time" value="${receiptSafe(record.inTime || '')}"></label>
        <label>Out Time<input id="attendanceOut" type="time" value="${receiptSafe(record.outTime || '')}"></label>
        <label>Status<select id="attendanceStatus">${attendanceStatusOptions(record.status || 'Present')}</select></label>
        <label>Total Hours<input id="attendanceTotalHours" type="number" value="${receiptSafe(record.totalHours || 0)}" readonly></label>
        <label>Remarks<input id="attendanceRemarks" placeholder="Remarks" value="${receiptSafe(record.remarks || '')}"></label>
      </div>
      <button onclick="saveStaffAttendance()">${id ? 'Save Changes' : 'Save Attendance'}</button>
      <button onclick="loadStaffAttendance()">Cancel</button>
    </section>`;
  ['attendanceIn', 'attendanceOut', 'attendanceStatus'].forEach((inputId) => {
    document.getElementById(inputId)?.addEventListener('change', updateAttendanceTotalHours);
  });
  updateAttendanceTotalHours();
}

function calculateBrowserAttendanceHours() {
  const status = document.getElementById('attendanceStatus')?.value || 'Present';
  if (['Absent', 'Paid Leave', 'Unpaid Leave', 'Week Off'].includes(status)) return 0;
  const inTime = document.getElementById('attendanceIn')?.value;
  const outTime = document.getElementById('attendanceOut')?.value;
  if (!inTime || !outTime) return 0;
  const [ih, im] = inTime.split(':').map(Number);
  const [oh, om] = outTime.split(':').map(Number);
  let start = ih * 60 + im;
  let end = oh * 60 + om;
  if (end < start) end += 1440;
  return Math.round(((end - start) / 60 + Number.EPSILON) * 100) / 100;
}

function updateAttendanceTotalHours() {
  const field = document.getElementById('attendanceTotalHours');
  if (field) field.value = calculateBrowserAttendanceHours();
}

async function saveStaffAttendance() {
  if (!window.pmsCan?.('staff.attendance')) return;
  const id = document.getElementById('attendanceId').value;
  const staffName = document.getElementById('attendanceStaffName').value.trim();
  const staffId = document.getElementById('attendanceStaffId').value.trim();
  const department = document.getElementById('attendanceDepartment').value.trim();
  if (!staffName || !staffId || !department || !document.getElementById('attendanceEntryDate').value) {
    alert('Date, staff name, staff ID and department are required.');
    return;
  }
  const payload = {
    staffName,
    staffId,
    department,
    date: document.getElementById('attendanceEntryDate').value,
    shift: document.getElementById('attendanceShift').value,
    status: document.getElementById('attendanceStatus').value,
    inTime: document.getElementById('attendanceIn').value,
    outTime: document.getElementById('attendanceOut').value,
    remarks: document.getElementById('attendanceRemarks').value
  };
  try {
    if (id) await api.put(`/attendance/${id}`, payload);
    else await api.post('/attendance', payload);
  } catch (error) {
    alert(error.message || 'Attendance could not be saved.');
    return;
  }
  loadStaffAttendance(document.getElementById('attendanceEntryDate').value);
}

async function deleteAttendance(id) {
  if (!window.pmsCan?.('staff.attendance')) return;
  if (!confirm('Delete this attendance record?')) return;
  await api.delete(`/attendance/${id}`);
  filterAttendance();
}

function exportAttendanceCsv() {
  const rows = window.__attendanceRows || [];
  const header = ['Date', 'Staff Name', 'Staff ID', 'Department', 'Shift', 'In Time', 'Out Time', 'Status', 'Total Hours', 'Remarks'];
  const csv = [header, ...rows.map((row) => [row.date, row.staffName, row.staffId, row.department, row.shift, row.inTime, row.outTime, row.status, row.totalHours, row.remarks])]
    .map((cols) => cols.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `club-skypark-attendance-${todayValue()}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function printAttendanceReport() {
  printCurrentDocument();
}

async function saveLedgerEntry() {
  if (!window.pmsCan?.('ledger.create')) return;
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
    main.innerHTML = `
      <section class="document-screen">
        <div class="print-toolbar">
          <input id="gstFrom" type="date" value="${report.from}">
          <input id="gstTo" type="date" value="${report.to}">
          <button class="dark-action" onclick="loadGstReport(document.getElementById('gstFrom').value, document.getElementById('gstTo').value)">Load</button>
          ${window.pmsCan?.('reports.export') ? '<button class="dark-action" onclick="saveCurrentDocumentAsPdf()">Save PDF</button><button class="green-action" onclick="printCurrentDocument()">Print GST</button>' : ''}
        </div>

        <div class="print-area report-document wide-report-document">
          <div class="doc-border report-border">
            ${reportDocumentHeader('GST Report', `${displayDate(report.from)} to ${displayDate(report.to)}`)}

            <section class="report-summary-grid">
              <article><span>Taxable Value</span><strong>${rs(report.summary.taxable_value)}</strong></article>
              <article><span>CGST</span><strong>${rs(report.summary.cgst)}</strong></article>
              <article><span>SGST</span><strong>${rs(report.summary.sgst)}</strong></article>
              <article><span>IGST</span><strong>${rs(report.summary.igst)}</strong></article>
              <article><span>Total GST</span><strong>${rs(report.summary.total_gst)}</strong></article>
              <article><span>Grand Total</span><strong>${rs(report.summary.grand_total)}</strong></article>
            </section>

            <section class="report-section">
              <h2>GST Line Details</h2>
              <table class="report-table gst-report-table"><thead><tr><th>Date</th><th>Receipt</th><th>Customer</th><th>GSTIN</th><th>Item</th><th>Taxable</th><th>GST %</th><th>CGST</th><th>SGST</th><th>Total</th></tr></thead><tbody>
                ${tableOrEmpty(report.rows.map((row) => `<tr><td>${displayDate(row.date)}</td><td>${receiptSafe(row.receipt_number)}</td><td>${receiptSafe(row.customer_name)}</td><td>${receiptSafe(row.customer_gstin || '-')}</td><td>${receiptSafe(row.description)}</td><td>${rs(row.taxable_value)}</td><td>${receiptSafe(row.gst_percent)}%</td><td>${rs(row.cgst)}</td><td>${rs(row.sgst)}</td><td>${rs(row.line_total)}</td></tr>`))}
              </tbody></table>
            </section>

            <footer class="report-signature-row">
              <span>Prepared By</span>
              <span>Accounts Signature</span>
            </footer>
          </div>
        </div>
      </section>`;
  } catch (error) {
    main.innerHTML = `<p>${error.message}</p>`;
  }
}
