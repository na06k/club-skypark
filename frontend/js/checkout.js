async function loadCheckout() {
  const main = document.getElementById('main-content');
  try {
    const { guests } = await api.get('/guests/active');
    let html = `<h1>Active Guests</h1><table>`;
    html += `<tr><th>Guest</th><th>Room</th><th>Checked In</th><th>Action</th></tr>`;
    guests.forEach((g) => {
      html += `<tr>
        <td>${g.name}</td>
        <td>${g.room_number}</td>
        <td>${g.check_in_date}</td>
        <td><button onclick="checkoutGuest('${g.id}')">Check Out</button></td>
      </tr>`;
    });
    html += `</table>`;
    main.innerHTML = html;
  } catch (error) {
    main.innerHTML = `<p>${error.message}</p>`;
  }
}

async function checkoutGuest(id) {
  await api.post(`/checkouts/${id}`, {});
  alert('Checkout complete');
  loadCheckout();
}
