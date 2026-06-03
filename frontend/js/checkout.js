let checkoutState = {
  activeGuests: [],
  restaurantOrders: [],
  selectedGuestId: '',
  totals: null,
  billGuest: null
};

function coEscape(value) {
  return String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

function coMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function coRs(value) {
  return coMoney(value).toFixed(2);
}

function coDateInput(value = new Date()) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function coTimeInput(value = new Date()) {
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function coDateDisplay(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}

function coTimeDisplay(value) {
  if (!value) return '-';
  return new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function coDateTimeDisplay(value) {
  if (!value) return '-';
  return `${coDateDisplay(value)} ${coTimeDisplay(value)}`;
}

function coDaysBetween(checkIn, checkOut = new Date()) {
  const days = Math.ceil((new Date(checkOut) - new Date(checkIn)) / 86400000);
  return Math.max(1, Number.isFinite(days) ? days : 1);
}

function getCheckoutGuest(id = checkoutState.selectedGuestId) {
  return checkoutState.activeGuests.find((guest) => String(guest.id) === String(id)) || null;
}

async function fetchCheckoutOrders() {
  try {
    const { orders } = await api.get('/restaurant-orders');
    return orders || [];
  } catch (error) {
    console.warn(error);
    return [];
  }
}

function guestFoodLines(guest) {
  if (!guest) return [];
  const roomNumber = String(guest.room_number || '').toLowerCase();
  const checkInTime = guest.check_in_date ? new Date(guest.check_in_date).getTime() : 0;

  return checkoutState.restaurantOrders
    .filter((order) => {
      const sameRoom = String(order.table_number || '').toLowerCase() === roomNumber;
      const sameGuest = order.guest_id && String(order.guest_id) === String(guest.id);
      const afterCheckin = !order.created_at || new Date(order.created_at).getTime() >= checkInTime;
      return (sameGuest || sameRoom) && afterCheckin && order.status !== 'paid';
    })
    .flatMap((order) => (order.items || []).map((item) => {
      const quantity = Number(item.quantity || 1);
      const rate = Number(item.price || 0);
      const taxable = coMoney(quantity * rate);
      const gst = coMoney(taxable * Number(item.gst_percent || 0) / 100);
      return {
        name: item.name || 'Item',
        item_amount: rate,
        quantity,
        amount: taxable,
        gst_percent: Number(item.gst_percent || 0),
        total: coMoney(taxable + gst),
        date: coDateDisplay(order.created_at)
      };
    }));
}

function calculateCheckoutTotals(guest) {
  const days = Number(guest?.days || coDaysBetween(guest?.check_in_date));
  const rate = Number(guest?.room_rate || 0);
  const roomBase = coMoney(rate * days);
  const roomDiscount = coMoney(guest?.discount_amount || 0);
  const roomRent = coMoney(Math.max(0, roomBase - roomDiscount));
  const gstPercent = guest?.bill_type === 'without_gst' ? 0 : 5;
  const gstAmount = coMoney(roomRent * gstPercent / 100);
  const foodLines = guestFoodLines(guest);
  const foodCharges = coMoney(foodLines.reduce((sum, item) => sum + item.total, 0));
  const totalBill = coMoney(roomRent + foodCharges + gstAmount);
  const lessAdvance = coMoney(guest?.advance_amount || 0);
  const netPayable = coMoney(Math.max(0, totalBill - lessAdvance));
  const discountAmount = coMoney(document.getElementById('coDiscount')?.value || 0);
  const payAfterDiscount = coMoney(Math.max(0, netPayable - discountAmount));

  return {
    days,
    rate,
    gstPercent,
    roomDiscount,
    roomRent,
    gstAmount,
    foodLines,
    foodCharges,
    totalBill,
    lessAdvance,
    netPayable,
    discountAmount,
    payAfterDiscount
  };
}

async function loadCheckout(selectedGuestId = '') {
  const main = document.getElementById('main-content');
  const [{ guests }, orders] = await Promise.all([
    api.get('/guests/active'),
    fetchCheckoutOrders()
  ]);

  checkoutState.activeGuests = guests || [];
  checkoutState.restaurantOrders = orders || [];
  checkoutState.selectedGuestId = selectedGuestId || checkoutState.activeGuests[0]?.id || '';

  main.innerHTML = `
    <section class="checkout-page">
      <div class="module-title-row checkout-title-row">
        <h1>CHECK OUT</h1>
        <div class="breadcrumb"><span>Home</span> / CHECK OUT</div>
      </div>
      <div class="checkout-panel">
        <div class="checkout-panel-title"><span>CHECK OUT</span><button onclick="loadModule('dashboard')">-</button></div>
        <div class="checkout-panel-body">
          <div class="checkout-guest-picker">
            <label class="field">Select Active Guest
              <select id="coGuestSelect" onchange="renderCheckoutForm(this.value)">
                ${checkoutState.activeGuests.length ? checkoutState.activeGuests.map((guest) => `<option value="${guest.id}" ${String(guest.id) === String(checkoutState.selectedGuestId) ? 'selected' : ''}>${coEscape(guest.check_in_no || guest.id)} - ${coEscape(guest.name)} - ${coEscape(guest.room_number || '')}</option>`).join('') : '<option value="">No active guests available</option>'}
              </select>
            </label>
          </div>
          <div id="checkoutFormMount"></div>
        </div>
      </div>
    </section>
  `;

  renderCheckoutForm(checkoutState.selectedGuestId);
}

function renderCheckoutForm(guestId) {
  checkoutState.selectedGuestId = guestId || '';
  const mount = document.getElementById('checkoutFormMount');
  if (!mount) return;
  const guest = getCheckoutGuest(guestId);

  if (!guest) {
    mount.innerHTML = '<p>No active check-ins are available for checkout.</p>';
    return;
  }

  const totals = calculateCheckoutTotals(guest);
  checkoutState.totals = totals;
  const canDiscount = window.pmsCan?.('checkout.discount');
  const canCreateCheckout = window.pmsCan?.('checkout.create');

  mount.innerHTML = `
    <div class="checkout-layout">
      <div class="checkout-left">
        <div class="section-strip">Room Details</div>
        <div class="checkout-table-box room-box">
          <table class="checkout-bill-table">
            <thead><tr><th>Room No.</th><th>Type</th><th>Rate</th><th>GST%</th><th>D.%</th><th>Disc.</th><th>Plan</th></tr></thead>
            <tbody><tr>
              <td>${coEscape(guest.room_number || '-')}</td>
              <td>${coEscape(guest.room_type || '-')}</td>
              <td>${coRs(totals.rate)}</td>
              <td>${coRs(totals.gstPercent)}</td>
              <td>${coRs(guest.discount_percent || 0)}</td>
              <td>${coRs(totals.roomDiscount)}</td>
              <td>${coEscape(guest.room_plan || 'CP')}</td>
            </tr></tbody>
          </table>
        </div>

        <div class="section-strip">Food & Other Details</div>
        <div class="checkout-table-box food-box">
          <table class="checkout-bill-table">
            <thead><tr><th>Item Name</th><th>Item Amount</th><th>Qty</th><th>Amount</th><th>GST%</th><th>Total</th><th>Date</th></tr></thead>
            <tbody>${totals.foodLines.length ? totals.foodLines.map((item) => `
              <tr><td>${coEscape(item.name)}</td><td>${coRs(item.item_amount)}</td><td>${item.quantity}</td><td>${coRs(item.amount)}</td><td>${coRs(item.gst_percent)}</td><td>${coRs(item.total)}</td><td>${coEscape(item.date)}</td></tr>
            `).join('') : '<tr><td colspan="7">No food or other charges found.</td></tr>'}</tbody>
          </table>
        </div>
      </div>

      <div class="checkout-right">
        <div class="checkout-form-grid">
          <label class="field">Check in Date<input type="date" value="${coDateInput(guest.check_in_date)}" readonly></label>
          <label class="field">Check in Time<input type="time" value="${coTimeInput(guest.check_in_date)}" readonly></label>
          <label class="field">Check Out Date<input id="coDate" type="date" value="${coDateInput()}"></label>
          <label class="field">Check Out Time<input id="coTime" type="time" value="${coTimeInput()}"></label>
          <label class="field">Check in No.<input type="text" value="${coEscape(guest.check_in_no || guest.id)}" readonly></label>
          <label class="field span-3">Name of Visitor<input type="text" value="${coEscape(guest.name)}" readonly></label>
        </div>

        <div class="checkout-amount-grid">
          <label class="field">Days<input id="coDays" type="text" value="${totals.days}" readonly></label>
          <label class="field">Room Rent<input id="coRoomRent" type="text" value="${coRs(totals.roomRent)}" readonly></label>
          <label class="field">Food & Other Charges<input id="coFood" type="text" value="${coRs(totals.foodCharges)}" readonly></label>
          <label class="field">GST Amount<input id="coGst" type="text" value="${coRs(totals.gstAmount)}" readonly></label>
          <label class="field">CGST<input type="text" value="${coRs(totals.gstAmount / 2)}" readonly></label>
          <label class="field">SGST<input type="text" value="${coRs(totals.gstAmount / 2)}" readonly></label>
        </div>

        <div class="checkout-summary">
          <label>Total Bill Amt<input id="coTotalBill" type="text" value="${coRs(totals.totalBill)}" readonly></label>
          <label>Less: Advance<input id="coAdvance" type="text" value="${coRs(totals.lessAdvance)}" readonly></label>
          <label>Net Payble Amt<input id="coNetPayable" type="text" value="${coRs(totals.netPayable)}" readonly></label>
          <label>Discount Amt<input id="coDiscount" type="number" min="0" value="${coRs(totals.discountAmount)}" oninput="updateCheckoutTotals()" ${canDiscount ? '' : 'readonly'}></label>
          <label>Pay after discount<input id="coPayAfterDiscount" type="text" value="${coRs(totals.payAfterDiscount)}" readonly></label>
        </div>

        <div class="checkout-payment-mode">Payment Mode
          <span class="radio-line"><input type="radio" name="coPaymentMode" value="cash" checked> Cash</span>
          <span class="radio-line"><input type="radio" name="coPaymentMode" value="upi"> UPI</span>
          <span class="radio-line"><input type="radio" name="coPaymentMode" value="card"> Card</span>
          <span class="radio-line"><input type="radio" name="coPaymentMode" value="credit"> Credit</span>
        </div>

        <div class="checkout-save-row">
          <label class="field remark-field">Remark<input id="coRemark" type="text"></label>
          ${canCreateCheckout ? '<button class="save-checkin" onclick="saveCheckout()">SAVE</button>' : ''}
        </div>
      </div>
    </div>
  `;
}

function updateCheckoutTotals() {
  const guest = getCheckoutGuest();
  if (!guest) return;
  const totals = calculateCheckoutTotals(guest);
  checkoutState.totals = totals;
  document.getElementById('coPayAfterDiscount').value = coRs(totals.payAfterDiscount);
}

function coRadioValue(name) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value || '';
}

async function saveCheckout() {
  if (!window.pmsCan?.('checkout.create')) {
    alert('You do not have permission to complete checkout.');
    return;
  }
  const guest = getCheckoutGuest();
  if (!guest) {
    alert('Please select a guest to checkout.');
    return;
  }
  updateCheckoutTotals();
  const totals = checkoutState.totals || calculateCheckoutTotals(guest);
  if (Number(document.getElementById('coDiscount').value || 0) > 0 && !window.pmsCan?.('checkout.discount')) {
    alert('You do not have permission to give checkout discount.');
    return;
  }
  const checkoutAt = `${document.getElementById('coDate').value}T${document.getElementById('coTime').value || '00:00'}`;

  const { guest: checkedOutGuest } = await api.post(`/checkouts/${guest.id}`, {
    checkout_at: checkoutAt,
    room_rent: totals.roomRent,
    food_charges: totals.foodCharges,
    gst_amount: totals.gstAmount,
    total_bill_amount: totals.totalBill,
    less_advance: totals.lessAdvance,
    net_payable: totals.netPayable,
    discount_amount: document.getElementById('coDiscount').value || 0,
    pay_after_discount: totals.payAfterDiscount,
    payment_mode: coRadioValue('coPaymentMode'),
    remark: document.getElementById('coRemark').value,
    food_items: totals.foodLines
  });

  showCheckoutBill(checkedOutGuest);
}

function checkoutGuest(id) {
  if (!window.pmsCan?.('checkout.create') && !window.pmsCan?.('checkout.view')) return;
  loadCheckout(id);
}

function checkoutListShell(title, body) {
  const main = document.getElementById('main-content');
  main.innerHTML = `
    <section class="checkout-page">
      <div class="module-title-row checkout-title-row"><h1>${title}</h1><div class="breadcrumb"><span>Home</span> / CHECK OUT</div></div>
      <div class="checkout-panel"><div class="checkout-panel-title"><span>${title}</span><button onclick="loadModule('dashboard')">-</button></div><div class="checkout-panel-body">${body}</div></div>
    </section>
  `;
}

function renderCheckoutRows(guests, options = {}) {
  return guests.length ? guests.map((guest) => `
    <tr>
      <td>${coEscape(guest.check_in_no || guest.id)}</td>
      <td>${coEscape(guest.name)}</td>
      <td>${coEscape(guest.phone || '')}</td>
      <td>${coEscape(guest.room_number || '-')} (${coEscape(guest.room_type || '-')})</td>
      <td>${coDateTimeDisplay(guest.check_in_date)}</td>
      <td>${coDateTimeDisplay(guest.check_out_date)}</td>
      <td>Rs ${coRs(guest.checkout_total_bill_amount || 0)}</td>
      <td>Rs ${coRs(guest.checkout_pay_after_discount || 0)}</td>
      <td>${coEscape(guest.checkout_payment_mode || '-')}</td>
      <td>${coEscape(guest.status || '-')}</td>
      ${options.actions ? `<td>${options.actions(guest)}</td>` : ''}
    </tr>
  `).join('') : `<tr><td colspan="${options.actions ? 11 : 10}">No records found.</td></tr>`;
}

async function loadCheckoutList() {
  const { guests } = await api.get('/checkouts?status=completed');
  checkoutListShell('CHECK OUT LIST', `
    <div class="table-actions">${window.pmsCan?.('checkout.create') ? '<button class="green-action" onclick="loadCheckout()">New Check Out</button>' : ''}</div>
    <table class="checkin-report-table"><thead><tr><th>Check-in No</th><th>Name</th><th>Mobile</th><th>Room Details</th><th>Check-in Time</th><th>Check-out Time</th><th>Total Bill</th><th>Paid</th><th>Payment</th><th>Status</th><th>Action</th></tr></thead><tbody>${renderCheckoutRows(guests, { actions: (guest) => `
      ${window.pmsCan?.('checkout.print_bill') ? `<button class="green-action" onclick="showCheckoutBillById('${guest.id}')">Print Bill</button>` : ''}
      ${!window.pmsCan?.('checkout.print_bill') ? '-' : ''}
    ` })}</tbody></table>
  `);
}

async function cancelCheckout(id) {
  if (!window.pmsCan?.('checkout.cancel')) return;
  if (!confirm('Cancel this checkout record?')) return;
  await api.patch(`/checkouts/${id}/cancel`, {});
  loadCheckoutList();
}

async function loadCancelCheckoutList() {
  const { guests } = await api.get('/checkouts?status=cancelled');
  checkoutListShell('CANCEL CHECK OUT LIST', `
    <table class="checkin-report-table"><thead><tr><th>Check-in No</th><th>Name</th><th>Mobile</th><th>Room Details</th><th>Check-in Time</th><th>Check-out Time</th><th>Total Bill</th><th>Paid</th><th>Payment</th><th>Status</th><th>Action</th></tr></thead><tbody>${renderCheckoutRows(guests, { actions: (guest) => window.pmsCan?.('checkout.print_bill') ? `<button class="green-action" onclick="showCheckoutBillById('${guest.id}', true)">Print Bill</button>` : '-' })}</tbody></table>
  `);
}
function billRows(items) {
  return items.length ? items.map((item) => `
    <tr>
      <td>${coEscape(item.name)}</td>
      <td>${coRs(item.item_amount)}</td>
      <td>${coEscape(item.quantity || 1)}</td>
      <td>${coRs(item.amount)}</td>
      <td>${coRs(item.gst_percent)}</td>
      <td>${coRs(item.total)}</td>
      <td>${coEscape(item.date || '')}</td>
    </tr>
  `).join('') : '<tr><td colspan="7">No food or other details.</td></tr>';
}

function billSummaryRow(label, value) {
  return `<tr><th colspan="2">${coEscape(label)}</th><td>${coRs(value)}</td></tr>`;
}

function openCheckoutBillWhatsApp() {
  const guest = checkoutState.billGuest;
  if (!guest) return;
  const phone = String(guest.phone || '').replace(/\D/g, '');
  if (!phone) {
    alert('Guest mobile number not found.');
    return;
  }
  const number = phone.length === 10 ? `91${phone}` : phone;
  const amount = coRs(guest.checkout_pay_after_discount || guest.checkout_total_bill_amount || 0);
  const message = `Hello ${guest.name || 'Guest'},%0A%0AGreetings from Club Skypark.%0AYour hotel bill for Room ${guest.room_number || '-'} is ready.%0ABill Amount: Rs ${amount}%0APayment Mode: ${guest.checkout_payment_mode || '-'}%0A%0ATeam Club Skypark`;
  window.open(`https://wa.me/${number}?text=${message}`, '_blank');
}

function printCheckoutBillMode(mode) {
  if (!checkoutState.billGuest) return;
  showCheckoutBill(checkoutState.billGuest, mode);
  setTimeout(() => printCurrentDocument(), 100);
}

function showCheckoutBill(guest, mode = 'with_food') {
  document.body.classList.remove('dashboard-mode');
  checkoutState.billGuest = guest;
  const main = document.getElementById('main-content');
  const foodItems = Array.isArray(guest.checkout_food_items) ? guest.checkout_food_items : [];
  const days = Number(guest.days || coDaysBetween(guest.check_in_date, guest.check_out_date));
  const perDay = Number(guest.room_rate || 0);
  const roomGross = coMoney(perDay * days);
  const roomDiscount = coMoney(guest.discount_amount || 0);
  const roomAmount = coMoney(guest.checkout_room_rent || Math.max(0, roomGross - roomDiscount));
  const roomGst = coMoney(guest.checkout_gst_amount || 0);
  const includeRoom = mode !== 'food_only';
  const includeFood = mode !== 'without_food';
  const printableFoodItems = includeFood ? foodItems : [];
  const foodTaxable = coMoney(printableFoodItems.reduce((sum, item) => sum + Number(item.amount || 0), 0));
  const foodTotal = coMoney(printableFoodItems.reduce((sum, item) => sum + Number(item.total || 0), 0));
  const foodGst = coMoney(Math.max(0, foodTotal - foodTaxable));
  const totalAmount = coMoney((includeRoom ? roomAmount + roomGst : 0) + foodTotal);
  const advance = mode === 'with_food' ? Number(guest.checkout_less_advance || 0) : 0;
  const discount = mode === 'with_food' ? Number(guest.checkout_discount_amount || 0) : 0;
  const payable = coMoney(Math.max(0, totalAmount - advance - discount));
  const billNo = 400 + Number(guest.id || 0);
  const title = mode === 'food_only' ? 'FOOD BILL' : mode === 'without_food' ? 'ROOM BILL WITHOUT FOOD' : 'ROOM BILL WITH FOOD';

  main.innerHTML = `
    <section class="document-screen">
      <div class="print-toolbar">
        ${window.pmsCan?.('checkout.print_bill') ? '<button class="green-action" onclick="printCheckoutBillMode(\'with_food\')">Print bill with food</button><button class="dark-action" onclick="printCheckoutBillMode(\'without_food\')">Print bill without food</button><button class="dark-action" onclick="printCheckoutBillMode(\'food_only\')">Print food bill</button><button class="dark-action" onclick="saveCurrentDocumentAsPdf()">Save PDF</button>' : ''}
        <button class="green-action" onclick="openCheckoutBillWhatsApp()">WhatsApp Bill</button>
        <button class="dark-action" onclick="loadCheckoutList()">Back to Check Out List</button>
      </div>
      <div class="print-area bill-card">
        <div class="doc-border">
          <div class="bill-header">
            <div><strong>GST NO:</strong> 23AAOFC4777E1ZC</div>
            <div class="brand-center"><div class="brand-mark">CLUB SKYPARK</div><small>HOTEL & RESORT</small><p>Manasa Road Neemuch (MP) 458441</p></div>
            <div>info@clubskypark.com<br>www.clubskypark.com</div>
          </div>
          <h2 class="bill-subtitle" style="text-align:center">${title}</h2>

          <div class="bill-info-grid">
            <table class="doc-info-table compact">
              ${grcRow('REGISTRATION NO', guest.check_in_no || guest.id)}
              ${grcRow('GUEST NAME', guest.name)}
              ${grcRow('CHECK IN', formatDateOnly(guest.check_in_date))}
              ${grcRow('COMPANY NAME', guest.company)}
              ${grcRow('GST NO', guest.gst_no)}
              ${grcRow('ADDRESS', guest.address)}
            </table>
            <table class="doc-info-table compact">
              ${grcRow('BILL NO', billNo)}
              ${grcRow('MOBILE', guest.phone)}
              ${grcRow('CHECK OUT', formatDateOnly(guest.check_out_date))}
              ${grcRow('CITY', guest.town_city)}
              ${grcRow('NO OF DAYS', days)}
              ${grcRow('NO OF PERSON', Number(guest.adults || 0) + Number(guest.children || 0))}
            </table>
          </div>

          <div class="bill-main-grid">
            <div>
              ${includeRoom ? `<table class="bill-table">
                <thead><tr><th>From Date</th><th>To Date</th><th>Room Type</th><th>Room No</th><th>Per Day Price</th><th>Price</th><th>Dis Amount</th><th>Amount</th></tr></thead>
                <tbody><tr>
                  <td>${coDateTimeDisplay(guest.check_in_date)}</td>
                  <td>${coDateTimeDisplay(guest.check_out_date)}</td>
                  <td>${coEscape(guest.room_type || '')}</td>
                  <td>${coEscape(guest.room_number || '')}</td>
                  <td>${coRs(perDay)}</td>
                  <td>${coRs(roomGross)}</td>
                  <td>${coRs(roomDiscount)}</td>
                  <td>${coRs(roomAmount)}</td>
                </tr></tbody>
              </table>` : ''}

              ${includeFood ? `<h2 class="bill-subtitle">FOOD & OTHER DETAILS</h2>
              <table class="bill-table">
                <thead><tr><th>Item Name</th><th>Item Amount</th><th>Qty</th><th>Amount</th><th>GST %</th><th>Total</th><th>Date</th></tr></thead>
                <tbody>${billRows(printableFoodItems)}</tbody>
              </table>` : ''}
            </div>

            <table class="bill-summary-table">
              ${billSummaryRow('Total Amount', totalAmount)}
              ${billSummaryRow('Discount Amount', guest.checkout_discount_amount || 0)}
              ${billSummaryRow('Gross Amount', coMoney(totalAmount - Number(guest.checkout_discount_amount || 0)))}
              ${includeRoom ? billSummaryRow('CGST Amount', roomGst / 2) : ''}
              ${includeRoom ? billSummaryRow('SGST Amount', roomGst / 2) : ''}
              ${billSummaryRow('NET Amount', totalAmount)}
              ${includeFood ? billSummaryRow('Taxable Room Food', foodTaxable) : ''}
              ${includeFood ? billSummaryRow('Food CGST Amount', foodGst / 2) : ''}
              ${includeFood ? billSummaryRow('Food SGST Amount', foodGst / 2) : ''}
              ${includeFood ? billSummaryRow('Total Room Food', foodTotal) : ''}
              ${billSummaryRow('Payable Amount', payable)}
            </table>
          </div>

          <div class="bill-signatures">
            <div>Guest Signature</div>
            <div>Cashier</div>
            <div>FO Signature</div>
          </div>
        </div>
      </div>
    </section>
  `;
}

async function showCheckoutBillById(id, includeCancelled = false) {
  const completed = await api.get('/checkouts?status=completed');
  let guest = completed.guests.find((item) => String(item.id) === String(id));
  if (!guest && includeCancelled) {
    const cancelled = await api.get('/checkouts?status=cancelled');
    guest = cancelled.guests.find((item) => String(item.id) === String(id));
  }
  if (!guest) {
    alert('Checkout bill not found.');
    return;
  }
  showCheckoutBill(guest);
}
