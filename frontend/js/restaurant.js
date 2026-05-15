async function loadRestaurant() {
  const main = document.getElementById('main-content');
  try {
    const { orders } = await api.get('/restaurant-orders');
    main.innerHTML = `<h1>Restaurant Orders</h1>
      <button onclick="showRestaurantForm()">+ Add Order</button>
      <table><tr><th>Table</th><th>Items</th><th>Total</th><th>Status</th></tr>
      ${orders.map((o) => `<tr>
        <td>${o.table_number}</td>
        <td>${o.items.map((item) => `${item.quantity}x ${item.name}`).join(', ')}</td>
        <td>Rs ${Number(o.total).toLocaleString()}</td>
        <td>${o.status}</td>
      </tr>`).join('')}
      </table>`;
  } catch (error) {
    main.innerHTML = `<p>${error.message}</p>`;
  }
}

function showRestaurantForm() {
  document.getElementById('main-content').innerHTML = `
    <h2>Add Restaurant Order</h2>
    <input id="tableNumber" placeholder="Table Number"><br>
    <textarea id="orderItems" placeholder="Items, one per line: Paneer Tikka,2,250"></textarea><br>
    <select id="orderStatus">
      <option value="pending">pending</option>
      <option value="preparing">preparing</option>
      <option value="served">served</option>
      <option value="paid">paid</option>
    </select><br>
    <button onclick="addRestaurantOrder()">Save</button>
    <button onclick="loadRestaurant()">Cancel</button>
  `;
}

async function addRestaurantOrder() {
  const items = document.getElementById('orderItems').value
    .split('\n')
    .map((line) => line.split(',').map((part) => part.trim()))
    .filter((parts) => parts.length >= 3)
    .map(([name, quantity, price]) => ({ name, quantity, price }));

  await api.post('/restaurant-orders', {
    table_number: document.getElementById('tableNumber').value,
    items,
    status: document.getElementById('orderStatus').value
  });
  loadRestaurant();
}
