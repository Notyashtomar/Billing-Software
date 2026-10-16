function stripQuery(path: string): string {
  return String(path ?? '').split('?')[0] || '/';
}

/** Browser routes that must never appear on the user-activity log or live page. */
export const UNTRACKED_CLIENT_PATH_SOURCE = '^/ultraadm(?:[/?]|$)';

const UNTRACKED_CLIENT_PATH = new RegExp(UNTRACKED_CLIENT_PATH_SOURCE, 'i');

export function isUntrackedClientPath(rawPath: string): boolean {
  const path = stripQuery(rawPath).trim();
  if (!path) return false;
  return UNTRACKED_CLIENT_PATH.test(path);
}

export function ymdTodayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function describeUserAction(method: string, rawPath: string): string {
  const m = String(method ?? 'GET').toUpperCase();
  const path = stripQuery(rawPath).toLowerCase();

  const verb =
    m === 'POST'
      ? 'Created'
      : m === 'PUT' || m === 'PATCH'
        ? 'Updated'
        : m === 'DELETE'
          ? 'Deleted'
          : 'Viewed';

  if (path.includes('/auth/login') && !path.includes('admin-login')) {
    return 'Signed in to FRIS';
  }
  if (path.includes('/auth/admin-login')) return 'Signed in to admin panel';
  if (path.includes('/auth/logout-all')) return 'Signed out from all devices';
  if (path.includes('/auth/admin-logout')) return 'Signed out of admin panel';
  if (path.includes('/auth/logout')) return 'Signed out of FRIS';
  if (path.includes('/auth/forgot-password/verify-otp')) {
    return 'Verified password reset OTP';
  }
  if (path.includes('/auth/forgot-password/verify-reset')) {
    return 'Reset password via OTP';
  }
  if (path.includes('/auth/forgot-password')) return 'Requested password reset';
  if (path.includes('/auth/reset-password')) return 'Reset password';
  if (path.includes('/auth/fris/navigate/advance')) return 'Opened Advance section';
  if (path.includes('/auth/fris/navigate/creation')) return 'Opened Creation section';
  if (path.includes('/auth/send-otp')) return 'Requested flight OTP';
  if (path.includes('/auth/verify-otp')) return 'Verified flight OTP';

  if (path.includes('/fhr-collection')) return `${verb} FHR record`;
  if (path.includes('/by-fhr/')) return `${verb} flight record by FHR`;
  if (path.includes('/ns-raw-flight-data/main-details') || path.endsWith('/main-details')) {
    return `${verb} main details`;
  }
  if (path.includes('/ns-raw-flight-data/terminal-details') || path.endsWith('/terminal-details')) {
    return `${verb} terminal details`;
  }
  if (path.includes('/ns-raw-flight-data/load-control') || path.includes('/load-control')) {
    return `${verb} load control`;
  }
  if (path.includes('/ramp-details-3') || path.includes('/ramp-details-2') || path.includes('/ramp-details')) {
    return `${verb} ramp details`;
  }
  if (path.includes('/equipment-manpower')) return `${verb} equipment / manpower`;
  if (path.includes('/manifest-details')) return `${verb} manifest`;
  if (path.includes('/attachments-details')) return `${verb} attachments`;
  if (path.includes('/remarks-details')) return `${verb} remarks`;

  if (path.includes('/flights/cancel') || path.includes('/flight-cancellations')) {
    return `${verb} flight cancellation`;
  }
  if (path.includes('/scheduled-airline-pipeline/creation-raf')) {
    return `${verb} RAF creation`;
  }
  if (path.includes('/scheduled-airline-pipeline/creation')) {
    return `${verb} scheduled airline creation`;
  }
  if (path.includes('/scheduled-airline-pipeline')) return `${verb} scheduled flight data`;
  if (path.includes('/raw-flight-data')) return `${verb} raw flight data`;
  if (path.includes('/performance-flights')) return `${verb} performance flights`;

  if (path.includes('/dashboard-kpi-flights')) return `${verb} dashboard KPI flights`;
  if (path.includes('/dashboard-summaries')) return `${verb} dashboard summaries`;
  if (path.includes('/dashboard-data')) return `${verb} dashboard data`;

  if (path.includes('/pax-shift/')) return `${verb} pax shift data`;
  if (path.includes('/reports-ramp-shift')) return `${verb} ramp shift report`;
  if (path.includes('/reports/')) return `${verb} report`;

  if (path.includes('/advance-invoicing')) return `${verb} advance invoicing`;
  if (path.includes('/advance-cargo')) return `${verb} advance cargo`;
  if (path.includes('/advance-')) return `${verb} advance master data`;

  if (path.includes('/import/')) return `${verb} data import`;
  if (path.includes('/training-matrix')) return `${verb} training matrix`;
  if (path.includes('/sta-ata-daily')) return `${verb} STA/ATA daily data`;

  if (path.includes('/register/invite') || path.includes('/user-registration')) {
    return m === 'POST'
      ? 'Registered a new employee'
      : `${verb} an employee registration`;
  }

  // Admin panel — support tickets
  if (path.includes('/users/support-ticket') || path.includes('/support-ticket')) {
    if (m === 'POST') return 'Raised a support ticket';
    if (m === 'DELETE') return 'Removed a support ticket';
    if (m === 'PATCH' || m === 'PUT') return 'Updated a support ticket';
    return 'Opened the Raise ticket query page';
  }

  // Admin panel — Users page
  if (path.includes('/users')) {
    const isSingle = /\/users\/(panel\/)?[^/]+/.test(path);
    if (m === 'POST') return 'Created a new user account';
    if (m === 'DELETE') return 'Removed a user account';
    if (m === 'PATCH' || m === 'PUT') return 'Updated a user account';
    return isSingle ? 'Viewed a user profile' : 'Opened the Users page';
  }

  // Admin panel — Department page
  if (path.includes('/admin-departments')) {
    const isSingle = /\/admin-departments\/[^/]+/.test(path);
    if (m === 'POST') return 'Created a department';
    if (m === 'DELETE') return 'Removed a department';
    if (m === 'PATCH' || m === 'PUT') return 'Updated a department';
    return isSingle ? 'Viewed a department' : 'Opened the Department page';
  }

  // Admin panel — Stations page
  if (path.includes('/admin-stations')) {
    const isSingle = /\/admin-stations\/[^/]+/.test(path);
    if (m === 'POST') return 'Added a station';
    if (m === 'DELETE') return 'Removed a station';
    if (m === 'PATCH' || m === 'PUT') return 'Updated a station';
    return isSingle ? 'Viewed a station' : 'Opened the Stations page';
  }

  // Admin panel — Admins page
  if (path.includes('/admins')) {
    if (m === 'POST') return 'Created an admin account';
    if (m === 'DELETE') return 'Removed an admin account';
    if (m === 'PATCH' || m === 'PUT') return 'Updated an admin account';
    return 'Opened the Admins page';
  }

  if (path.includes('/export')) return 'Exported data';

  // Friendly fallback: use the first readable path segment (no raw URL noise).
  const segment =
    stripQuery(rawPath).replace(/^\/+/, '').split('/')[0] || 'home';
  const readable = segment.replace(/[-_]/g, ' ').trim() || 'a page';
  return `${verb} ${readable}`;
}

/**
 * Best-effort human-readable location (Module → Page) for a request path. Used
 * to populate the Module/Page columns for actions that don't emit their own
 * rich audit entry. Returns empty strings when unknown.
 */
export function deriveAuditLocation(rawPath: string): {
  module: string;
  page: string;
} {
  const path = stripQuery(rawPath).toLowerCase();
  const at = (module: string, page: string) => ({ module, page });

  if (path.includes('/auth/page-presence')) return at('Navigation', 'Page view');
  if (path.includes('/auth/')) return at('Authentication', 'Session');
  if (path.includes('/users/support-ticket') || path.includes('/support-ticket'))
    return at('Administration', 'Support Tickets');
  if (path.includes('/users')) return at('User Management', 'Users');
  if (path.includes('/admin-departments')) return at('Administration', 'Departments');
  if (path.includes('/admin-stations')) return at('Station Management', 'Stations');
  if (path.includes('/admins')) return at('Administration', 'Admins');
  if (path.includes('/register/invite') || path.includes('/user-registration'))
    return at('User Management', 'Employee Onboarding');

  if (path.includes('/non-scheduled-booking') || path.includes('/ns-fhr'))
    return at('Flights', 'Non-Scheduled Airlines');
  if (path.includes('/scheduled-airline-pipeline/creation-raf'))
    return at('Creation', 'RAF');
  if (path.includes('/scheduled-airline-pipeline'))
    return at('Creation', 'Scheduled Airlines');
  if (path.includes('/flights/cancel') || path.includes('/flight-cancellations'))
    return at('Flights', 'Cancellation');
  if (path.includes('/main-details') || path.includes('/terminal-details') || path.includes('/ramp-details'))
    return at('Flights', 'Flight Forms');
  if (path.includes('/fhr-collection') || path.includes('/raw-flight-data'))
    return at('Flights', 'Flight Records');
  if (path.includes('/pax-shift') || path.includes('/duty-allocation'))
    return at('Reports', 'Pax Shift');
  if (path.includes('/advance-')) return at('Advance', 'Master Data');
  if (path.includes('/reports')) return at('Reports', 'Reports');
  if (path.includes('/mis')) return at('MIS', 'MIS');
  if (path.includes('/export')) return at('Reports', 'Export');
  if (path.includes('/dashboard')) return at('Dashboard', 'Dashboard');

  return at('', '');
}

/**
 * Map a browser pathname (`/fris/...`, `/admin/...`) to BWMS system + page labels.
 * Used for page-presence beacons and `x-client-path` headers.
 */
export function deriveClientPageLocation(rawPath: string): {
  systemId: string;
  systemLabel: string;
  module: string;
  page: string;
  tab: string;
} {
  const full = String(rawPath ?? '').trim();
  const pathOnly = stripQuery(full);
  const path = pathOnly.toLowerCase();
  const at = (
    systemId: string,
    systemLabel: string,
    module: string,
    page: string,
    tab = '',
  ) => ({ systemId, systemLabel, module, page, tab });

  if (!path || path === '/') return at('', '', '', '', '');

  // Admin panel (login tile: Admin Panel)
  if (path.startsWith('/admin')) {
    if (path.startsWith('/admin/dashboard'))
      return at('admin-panel-people', 'Admin Panel', 'Admin', 'Dashboard');
    if (path.startsWith('/admin/users') || path.startsWith('/admin/user/'))
      return at('admin-panel-people', 'Admin Panel', 'Admin', 'Users');
    if (path.startsWith('/admin/user-credentials'))
      return at('admin-panel-people', 'Admin Panel', 'Admin', 'User ID & Password');
    if (path.startsWith('/admin/stations') || path.startsWith('/admin/departments'))
      return at('admin-panel-people', 'Admin Panel', 'Admin', 'Stations & Depts');
    if (path.startsWith('/admin/training'))
      return at('admin-panel-people', 'Admin Panel', 'Admin', 'Training');
    if (path.startsWith('/admin/tickets'))
      return at('admin-panel-people', 'Admin Panel', 'Admin', 'Tickets');
    if (path.startsWith('/admin/notifications'))
      return at('admin-panel-people', 'Admin Panel', 'Admin', 'Notifications');
    if (path.startsWith('/admin/user-activity'))
      return at('admin-panel-people', 'Admin Panel', 'Admin', 'User Activity');
    if (path.startsWith('/admin/export'))
      return at('admin-panel-people', 'Admin Panel', 'Admin', 'Export');
    if (path.startsWith('/admin/system-check'))
      return at('admin-panel-people', 'Admin Panel', 'Admin', 'System Check');
    if (path.startsWith('/admin/login'))
      return at('admin-panel-people', 'Admin Panel', 'Admin', 'Login');
    return at(
      'admin-panel-people',
      'Admin Panel',
      'Admin',
      titleCaseSegment(path.split('/').filter(Boolean).pop() || 'Admin'),
    );
  }

  // Billing
  if (path.startsWith('/billing')) {
    const seg = path.split('/').filter(Boolean)[1] || 'dashboard';
    return at('billing-finance', 'Billing', 'Billing', titleCaseSegment(seg));
  }

  // FRIS
  if (path.startsWith('/fris')) {
    if (path.startsWith('/fris/dashboard'))
      return at('fris', 'FRIS', 'FRIS', 'Dashboard');
    if (path.includes('non-scheduled') || path.includes('non-scheduled-airlines')) {
      if (path.includes('booking-details'))
        return at('fris', 'FRIS', 'FRIS', 'Non-Scheduled', 'Booking details');
      if (path.includes('non-scheduled-booking') || path.includes('booking'))
        return at('fris', 'FRIS', 'FRIS', 'Non-Scheduled', 'Booking');
      if (path.includes('data-export'))
        return at('fris', 'FRIS', 'FRIS', 'Non-Scheduled', 'Data export');
      if (path.includes('cancellation'))
        return at('fris', 'FRIS', 'FRIS', 'Non-Scheduled', 'Cancellation history');
      if (path.includes('/mis'))
        return at('fris', 'FRIS', 'FRIS', 'Non-Scheduled', 'MIS');
      return at('fris', 'FRIS', 'FRIS', 'Non-Scheduled Airlines');
    }
    if (path.includes('scheduledairlines') || path.includes('scheduled-airline')) {
      if (path.includes('data-export'))
        return at('fris', 'FRIS', 'FRIS', 'Scheduled Airlines', 'Data export');
      if (path.includes('cancellation'))
        return at('fris', 'FRIS', 'FRIS', 'Scheduled Airlines', 'Cancellation history');
      return at('fris', 'FRIS', 'FRIS', 'Scheduled Airlines');
    }
    if (path.startsWith('/fris/creation')) return at('fris', 'FRIS', 'FRIS', 'Creation');
    if (path.startsWith('/fris/advance')) return at('fris', 'FRIS', 'FRIS', 'Advance');
    if (path.includes('pax-shift') || path.includes('duty-allocation'))
      return at('fris', 'FRIS', 'FRIS', 'Reports', 'Pax Shift');
    if (path.startsWith('/fris/reports')) return at('fris', 'FRIS', 'FRIS', 'Reports');
    if (path.startsWith('/fris/mis')) return at('fris', 'FRIS', 'FRIS', 'MIS');
    if (path.startsWith('/fris/flights')) return at('fris', 'FRIS', 'FRIS', 'Flights');
    const seg = path.split('/').filter(Boolean).slice(1).join(' / ') || 'Home';
    return at('fris', 'FRIS', 'FRIS', titleCaseSegment(seg));
  }

  // Other BWMS login tiles / operational modules
  if (path.startsWith('/trp'))
    return at('trp', 'TRP', 'TRP', titleCaseSegment(path.split('/')[2] || 'Master'));
  if (path.startsWith('/safety-incident') || path.startsWith('/safety'))
    return at(
      'safety-incident',
      'Safety & Incident',
      'Safety',
      titleCaseSegment(path.split('/')[2] || 'Home'),
    );
  if (path.startsWith('/cms'))
    return at('cms', 'CMS', 'CMS', titleCaseSegment(path.split('/')[2] || 'Home'));
  if (path.startsWith('/hr'))
    return at('hr', 'HR', 'HR', titleCaseSegment(path.split('/').filter(Boolean).slice(1).join(' ') || 'Home'));
  if (path.startsWith('/manuals'))
    return at('manuals', 'Manuals', 'Manuals', titleCaseSegment(path.split('/')[2] || 'Master'));
  if (path.startsWith('/compliance'))
    return at('compliance', 'Compliance', 'Compliance', titleCaseSegment(path.split('/')[2] || 'Home'));
  if (path.startsWith('/maas'))
    return at('maas-services', 'MAAS Services', 'MAAS', titleCaseSegment(path.split('/')[2] || 'Home'));
  if (path.startsWith('/grooming'))
    return at('grooming-checklist', 'Grooming', 'Grooming', titleCaseSegment(path.split('/')[2] || 'Home'));
  if (path.startsWith('/log-data'))
    return at('log-data', 'Log Data', 'Log Data', titleCaseSegment(path.split('/')[2] || 'Home'));
  if (path.startsWith('/uld'))
    return at('uld', 'ULD', 'ULD', titleCaseSegment(path.split('/')[2] || 'Home'));
  if (path.startsWith('/ams'))
    return at('ams', 'AMS', 'AMS', titleCaseSegment(path.split('/')[2] || 'Home'));
  if (path.startsWith('/chr'))
    return at('chr', 'CHR', 'CHR', titleCaseSegment(path.split('/')[2] || 'Home'));
  if (path.startsWith('/ba-test') || path.startsWith('/batest'))
    return at('ba-test', 'BA Test', 'BA Test', titleCaseSegment(path.split('/')[2] || 'Home'));
  if (path.startsWith('/aep'))
    return at('aep', 'AEP', 'AEP', titleCaseSegment(path.split('/')[2] || 'Home'));
  if (path.startsWith('/hired-gse') || path.startsWith('/hiredgse'))
    return at('hired-gse', 'Hired GSE', 'Hired GSE', titleCaseSegment(path.split('/')[2] || 'Home'));
  if (path.startsWith('/namaskar'))
    return at('namaskar-services', 'Namaskar', 'Namaskar', titleCaseSegment(path.split('/')[2] || 'Home'));
  if (path.startsWith('/do-money') || path.startsWith('/domoney'))
    return at('do-money', 'DO Money', 'DO Money', titleCaseSegment(path.split('/')[2] || 'Home'));
  if (path.startsWith('/bill-receivables'))
    return at(
      'bill-receivables',
      'Bill Receivables',
      'Bill Receivables',
      titleCaseSegment(path.split('/')[2] || 'Home'),
    );
  if (path.startsWith('/gemm'))
    return at('gemm', 'GEMM', 'GEMM', titleCaseSegment(path.split('/')[2] || 'Home'));
  if (path.startsWith('/meeting'))
    return at('meeting', 'Meeting', 'Meeting', titleCaseSegment(path.split('/')[2] || 'Home'));
  if (path.startsWith('/calendar'))
    return at('calendar', 'Calendar', 'Calendar', titleCaseSegment(path.split('/')[2] || 'Home'));
  if (path.startsWith('/login'))
    return at('', 'Login', 'Authentication', 'Login');

  const head = path.split('/').filter(Boolean)[0] || 'app';
  return at(
    head,
    titleCaseSegment(head),
    'App',
    titleCaseSegment(path.split('/').filter(Boolean).pop() || path),
  );
}

function titleCaseSegment(raw: string): string {
  return String(raw ?? '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function shouldSkipActionLog(method: string, rawPath: string): boolean {
  const m = String(method ?? 'GET').toUpperCase();
  if (m === 'OPTIONS' || m === 'HEAD') return true;

  const path = stripQuery(rawPath).toLowerCase();
  if (path === '/health' || path.startsWith('/health/')) return true;

  // High-frequency reads that are not meaningful user actions.
  if (path === '/auth/session' || path.endsWith('/auth/session')) return true;
  // Dedicated beacon — AuthService emits a rich page-presence row itself.
  if (path.includes('/auth/page-presence')) return true;
  // Session validation poll fired on every admin page load — pure noise.
  if (path === '/admins/me' || path.endsWith('/admins/me')) return true;
  if (path.includes('/users/notification-center')) return true;
  if (path.includes('/admins/user-action-logs')) return true;
  if (path.includes('/admin/audit')) return true;
  if (path.includes('/admins/notifications/feed')) return true;
  if (path.includes('/admins/notifications/mark-all-read')) return true;
  if (path.includes('/admins/notifications/shoot')) return true;

  // Billing mutations emit rich activity only after their domain audit is
  // persisted. Reads and this interceptor's vague duplicate writes are noise.
  if (path === '/billing' || path.startsWith('/billing/')) return true;

  // Panel-user create/update/delete emit their own rich, field-level audit
  // entries from UserService — skip the generic interceptor to avoid a vague
  // duplicate ("Updated a user account") alongside the detailed one.
  const isUserWrite = m === 'POST' || m === 'PATCH' || m === 'PUT' || m === 'DELETE';
  if (isUserWrite && (path === '/users' || path.endsWith('/users'))) return true;
  if (isUserWrite && path.includes('/users/panel/')) return true;

  return false;
}
