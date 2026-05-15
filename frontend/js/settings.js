async function loadSettings() {
  const main = document.getElementById('main-content');
  try {
    const { staff } = await api.get('/staff');
    main.innerHTML = `<h1>Settings</h1>
      <button onclick="showStaffForm()">+ Add Staff Member</button>
      <table>
        <tr><th>Name</th><th>Email</th><th>Role</th><th>Created</th></tr>
        ${staff.map((member) => `<tr>
          <td>${member.name}</td>
          <td>${member.email}</td>
          <td>${member.role}</td>
          <td>${member.created_at}</td>
        </tr>`).join('')}
      </table>
    `;
  } catch (error) {
    main.innerHTML = `<p>${error.message}</p>`;
  }
}

function showStaffForm() {
  document.getElementById('main-content').innerHTML = `
    <h2>Add Staff Member</h2>
    <input id="staffName" placeholder="Name"><br>
    <input id="staffEmail" type="email" placeholder="Email"><br>
    <input id="staffPassword" type="password" placeholder="Password"><br>
    <select id="staffRole">
      <option value="manager">manager</option>
      <option value="reception">reception</option>
      <option value="restaurant">restaurant</option>
      <option value="super_admin">super_admin</option>
    </select><br>
    <button onclick="addStaff()">Save</button>
    <button onclick="loadSettings()">Cancel</button>
  `;
}

async function addStaff() {
  await api.post('/staff', {
    name: document.getElementById('staffName').value,
    email: document.getElementById('staffEmail').value,
    password: document.getElementById('staffPassword').value,
    role: document.getElementById('staffRole').value
  });
  loadSettings();
}
