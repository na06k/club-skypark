async function loadPayments() {
  const main = document.getElementById('main-content');
  try {
    const { payments } = await api.get('/payments');
    main.innerHTML = `<h1>Payments</h1>
      ${window.pmsCan?.('payments.create') ? '<button onclick="showPaymentForm()">+ Record Payment</button>' : ''}
      <table>
        <tr><th>Booking</th><th>Amount</th><th>Method</th><th>Status</th></tr>
        ${payments.map((p) => `<tr>
          <td>${p.guest_name || '-'}</td>
          <td>Rs ${Number(p.amount).toLocaleString()}</td>
          <td>${p.method}</td>
          <td>${p.status}</td>
        </tr>`).join('')}
      </table>`;
  } catch (error) {
    main.innerHTML = `<p>${error.message}</p>`;
  }
}

function showPaymentForm() {
  if (!window.pmsCan?.('payments.create')) {
    alert('You do not have permission to record payments.');
    return;
  }
  document.getElementById('main-content').innerHTML = `
    <h2>Record Payment</h2>
    <input id="paymentBookingId" placeholder="Booking ID (optional)"><br>
    <input id="paymentAmount" type="number" placeholder="Amount"><br>
    <input id="paymentMethod" placeholder="Method"><br>
    <select id="paymentStatus">
      <option value="paid">paid</option>
      <option value="pending">pending</option>
      <option value="failed">failed</option>
      <option value="refunded">refunded</option>
    </select><br>
    <button onclick="recordPayment()">Save</button>
    <button onclick="loadPayments()">Cancel</button>
  `;
}

async function recordPayment() {
  if (!window.pmsCan?.('payments.create')) return;
  await api.post('/payments', {
    booking_id: document.getElementById('paymentBookingId').value || null,
    amount: document.getElementById('paymentAmount').value,
    method: document.getElementById('paymentMethod').value,
    status: document.getElementById('paymentStatus').value
  });
  loadPayments();
}
