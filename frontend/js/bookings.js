async function loadBookings() {
  const main = document.getElementById('main-content');
  try {
    const { bookings } = await api.get('/bookings');
    let html = `<h1>Reservations</h1><table>`;
    html += `<tr><th>Guest</th><th>Room</th><th>Dates</th><th>Total</th><th>Status</th><th>Action</th></tr>`;
    bookings.forEach((b) => {
      html += `<tr>
        <td>${b.guest_name}<br>${b.guest_email}</td>
        <td>${b.room_number || b.room_name || '-'}</td>
        <td>${b.check_in} to ${b.check_out}</td>
        <td>Rs ${Number(b.total_price).toLocaleString()}</td>
        <td>${b.status}</td>
        <td><select onchange="updateBookingStatus('${b.id}',this.value)">
          <option value="">Change</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="cancelled">Cancel</option>
          <option value="checked_in">Checked In</option>
          <option value="checked_out">Checked Out</option>
        </select></td>
      </tr>`;
    });
    html += `</table>`;
    main.innerHTML = html;
  } catch (error) {
    main.innerHTML = `<p>${error.message}</p>`;
  }
}

async function updateBookingStatus(id, status) {
  if (!status) return;
  await api.patch(`/bookings/${id}/status`, { status });
  loadBookings();
}
