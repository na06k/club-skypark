let restaurantState = {
  items: [],
  orders: [],
  activeGuests: [],
  cart: [],
  category: 'all',
  search: '',
  selectedGuestId: ''
};

function restaurantEscape(value) {
  return String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

function restaurantMoney(value) {
  return Number(value || 0).toLocaleString('en-IN');
}

function restaurantCategory(value) {
  return String(value || 'General').trim() || 'General';
}

function restaurantCategories() {
  const counts = new Map();
  restaurantState.items.forEach((item) => {
    const category = restaurantCategory(item.category);
    counts.set(category, (counts.get(category) || 0) + 1);
  });
  return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

function restaurantCategoryKey(value) {
  return encodeURIComponent(value);
}

function setRestaurantCategory(encodedCategory) {
  restaurantState.category = decodeURIComponent(encodedCategory);
  renderRestaurantMenu();
}

function setRestaurantSearch(value) {
  restaurantState.search = String(value || '').trim().toLowerCase();
  renderRestaurantMenu();
}

function restaurantStatusClass(status) {
  return `status-pill status-${String(status || '').replace(/_/g, '-')}`;
}

function restaurantGuestLabel(guest) {
  return `${guest.room_number || '-'} (${guest.room_type || 'Room'}) - ${guest.name || 'Guest'}`;
}

function restaurantOrdersForGuest(guestId = restaurantState.selectedGuestId) {
  const guest = restaurantState.activeGuests.find((item) => String(item.id) === String(guestId));
  const roomNumber = String(guest?.room_number || '').toLowerCase();
  return restaurantState.orders.filter((order) => {
    const sameGuest = order.guest_id && String(order.guest_id) === String(guestId);
    const sameRoom = roomNumber && String(order.table_number || '').toLowerCase() === roomNumber;
    return sameGuest || sameRoom;
  });
}

async function loadRestaurant(preselectedGuestId = '') {
  const main = document.getElementById('main-content');
  try {
    const [{ orders }, { items }, { guests }] = await Promise.all([
      api.get('/restaurant-orders'),
      api.get('/items?type=restaurant'),
      api.get('/guests/active')
    ]);
    restaurantState.items = (items || []).filter((item) => item.active !== false);
    restaurantState.orders = orders || [];
    restaurantState.activeGuests = guests || [];
    restaurantState.cart = [];
    restaurantState.category = 'all';
    restaurantState.search = '';
    restaurantState.selectedGuestId = preselectedGuestId || '';

    if (preselectedGuestId) {
      showRestaurantForm(preselectedGuestId);
      return;
    }

    const canCreateOrder = window.pmsCan?.('restaurant.create_order');
    const canItems = window.pmsCanAny?.('items.view', 'items.create', 'items.edit');
    const categories = restaurantCategories();

    main.innerHTML = `
      <section class="pms-content">
        <div class="pms-title-row">
          <div>
            <span>Restaurant POS</span>
            <h2>Table orders, KOT and billing</h2>
          </div>
          <div class="pms-top-actions">
            ${canCreateOrder ? '<button onclick="showRestaurantForm()">New KOT / Order</button>' : ''}
            ${canItems ? '<button onclick="loadModule(\'items\')">Menu Items</button>' : ''}
          </div>
        </div>

        <div class="pms-two-col">
          <section class="pms-panel">
            <div class="pms-panel-head">
              <h3>Active and Recent Orders</h3>
              <span>${restaurantState.orders.length} orders</span>
            </div>
            <table class="pms-table">
              <thead><tr><th>Table / Room</th><th>Guest</th><th>Items</th><th>Total</th><th>Status</th></tr></thead>
              <tbody>
                ${restaurantState.orders.length ? restaurantState.orders.map((order) => `
                  <tr>
                    <td><strong>${restaurantEscape(order.table_number)}</strong></td>
                    <td>${restaurantEscape(order.guest_name || '-')}</td>
                    <td>${(order.items || []).map((item) => `${restaurantEscape(item.quantity)} x ${restaurantEscape(item.name)}`).join('<br>')}</td>
                    <td>Rs ${restaurantMoney(order.total)}</td>
                    <td><span class="${restaurantStatusClass(order.status)}">${restaurantEscape(order.status)}</span></td>
                  </tr>
                `).join('') : '<tr><td colspan="5">No restaurant orders found.</td></tr>'}
              </tbody>
            </table>
          </section>

          <aside class="pms-panel">
            <div class="pms-panel-head">
              <h3>Menu Categories</h3>
            </div>
            <div class="pos-category-summary">
              ${categories.length ? categories.map(([category, count]) => `
                <article>
                  <strong>${restaurantEscape(category)}</strong>
                  <span>${count} items</span>
                </article>
              `).join('') : '<p>No restaurant menu categories found.</p>'}
            </div>
          </aside>
        </div>
      </section>
    `;
  } catch (error) {
    main.innerHTML = `<section class="pms-content"><div class="pms-panel"><p>${error.message}</p></div></section>`;
  }
}

function restaurantCategoryOptions() {
  return restaurantCategories().map(([category]) => `<option value="${restaurantEscape(category)}">${restaurantEscape(category)}</option>`).join('');
}

function renderRestaurantItemOptions() {
  const category = document.getElementById('restaurantItemType')?.value || '';
  const target = document.getElementById('restaurantItemSelect');
  if (!target) return;
  const filtered = restaurantState.items.filter((item) => !category || restaurantCategory(item.category) === category);
  target.innerHTML = filtered.length
    ? `<option value="">Select Item</option>${filtered.map((item) => `<option value="${item.id}">${restaurantEscape(item.name)} - Rs ${restaurantMoney(item.price)}</option>`).join('')}`
    : '<option value="">No items in this category</option>';
}

function restaurantFoodListTable(guestId = restaurantState.selectedGuestId) {
  const orders = restaurantOrdersForGuest(guestId);
  const rows = orders.flatMap((order) => (order.items || []).map((item) => ({
    room: order.table_number || order.room_number || '-',
    itemType: restaurantCategory(item.category || ''),
    name: item.name || 'Item',
    price: Number(item.price || 0),
    qty: Number(item.quantity || 1),
    amount: Number(item.price || 0) * Number(item.quantity || 1),
    tax: Number(item.gst_percent || 0),
    subtotal: Number(item.price || 0) * Number(item.quantity || 1) * (1 + Number(item.gst_percent || 0) / 100),
    status: order.status || 'pending',
    date: order.created_at ? new Date(order.created_at).toLocaleDateString('en-GB') : '-'
  })));
  const totalQty = rows.reduce((sum, row) => sum + row.qty, 0);
  const totalAmount = rows.reduce((sum, row) => sum + row.subtotal, 0);

  return `
    <table class="pms-table food-order-table">
      <thead><tr><th>Sno.</th><th>Room</th><th>Item Type</th><th>Item Name</th><th>Item Price</th><th>Qty</th><th>Amount</th><th>Tax %</th><th>Subtotal</th><th>Status</th><th>Date</th></tr></thead>
      <tbody>
        ${rows.length ? rows.map((row, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${restaurantEscape(row.room)}</td>
            <td>${restaurantEscape(row.itemType)}</td>
            <td>${restaurantEscape(row.name)}</td>
            <td>${restaurantMoney(row.price)}</td>
            <td>${row.qty}</td>
            <td>${restaurantMoney(row.amount)}</td>
            <td>${restaurantMoney(row.tax)}</td>
            <td>${restaurantMoney(row.subtotal)}</td>
            <td><span class="${restaurantStatusClass(row.status)}">${restaurantEscape(row.status)}</span></td>
            <td>${restaurantEscape(row.date)}</td>
          </tr>
        `).join('') : '<tr><td colspan="11">No food or other items added for this room yet.</td></tr>'}
        <tr class="food-order-total"><td colspan="5"></td><td><strong>${totalQty}</strong></td><td colspan="2"></td><td><strong>${restaurantMoney(totalAmount)}</strong></td><td colspan="2"></td></tr>
      </tbody>
    </table>
  `;
}

function renderRestaurantGuestOrders() {
  const mount = document.getElementById('restaurantRoomOrderList');
  if (mount) mount.innerHTML = restaurantFoodListTable(document.getElementById('restaurantGuestSelect')?.value || restaurantState.selectedGuestId);
}

function showRestaurantForm(preselectedGuestId = '') {
  if (!window.pmsCan?.('restaurant.create_order')) {
    alert('You do not have permission to create restaurant orders.');
    return;
  }
  restaurantState.cart = [];
  restaurantState.category = 'all';
  restaurantState.search = '';
  restaurantState.selectedGuestId = preselectedGuestId || restaurantState.selectedGuestId || restaurantState.activeGuests[0]?.id || '';

  document.getElementById('main-content').innerHTML = `
    <section class="pms-content">
      <div class="pms-title-row">
        <div>
          <span>Add Items</span>
          <h2>Add Food & Other</h2>
        </div>
        <div class="pms-top-actions">
          <button onclick="loadModule('dashboard')">Back to Dashboard</button>
          <button onclick="loadRestaurant()">Back to Orders</button>
        </div>
      </div>

      <section class="pms-panel food-order-panel">
        <div class="pms-panel-head teal-panel-head">
          <h3>Add Food & Other</h3>
        </div>
        <div class="food-order-form-row">
          <label>Item Type
            <select id="restaurantItemType" onchange="renderRestaurantItemOptions()">
              <option value="">All item types</option>
              ${restaurantCategoryOptions()}
            </select>
          </label>
          <label>Select Room
            <select id="restaurantGuestSelect" onchange="restaurantState.selectedGuestId=this.value;renderRestaurantGuestOrders()">
              ${restaurantState.activeGuests.length ? restaurantState.activeGuests.map((guest) => `<option value="${guest.id}" ${String(guest.id) === String(restaurantState.selectedGuestId) ? 'selected' : ''}>${restaurantEscape(restaurantGuestLabel(guest))}</option>`).join('') : '<option value="">No active rooms</option>'}
            </select>
          </label>
          <label>Item name
            <select id="restaurantItemSelect"></select>
          </label>
          <label>Qty
            <input id="restaurantItemQty" type="number" min="1" value="1">
          </label>
          <button class="blue-action" onclick="addRestaurantSingleItem()">Add Item</button>
        </div>
      </section>

      <section class="pms-panel food-order-panel">
        <div class="pms-panel-head teal-panel-head">
          <h3>Food & Other List</h3>
        </div>
        <div id="restaurantRoomOrderList" class="food-order-list-wrap">
          ${restaurantFoodListTable(restaurantState.selectedGuestId)}
        </div>
      </section>
    </section>
  `;
  renderRestaurantItemOptions();
}

async function addRestaurantSingleItem() {
  if (!window.pmsCan?.('restaurant.create_order')) return;
  const guestId = document.getElementById('restaurantGuestSelect')?.value || '';
  const itemId = document.getElementById('restaurantItemSelect')?.value || '';
  const qty = Number(document.getElementById('restaurantItemQty')?.value || 1);
  const guest = restaurantState.activeGuests.find((candidate) => String(candidate.id) === String(guestId));
  const item = restaurantState.items.find((candidate) => String(candidate.id) === String(itemId));
  if (!guest) {
    alert('Please select an active room.');
    return;
  }
  if (!item) {
    alert('Please select an item.');
    return;
  }

  await api.post('/restaurant-orders', {
    table_number: guest.room_number || '',
    guest_id: guest.id,
    room_id: guest.room_id || '',
    items: [{
      item_id: item.id,
      name: item.name,
      quantity: Math.max(1, qty),
      price: Number(item.price || 0)
    }],
    status: 'pending',
    payment_method: 'room_charge'
  });
  await loadRestaurant(guest.id);
}

function showRestaurantMenuOrderForm() {
  if (!window.pmsCan?.('restaurant.create_order')) return;
  restaurantState.cart = [];
  restaurantState.category = 'all';
  restaurantState.search = '';
  document.getElementById('main-content').innerHTML = `
    <section class="pms-content">
      <div class="pms-title-row">
        <div>
          <span>Restaurant POS</span>
          <h2>Create KOT / Order</h2>
        </div>
        <div class="pms-top-actions">
          <button onclick="showRestaurantForm()">Room Add Items</button>
          <button onclick="loadRestaurant()">Back to Orders</button>
        </div>
      </div>

      <div class="pos-order-layout">
        <section class="pms-panel pos-menu-panel">
          <div class="pms-panel-head">
            <h3>Menu Items</h3>
            <span>${restaurantState.items.length} active items</span>
          </div>
          <div class="pos-menu-shell">
            <aside class="pos-category-sidebar" id="restaurantCategoryList"></aside>
            <div class="pos-menu-pane">
              <input id="restaurantMenuSearch" class="pos-menu-search" placeholder="Search item" oninput="setRestaurantSearch(this.value)">
              <div class="menu-item-grid" id="restaurantMenuItems"></div>
            </div>
          </div>
        </section>

        <aside class="pms-panel">
          <div class="pms-panel-head">
            <h3>KOT Details</h3>
          </div>
          <div class="form-grid single-form-grid">
            <label>Table / Room No.<input id="tableNumber" placeholder="Table 6 or Room G2"></label>
            <label>Status<select id="orderStatus">
              <option value="pending">Pending KOT</option>
              <option value="preparing">Preparing</option>
              <option value="served">Served</option>
              <option value="paid">Paid</option>
            </select></label>
            <label>Payment Method<input id="restaurantPaymentMethod" value="cash"></label>
          </div>
          <div id="restaurantCart"></div>
          <div class="form-actions">
            <button onclick="addRestaurantOrder()">Save Order</button>
            <button onclick="loadRestaurant()">Cancel</button>
          </div>
        </aside>
      </div>
    </section>
  `;
  renderRestaurantMenu();
  renderRestaurantCart();
}

function renderRestaurantMenu() {
  const categoryMount = document.getElementById('restaurantCategoryList');
  const menuMount = document.getElementById('restaurantMenuItems');
  if (!categoryMount || !menuMount) return;

  const categories = restaurantCategories();
  const activeCategory = restaurantState.category || 'all';
  categoryMount.innerHTML = `
    <button type="button" class="${activeCategory === 'all' ? 'active' : ''}" onclick="setRestaurantCategory('${restaurantCategoryKey('all')}')">
      <strong>All Menu</strong>
      <span>${restaurantState.items.length}</span>
    </button>
    ${categories.map(([category, count]) => `
      <button type="button" class="${activeCategory === category ? 'active' : ''}" onclick="setRestaurantCategory('${restaurantCategoryKey(category)}')">
        <strong>${restaurantEscape(category)}</strong>
        <span>${count}</span>
      </button>
    `).join('')}
  `;

  const search = restaurantState.search || '';
  const filteredItems = restaurantState.items.filter((item) => {
    const category = restaurantCategory(item.category);
    const matchesCategory = activeCategory === 'all' || category === activeCategory;
    const searchable = `${item.name || ''} ${category}`.toLowerCase();
    return matchesCategory && (!search || searchable.includes(search));
  });

  menuMount.innerHTML = filteredItems.length ? filteredItems.map((item) => `
    <button type="button" onclick="addRestaurantCartItem('${item.id}')">
      <strong>${restaurantEscape(item.name)}</strong>
      <span>${restaurantEscape(restaurantCategory(item.category))}</span>
      <small>Rs ${restaurantMoney(item.price)}</small>
    </button>
  `).join('') : `
    <div class="menu-item-empty">
      <strong>No menu item found.</strong>
      <span>Create or edit items from Menu / Store Items and assign a category.</span>
    </div>
  `;
}

function addRestaurantCartItem(itemId) {
  const item = restaurantState.items.find((candidate) => String(candidate.id) === String(itemId));
  if (!item) return;
  const existing = restaurantState.cart.find((line) => String(line.item_id) === String(item.id));
  if (existing) {
    existing.quantity += 1;
  } else {
    restaurantState.cart.push({
      item_id: item.id,
      name: item.name,
      quantity: 1,
      price: Number(item.price || 0)
    });
  }
  renderRestaurantCart();
}

function updateRestaurantCartQty(index, quantity) {
  restaurantState.cart[index].quantity = Math.max(1, Number(quantity || 1));
  renderRestaurantCart();
}

function removeRestaurantCartItem(index) {
  restaurantState.cart.splice(index, 1);
  renderRestaurantCart();
}

function renderRestaurantCart() {
  const mount = document.getElementById('restaurantCart');
  if (!mount) return;
  const total = restaurantState.cart.reduce((sum, line) => sum + Number(line.price || 0) * Number(line.quantity || 1), 0);
  mount.innerHTML = `
    <table class="pms-table compact-table">
      <thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Total</th><th></th></tr></thead>
      <tbody>
        ${restaurantState.cart.length ? restaurantState.cart.map((line, index) => `
          <tr>
            <td>${restaurantEscape(line.name)}</td>
            <td><input class="mini-input" type="number" min="1" value="${line.quantity}" onchange="updateRestaurantCartQty(${index}, this.value)"></td>
            <td>Rs ${restaurantMoney(line.price)}</td>
            <td>Rs ${restaurantMoney(Number(line.price || 0) * Number(line.quantity || 1))}</td>
            <td><button class="mini-btn red" onclick="removeRestaurantCartItem(${index})">Remove</button></td>
          </tr>
        `).join('') : '<tr><td colspan="5">Select menu items to create KOT.</td></tr>'}
      </tbody>
    </table>
    <div class="invoice-total-row"><span>Order Total</span><strong>Rs ${restaurantMoney(total)}</strong></div>
  `;
}

async function addRestaurantOrder() {
  if (!window.pmsCan?.('restaurant.create_order')) return;
  if (!restaurantState.cart.length) {
    alert('Please select at least one menu item.');
    return;
  }

  await api.post('/restaurant-orders', {
    table_number: document.getElementById('tableNumber').value,
    items: restaurantState.cart,
    status: document.getElementById('orderStatus').value,
    payment_method: document.getElementById('restaurantPaymentMethod').value || 'cash'
  });
  loadRestaurant();
}
