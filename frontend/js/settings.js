let settingsState = {
  staff: [],
  permissionGroups: [],
  editingId: ''
};

const staffRoles = ['super_admin', 'manager', 'reception', 'restaurant'];

function settingsEscape(value) {
  return String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

function settingsRoleLabel(role) {
  return String(role || '').replace(/_/g, ' ');
}

function settingsDateDisplay(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}

function settingsAllPermissions() {
  return settingsState.permissionGroups.flatMap((group) => group.permissions.map(([key]) => key));
}

function settingsRoleDefaults(role) {
  const all = settingsAllPermissions();
  const defaults = {
    super_admin: all,
    manager: all.filter((permission) => !permission.startsWith('staff.')),
    reception: [
      'dashboard.view',
      'bookings.view',
      'bookings.create',
      'bookings.edit',
      'bookings.cancel',
      'bookings.whatsapp',
      'bookings.bulk',
      'rooms.view',
      'checkin.view',
      'checkin.create',
      'checkin.list',
      'checkin.cancel',
      'checkin.print_grc',
      'checkin.room_swap',
      'checkin.bulk',
      'documents.view',
      'documents.upload',
      'documents.download',
      'checkout.view',
      'checkout.create',
      'checkout.list',
      'checkout.print_bill',
      'receipts.view',
      'receipts.create',
      'receipts.print',
      'payments.view',
      'payments.create',
      'reports.daily'
    ],
    restaurant: [
      'dashboard.view',
      'restaurant.view',
      'restaurant.create_order',
      'restaurant.update_status',
      'restaurant.mark_paid',
      'items.view',
      'items.create',
      'items.edit'
    ]
  };
  return defaults[role] || [];
}

function selectedStaffPermissions() {
  return Array.from(document.querySelectorAll('[data-permission]:checked')).map((input) => input.dataset.permission);
}

function staffPermissionSummary(member) {
  if (member.role === 'super_admin') return 'Full access';
  const count = Array.isArray(member.permissions) ? member.permissions.length : 0;
  return `${count} permission${count === 1 ? '' : 's'}`;
}

async function loadSettings() {
  const main = document.getElementById('main-content');
  try {
    const response = await api.get('/staff');
    settingsState.staff = response.staff || [];
    settingsState.permissionGroups = response.permissionGroups || [];
    settingsState.editingId = '';

    const canCreate = pmsCan('staff.create');
    const canEdit = pmsCan('staff.edit') || pmsCan('staff.permissions');

    main.innerHTML = `
      <section class="pms-content">
        <div class="pms-title-row">
          <div>
            <span>Settings</span>
            <h2>Staff Access Control</h2>
          </div>
          <div class="pms-top-actions">
            ${canCreate ? '<button onclick="showStaffAccessForm()">+ Add Staff Member</button>' : ''}
          </div>
        </div>

        <div class="pms-panel">
          <div class="pms-panel-head">
            <h3>Staff Members</h3>
            <span>${settingsState.staff.length} accounts</span>
          </div>
          <table class="pms-table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Access</th><th>Created</th><th>Action</th></tr></thead>
            <tbody>
              ${settingsState.staff.length ? settingsState.staff.map((member) => `
                <tr>
                  <td><strong>${settingsEscape(member.name)}</strong></td>
                  <td>${settingsEscape(member.email)}</td>
                  <td><span class="status-pill status-reserved">${settingsRoleLabel(member.role)}</span></td>
                  <td>${staffPermissionSummary(member)}</td>
                  <td>${settingsEscape(settingsDateDisplay(member.created_at))}</td>
                  <td>
                    ${canEdit ? `<button class="mini-btn cyan" onclick="showStaffAccessForm('${member.id}')">Edit Access</button>` : '<span>-</span>'}
                  </td>
                </tr>
              `).join('') : '<tr><td colspan="6">No staff records found.</td></tr>'}
            </tbody>
          </table>
        </div>

        <div class="pms-panel staff-access-note">
          <h3>Access Rules</h3>
          <p>Super admin always has full access. Other roles start with safe defaults, and each staff member can then be customized feature by feature.</p>
        </div>
      </section>
    `;
  } catch (error) {
    main.innerHTML = `<section class="pms-content"><div class="pms-panel"><p>${settingsEscape(error.message)}</p></div></section>`;
  }
}

function permissionGroupCard(group, selected, disabled) {
  const checkedCount = group.permissions.filter(([key]) => selected.includes(key)).length;
  return `
    <article class="permission-group-card" data-group-card="${settingsEscape(group.key)}">
      <div class="permission-group-head">
        <div>
          <strong>${settingsEscape(group.label)}</strong>
          <small>${checkedCount}/${group.permissions.length} allowed</small>
        </div>
        <label class="permission-toggle">
          <input type="checkbox" onchange="togglePermissionGroup('${settingsEscape(group.key)}', this.checked)" ${disabled ? 'disabled' : ''} ${checkedCount === group.permissions.length ? 'checked' : ''}>
          All
        </label>
      </div>
      <div class="permission-check-list">
        ${group.permissions.map(([key, label]) => `
          <label class="permission-check">
            <input type="checkbox" data-permission="${settingsEscape(key)}" data-group="${settingsEscape(group.key)}" ${selected.includes(key) ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
            <span>${settingsEscape(label)}</span>
          </label>
        `).join('')}
      </div>
    </article>
  `;
}

function renderStaffPermissionEditor(selected = [], disabled = false) {
  return `
    <div class="permission-editor">
      <div class="permission-editor-head">
        <div>
          <h3>Feature Access</h3>
          <p>Select exactly what this staff member can view or do.</p>
        </div>
        <div class="permission-tools">
          <button type="button" onclick="applySelectedRoleDefaults()" ${disabled ? 'disabled' : ''}>Load Role Defaults</button>
          <button type="button" onclick="selectAllPermissions()" ${disabled ? 'disabled' : ''}>Select All</button>
          <button type="button" onclick="clearAllPermissions()" ${disabled ? 'disabled' : ''}>Clear</button>
        </div>
      </div>
      <div class="permission-group-grid">
        ${settingsState.permissionGroups.map((group) => permissionGroupCard(group, selected, disabled)).join('')}
      </div>
    </div>
  `;
}

function showStaffAccessForm(id = '') {
  const member = settingsState.staff.find((staff) => String(staff.id) === String(id));
  const isEdit = Boolean(member);
  const canEditDetails = pmsCan('staff.edit');
  const canManageAccess = pmsCan('staff.permissions');
  const canCreate = pmsCan('staff.create');

  if (!isEdit && !canCreate) {
    alert('You do not have permission to create staff.');
    return;
  }
  if (isEdit && !canEditDetails && !canManageAccess) {
    alert('You do not have permission to edit staff.');
    return;
  }

  settingsState.editingId = id;
  const role = member?.role || 'reception';
  const selected = member?.permissions?.length ? member.permissions : settingsRoleDefaults(role);
  const permissionsDisabled = role === 'super_admin' || !canManageAccess;
  const detailsDisabled = isEdit ? !canEditDetails : !canCreate;
  const passwordPlaceholder = isEdit ? 'Leave blank to keep current password' : 'Password';

  document.getElementById('main-content').innerHTML = `
    <section class="pms-content">
      <div class="pms-title-row">
        <div>
          <span>Settings</span>
          <h2>${isEdit ? 'Edit Staff Access' : 'Add Staff Member'}</h2>
        </div>
        <div class="pms-top-actions">
          <button onclick="loadSettings()">Back</button>
        </div>
      </div>

      <div class="pms-panel">
        <div class="pms-panel-head">
          <h3>Staff Details</h3>
          <span>${isEdit ? settingsEscape(member.email) : 'New account'}</span>
        </div>
        <div class="form-grid">
          <label>Name<input id="staffName" value="${settingsEscape(member?.name || '')}" placeholder="Staff name" ${detailsDisabled ? 'disabled' : ''}></label>
          <label>Email<input id="staffEmail" type="email" value="${settingsEscape(member?.email || '')}" placeholder="staff@example.com" ${detailsDisabled ? 'disabled' : ''}></label>
          <label>Password<input id="staffPassword" type="password" placeholder="${passwordPlaceholder}" ${detailsDisabled ? 'disabled' : ''}></label>
          <label>Role<select id="staffRole" onchange="handleStaffRoleChange()" ${detailsDisabled ? 'disabled' : ''}>
            ${staffRoles.map((item) => `<option value="${item}" ${item === role ? 'selected' : ''}>${settingsRoleLabel(item)}</option>`).join('')}
          </select></label>
        </div>
      </div>

      ${renderStaffPermissionEditor(selected, permissionsDisabled)}

      <div class="form-actions sticky-actions">
        <button onclick="${isEdit ? `updateStaff('${member.id}')` : 'addStaff()'}">${isEdit ? 'Save Changes' : 'Create Staff'}</button>
        <button onclick="loadSettings()">Cancel</button>
      </div>
    </section>
  `;
}

function handleStaffRoleChange() {
  const role = document.getElementById('staffRole')?.value || 'reception';
  const disabled = role === 'super_admin' || !pmsCan('staff.permissions');
  const selected = settingsRoleDefaults(role);
  const mount = document.querySelector('.permission-editor');
  if (!mount) return;
  mount.outerHTML = renderStaffPermissionEditor(selected, disabled);
}

function applySelectedRoleDefaults() {
  const role = document.getElementById('staffRole')?.value || 'reception';
  applyPermissionSet(settingsRoleDefaults(role));
}

function applyPermissionSet(permissions) {
  const allowed = new Set(permissions);
  document.querySelectorAll('[data-permission]').forEach((input) => {
    input.checked = allowed.has(input.dataset.permission);
  });
  refreshGroupToggles();
}

function selectAllPermissions() {
  applyPermissionSet(settingsAllPermissions());
}

function clearAllPermissions() {
  applyPermissionSet([]);
}

function togglePermissionGroup(groupKey, checked) {
  document.querySelectorAll(`[data-group="${groupKey}"]`).forEach((input) => {
    input.checked = checked;
  });
}

function refreshGroupToggles() {
  settingsState.permissionGroups.forEach((group) => {
    const inputs = Array.from(document.querySelectorAll(`[data-group="${group.key}"]`));
    const toggle = document.querySelector(`[data-group-card="${group.key}"] .permission-toggle input`);
    if (toggle && inputs.length) {
      toggle.checked = inputs.every((input) => input.checked);
    }
  });
}

function readStaffPayload(isEdit = false) {
  const role = document.getElementById('staffRole')?.value || 'reception';
  const payload = {
    name: document.getElementById('staffName')?.value || '',
    email: document.getElementById('staffEmail')?.value || '',
    role
  };
  const password = document.getElementById('staffPassword')?.value || '';
  if (password || !isEdit) payload.password = password;
  if (pmsCan('staff.permissions')) {
    payload.permissions = role === 'super_admin' ? settingsRoleDefaults('super_admin') : selectedStaffPermissions();
  }
  return payload;
}

async function addStaff() {
  try {
    await api.post('/staff', readStaffPayload(false));
    await loadSettings();
  } catch (error) {
    alert(error.message || 'Staff member could not be saved.');
  }
}

async function updateStaff(id) {
  try {
    await api.patch(`/staff/${id}`, readStaffPayload(true));
    await loadSettings();
  } catch (error) {
    alert(error.message || 'Staff access could not be updated.');
  }
}
