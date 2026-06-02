const permissionGroups = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    permissions: [
      ['dashboard.view', 'View dashboard']
    ]
  },
  {
    key: 'bookings',
    label: 'Bookings / Reservations',
    permissions: [
      ['bookings.view', 'View bookings'],
      ['bookings.create', 'Create booking / reservation'],
      ['bookings.edit', 'Edit / confirm booking'],
      ['bookings.cancel', 'Cancel booking'],
      ['bookings.whatsapp', 'Send WhatsApp confirmation'],
      ['bookings.bulk', 'Bulk reservation']
    ]
  },
  {
    key: 'rooms',
    label: 'Rooms',
    permissions: [
      ['rooms.view', 'View rooms'],
      ['rooms.create', 'Create rooms'],
      ['rooms.edit', 'Edit rooms'],
      ['rooms.delete', 'Delete rooms'],
      ['rooms.status_update', 'Quick status update']
    ]
  },
  {
    key: 'checkin',
    label: 'Check In',
    permissions: [
      ['checkin.view', 'Open check-in page'],
      ['checkin.create', 'Create check-in'],
      ['checkin.list', 'View check-in lists'],
      ['checkin.cancel', 'Cancel check-in'],
      ['checkin.print_grc', 'Print GRC'],
      ['checkin.room_swap', 'Room swap'],
      ['checkin.bulk', 'Bulk check-in']
    ]
  },
  {
    key: 'documents',
    label: 'Guest Documents',
    permissions: [
      ['documents.view', 'View uploaded documents'],
      ['documents.upload', 'Upload guest documents'],
      ['documents.download', 'Download guest documents']
    ]
  },
  {
    key: 'housekeeping',
    label: 'Housekeeping',
    permissions: [
      ['housekeeping.view', 'View housekeeping'],
      ['housekeeping.create', 'Create housekeeping tasks'],
      ['housekeeping.edit', 'Update housekeeping tasks'],
      ['housekeeping.maintenance', 'Manage maintenance requests']
    ]
  },
  {
    key: 'guest_services',
    label: 'Laundry / Room Service',
    permissions: [
      ['services.view', 'View laundry and room service'],
      ['services.create', 'Create service orders'],
      ['services.edit', 'Update service orders'],
      ['services.charge', 'Charge services to room']
    ]
  },
  {
    key: 'checkout',
    label: 'Check Out',
    permissions: [
      ['checkout.view', 'Open checkout page'],
      ['checkout.create', 'Complete checkout'],
      ['checkout.list', 'View checkout lists'],
      ['checkout.cancel', 'Cancel checkout'],
      ['checkout.print_bill', 'Print checkout bill'],
      ['checkout.discount', 'Give checkout discount']
    ]
  },
  {
    key: 'restaurant',
    label: 'Restaurant POS',
    permissions: [
      ['restaurant.view', 'View restaurant POS'],
      ['restaurant.create_order', 'Create KOT / order'],
      ['restaurant.update_status', 'Update order status'],
      ['restaurant.mark_paid', 'Mark order paid']
    ]
  },
  {
    key: 'items',
    label: 'Menu / Store Items',
    permissions: [
      ['items.view', 'View items'],
      ['items.create', 'Create items'],
      ['items.edit', 'Edit items']
    ]
  },
  {
    key: 'billing',
    label: 'Receipts / Payments',
    permissions: [
      ['receipts.view', 'View receipts'],
      ['receipts.create', 'Create receipts'],
      ['receipts.print', 'Print receipts'],
      ['payments.view', 'View payments'],
      ['payments.create', 'Create payments']
    ]
  },
  {
    key: 'store',
    label: 'Store Management',
    permissions: [
      ['store.view', 'View store stock'],
      ['store.create', 'Create store items'],
      ['store.edit', 'Edit store items'],
      ['store.update_stock', 'Update stock'],
      ['store.suppliers', 'Manage suppliers'],
      ['store.wastage', 'Record wastage']
    ]
  },
  {
    key: 'loyalty',
    label: 'Loyalty',
    permissions: [
      ['loyalty.view', 'View loyalty members'],
      ['loyalty.create', 'Create loyalty members'],
      ['loyalty.edit', 'Edit loyalty members'],
      ['loyalty.points', 'Manage loyalty points']
    ]
  },
  {
    key: 'pricing',
    label: 'Dynamic Pricing',
    permissions: [
      ['pricing.view', 'View pricing rules'],
      ['pricing.create', 'Create pricing rules'],
      ['pricing.edit', 'Edit pricing rules'],
      ['pricing.calculate', 'Calculate dynamic prices']
    ]
  },
  {
    key: 'ledger',
    label: 'Ledger',
    permissions: [
      ['ledger.view', 'View ledger'],
      ['ledger.create', 'Create ledger entry']
    ]
  },
  {
    key: 'reports',
    label: 'Reports',
    permissions: [
      ['reports.daily', 'Daily report'],
      ['reports.close_day', 'Close day'],
      ['reports.gst', 'GST report'],
      ['reports.export', 'Export / print reports'],
      ['reports.analytics', 'Advanced analytics']
    ]
  },
  {
    key: 'notifications',
    label: 'Notifications',
    permissions: [
      ['notifications.view', 'View notifications'],
      ['notifications.create', 'Create notifications'],
      ['notifications.templates', 'Manage notification templates']
    ]
  },
  {
    key: 'staff',
    label: 'Staff / Settings',
    permissions: [
      ['staff.view', 'View staff'],
      ['staff.create', 'Create staff'],
      ['staff.edit', 'Edit staff'],
      ['staff.permissions', 'Manage staff access'],
      ['staff.schedule', 'Manage staff schedules'],
      ['staff.attendance', 'Manage attendance']
    ]
  }
];

const allPermissions = permissionGroups.flatMap((group) => group.permissions.map(([key]) => key));

const roleDefaults = {
  super_admin: allPermissions,
  manager: allPermissions.filter((permission) => !permission.startsWith('staff.')),
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
    'housekeeping.view',
    'housekeeping.create',
    'housekeeping.edit',
    'housekeeping.maintenance',
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
    'services.view',
    'services.create',
    'services.edit',
    'services.charge',
    'loyalty.view',
    'loyalty.create',
    'loyalty.points',
    'notifications.view',
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
    'items.edit',
    'services.view',
    'services.create',
    'services.edit'
  ]
};

function defaultPermissionsForRole(role) {
  return roleDefaults[role] || [];
}

function normalizePermissions(permissions, role) {
  if (role === 'super_admin') return [...allPermissions];
  const source = Array.isArray(permissions) ? permissions : defaultPermissionsForRole(role);
  return [...new Set(source.filter((permission) => allPermissions.includes(permission)))];
}

function normalizeStaffPermissions(staff) {
  if (!staff) return staff;
  return {
    ...staff,
    permissions: normalizePermissions(staff.permissions, staff.role)
  };
}

function hasPermission(user, permission) {
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  return normalizePermissions(user.permissions, user.role).includes(permission);
}

function hasAnyPermission(user, permissions) {
  return permissions.some((permission) => hasPermission(user, permission));
}

module.exports = {
  permissionGroups,
  allPermissions,
  defaultPermissionsForRole,
  normalizePermissions,
  normalizeStaffPermissions,
  hasPermission,
  hasAnyPermission
};
