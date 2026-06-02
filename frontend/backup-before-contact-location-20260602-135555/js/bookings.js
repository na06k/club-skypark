function bookingDateDisplay(value) {
  if (!value) return '-';
  const date = new Date(String(value).length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return String(value);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}

function bookingMoney(value) {
  return Number(value || 0).toLocaleString('en-IN');
}

function bookingRoomName(booking) {
  return booking.room_number || booking.room_name || booking.room_type || 'Room';
}

function bookingPhoneForWhatsApp(value) {
  let phone = String(value || '').replace(/\D/g, '');
  if (phone.startsWith('0')) phone = phone.slice(1);
  if (phone.length === 10) phone = `91${phone}`;
  return phone;
}

function buildBookingWhatsAppText(booking) {
  return [
    `Hello ${booking.guest_name || 'Guest'},`,
    '',
    'Greetings from Club Sky Park.',
    '',
    'We are pleased to confirm your booking with us.',
    '',
    'Booking Summary:',
    `Booking ID: ${booking.id}`,
    `Room Category: ${bookingRoomName(booking)}`,
    `Check-in: ${bookingDateDisplay(booking.check_in)}`,
    `Check-out: ${bookingDateDisplay(booking.check_out)}`,
    `No. of Guests: ${booking.guests || 1}`,
    `Total Amount: \u20B9${bookingMoney(booking.total_price)}`,
    'Payment Status: Due',
    '',
    'We look forward to welcoming you and making your stay comfortable and memorable.',
    '',
    'For assistance, please contact:',
    '+91 79748 23267',
    '',
    'Warm regards,',
    'Team Club SkyPark'
  ].join('\n');
}

function openWhatsAppForBooking(booking) {
  const phone = bookingPhoneForWhatsApp(booking.guest_phone);
  if (!phone) {
    alert('Guest phone number is missing.');
    return;
  }
  const message = encodeURIComponent(buildBookingWhatsAppText(booking));
  window.open(`https://wa.me/${phone}?text=${message}`, '_blank');
}

function openBookingWhatsApp(bookingId) {
  const booking = (window.__bookings || []).find((item) => String(item.id) === String(bookingId));
  if (!booking) {
    alert('Booking details not found. Please reload reservations and try again.');
    return;
  }
  openWhatsAppForBooking(booking);
}

async function loadBookings() {
  const main = document.getElementById('main-content');
  try {
    const { bookings } = await api.get('/bookings');
    window.__bookings = bookings;
    const canCreate = window.pmsCan?.('bookings.create');
    const canEdit = window.pmsCan?.('bookings.edit');
    const canCancel = window.pmsCan?.('bookings.cancel');
    const canWhatsapp = window.pmsCan?.('bookings.whatsapp');
    let html = `
      <section class="pms-content">
        <div class="pms-title-row">
          <div>
            <span>Booking Management</span>
            <h2>Website bookings, manual reservations and confirmations</h2>
          </div>
          <div class="pms-top-actions">
            ${canCreate ? '<button onclick="loadModule(\'reservations\')">New Reservation</button>' : ''}
          </div>
        </div>
        <div class="pms-panel">
          <div class="pms-panel-head">
            <h3>Bookings</h3>
            <span>${bookings.length} records</span>
          </div>
          <table class="pms-table">
            <thead><tr><th>Guest</th><th>Room</th><th>Dates</th><th>ETA</th><th>Total</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>`;
    bookings.forEach((b) => {
      html += `<tr>
        <td>${b.guest_name}<br>${b.guest_email}<br>${b.guest_phone || ''}</td>
        <td>${bookingRoomName(b)}</td>
        <td>${bookingDateDisplay(b.check_in)} to ${bookingDateDisplay(b.check_out)}</td>
        <td>${b.estimated_checkin_time || '-'}</td>
        <td>Rs ${bookingMoney(b.total_price)}</td>
        <td><span class="status-pill status-${String(b.status || '').replace(/_/g, '-')}">${b.status}</span></td>
        <td>${canEdit || canCancel ? `<select onchange="updateBookingStatus('${b.id}',this.value)">
          <option value="">Change</option>
          ${canEdit ? '<option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="checked_in">Checked In</option><option value="checked_out">Checked Out</option>' : ''}
          ${canCancel ? '<option value="cancelled">Cancel</option>' : ''}
        </select>` : ''}
        ${canWhatsapp ? `<button class="mini-btn cyan" onclick="openBookingWhatsApp('${b.id}')">WhatsApp</button>` : ''}
        ${!canEdit && !canCancel && !canWhatsapp ? '-' : ''}</td>
      </tr>`;
    });
    html += `</tbody></table></div></section>`;
    main.innerHTML = html;
  } catch (error) {
    main.innerHTML = `<section class="pms-content"><div class="pms-panel"><p>${error.message}</p></div></section>`;
  }
}

async function updateBookingStatus(id, status) {
  if (!status) return;
  if (status === 'cancelled' && !window.pmsCan?.('bookings.cancel')) return;
  if (status !== 'cancelled' && !window.pmsCan?.('bookings.edit')) return;
  const { booking, auto_checkin_guest: autoCheckinGuest } = await api.patch(`/bookings/${id}/status`, { status });
  if (autoCheckinGuest) {
    alert(`Booking confirmed and auto check-in completed. Room allotted: ${autoCheckinGuest.room_number || 'assigned room'}.`);
  }
  if (status === 'confirmed' && confirm('Booking confirmed. Open WhatsApp message for this guest now?')) {
    openWhatsAppForBooking(booking);
  }
  loadBookings();
}
