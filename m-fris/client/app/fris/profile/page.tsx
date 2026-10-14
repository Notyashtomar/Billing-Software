'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Briefcase,
  Building2,
  CalendarDays,
  IdCard,
  Mail,
  MapPin,
  Phone,
  Plane,
  ShieldCheck,
  User,
  type LucideIcon,
} from 'lucide-react';
import { StationCompanyLogo } from '@/components/fris/layout/StationCompanyLogo';
import { PageLoading } from '@/components/ui/PageLoading';

import { cn } from '@/lib/utils';
import {
  normalizeFrisUserRole,
  validateFrisSession,
  type FrisSessionUser,
  type FrisUserRole,
} from '@/lib/fris-session';
import { getSessionStationLabel } from '@/lib/station-company-logo';

interface DepartmentInfo {
  [key: string]: string;
}

interface ProfileData {
  name: string;
  userId: string;
  email: string;
  role: FrisUserRole;
  gender?: string;
  joiningDate?: string;
  departmentName?: string;
  designation?: string;
  location?: string;
  airport?: string;
  employeeId?: string;
  phone?: string;
  company?: string;
}

const roleLabelMap: Record<FrisUserRole, string> = {
  employee: 'Employee',
  manager: 'Manager',
  superadmin: 'Super Admin',
};

const roleClassMap: Record<FrisUserRole, string> = {
  employee: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  manager: 'bg-purple-50 text-purple-700 border-purple-200',
  superadmin: 'bg-amber-50 text-amber-700 border-amber-200',
};

function formatJoiningDate(raw?: string): string | undefined {
  const value = String(raw ?? '').trim();
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    }
  }
  return value;
}

function departmentDisplayName(
  department: unknown,
  departmentLabel?: string,
  subDepartment?: string,
): string | undefined {
  const label = String(departmentLabel ?? '').trim();
  const sub = String(subDepartment ?? '').trim();
  if (label && sub) return `${label} · ${sub}`;
  if (label) return label;
  if (sub) return sub;

  if (typeof department === 'string' && department.trim()) return department.trim();
  if (department && typeof department === 'object' && !Array.isArray(department)) {
    const entries = Object.entries(department as DepartmentInfo).filter(
      ([, v]) => String(v ?? '').trim(),
    );
    if (entries.length === 0) {
      const keys = Object.keys(department as DepartmentInfo).filter(Boolean);
      return keys[0];
    }
    const [main, subDept] = entries[0]!;
    if (subDept && main && subDept.toLowerCase() !== main.toLowerCase()) {
      return `${main} · ${subDept}`;
    }
    return subDept || main;
  }
  return undefined;
}

function airportDisplay(user: FrisSessionUser): string | undefined {
  const stationLabel = getSessionStationLabel();
  if (stationLabel) {
    const { airport, code } = stationLabel;
    if (airport && code && airport !== code) return `${airport} (${code})`;
    return airport || code;
  }
  const station = String(user.station ?? '').trim();
  const code = String(user.stationCode ?? '').trim().toUpperCase();
  if (station && code) return `${station} (${code})`;
  return station || code || undefined;
}

function locationDisplay(user: FrisSessionUser): string | undefined {
  const city = String(user.city ?? '').trim();
  const locations = String(user.locations ?? '').trim();
  if (city) return city;
  if (locations) return locations;
  const stationCity = localStorage.getItem('userStationCity')?.trim();
  return stationCity || undefined;
}

function buildProfileFromSession(user: FrisSessionUser): ProfileData {
  const role = normalizeFrisUserRole(user.role);
  return {
    name: String(user.name ?? '').trim() || String(user.userid ?? '').trim(),
    userId: String(user.userid ?? '').trim(),
    email: String(user.email ?? '').trim(),
    role,
    gender: String(user.gender ?? '').trim() || undefined,
    joiningDate: formatJoiningDate(user.joiningDate),
    departmentName: departmentDisplayName(
      user.department,
      user.departmentLabel,
      user.subDepartment,
    ),
    designation: String(user.designation ?? '').trim() || undefined,
    location: locationDisplay(user),
    airport: airportDisplay(user),
    employeeId: String(user.employeeId ?? '').trim() || undefined,
    phone: String(user.phone ?? '').trim() || undefined,
    company: String(user.company ?? '').trim() || undefined,
  };
}

function buildProfileFromLocalStorage(): ProfileData | null {
  if (typeof window === 'undefined') return null;
  const isAuthenticated = localStorage.getItem('isAuthenticated') === 'true';
  const userId = localStorage.getItem('userId') || localStorage.getItem('userid') || '';
  if (!isAuthenticated || !userId) return null;

  let storedUser: FrisSessionUser | null = null;
  const rawUser = localStorage.getItem('user');
  if (rawUser) {
    try {
      storedUser = JSON.parse(rawUser) as FrisSessionUser;
    } catch {
      storedUser = null;
    }
  }

  if (storedUser?.userid) {
    return buildProfileFromSession({
      ...storedUser,
      userid: storedUser.userid || userId,
      name:
        storedUser.name ||
        localStorage.getItem('userName') ||
        userId,
      email:
        storedUser.email ||
        localStorage.getItem('userEmail') ||
        '',
      role: storedUser.role || localStorage.getItem('userRole') || undefined,
      gender: storedUser.gender || localStorage.getItem('userGender') || undefined,
      joiningDate:
        storedUser.joiningDate ||
        localStorage.getItem('userJoiningDate') ||
        undefined,
      designation:
        storedUser.designation ||
        localStorage.getItem('userDesignation') ||
        undefined,
      employeeId:
        storedUser.employeeId ||
        localStorage.getItem('userEmployeeId') ||
        undefined,
      phone: storedUser.phone || localStorage.getItem('userPhone') || undefined,
      company:
        storedUser.company || localStorage.getItem('userCompany') || undefined,
      city: storedUser.city || undefined,
      locations: storedUser.locations || undefined,
      station:
        storedUser.station ||
        localStorage.getItem('userAirport') ||
        undefined,
      stationCode:
        storedUser.stationCode ||
        localStorage.getItem('userStationCode') ||
        undefined,
      departmentLabel:
        storedUser.departmentLabel ||
        localStorage.getItem('userDepartmentLabel') ||
        undefined,
      subDepartment:
        storedUser.subDepartment ||
        localStorage.getItem('userSubDepartment') ||
        undefined,
    });
  }

  let department: unknown;
  const departmentRaw = localStorage.getItem('userDepartment');
  if (departmentRaw) {
    try {
      department = JSON.parse(departmentRaw);
    } catch {
      department = undefined;
    }
  }

  return buildProfileFromSession({
    userid: userId,
    name: localStorage.getItem('userName') || userId,
    email: localStorage.getItem('userEmail') || '',
    role: localStorage.getItem('userRole') || undefined,
    department,
    gender: localStorage.getItem('userGender') || undefined,
    joiningDate: localStorage.getItem('userJoiningDate') || undefined,
    designation: localStorage.getItem('userDesignation') || undefined,
    employeeId: localStorage.getItem('userEmployeeId') || undefined,
    phone: localStorage.getItem('userPhone') || undefined,
    company: localStorage.getItem('userCompany') || undefined,
    station: localStorage.getItem('userAirport') || undefined,
    stationCode: localStorage.getItem('userStationCode') || undefined,
    departmentLabel: localStorage.getItem('userDepartmentLabel') || undefined,
    subDepartment: localStorage.getItem('userSubDepartment') || undefined,
    city: localStorage.getItem('userLocation') || undefined,
  });
}

/** Single label/value row with an accented icon chip. */
function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value?: string;
}) {
  const hasValue = Boolean(value && value.trim());
  return (
    <div className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
        <Icon className="h-[18px] w-[18px]" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
          {label}
        </p>
        <p
          className={cn(
            'truncate text-sm',
            hasValue ? 'font-medium text-gray-800' : 'italic text-gray-400',
          )}
          title={hasValue ? value : undefined}
        >
          {hasValue ? value : 'Not provided'}
        </p>
      </div>
    </div>
  );
}

/** Compact key/value chip used in the hero meta strip. */
function MetaPill({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value?: string;
}) {
  const hasValue = Boolean(value && value.trim());
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
          {label}
        </p>
        <p
          className={cn(
            'truncate text-sm',
            hasValue ? 'font-medium text-gray-800' : 'italic text-gray-400',
          )}
          title={hasValue ? value : undefined}
        >
          {hasValue ? value : '—'}
        </p>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const session = await validateFrisSession();
      if (session.ok && session.user) {
        setProfile(buildProfileFromSession(session.user));
        return;
      }
      setProfile(buildProfileFromLocalStorage());
    } catch {
      setProfile(buildProfileFromLocalStorage());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const initials = useMemo(() => {
    if (!profile?.name) return 'U';
    return profile.name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }, [profile?.name]);

  if (loading) {
    return <PageLoading />;
  }

  if (!profile) {
    return (
      <div className="min-h-[calc(100vh-48px)] bg-gray-50 px-4 py-8 md:px-8">
        <div className="mx-auto flex max-w-3xl flex-col items-center rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
          <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-gray-400">
            <User className="h-7 w-7" aria-hidden />
          </span>
          <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
          <p className="mt-2 max-w-sm text-sm text-gray-500">
            No user profile data is available. Please log in to view your
            profile.
          </p>
        </div>
      </div>
    );
  }

  const subtitle =
    [profile.designation, profile.departmentName].filter(Boolean).join(' · ') ||
    roleLabelMap[profile.role];

  return (
    <div className="min-h-[calc(100vh-48px)] bg-gray-50 px-4 py-8 md:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm md:p-7">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xl font-semibold text-white ring-1 ring-emerald-700/20">
                {initials}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="truncate text-xl font-semibold text-gray-900">
                    {profile.name}
                  </h1>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
                      roleClassMap[profile.role],
                    )}
                  >
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                    {roleLabelMap[profile.role]}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-sm text-gray-500">{subtitle}</p>
              </div>
            </div>
            <StationCompanyLogo
              className="hidden h-9 w-auto shrink-0 sm:block"
              alt="Company logo"
            />
          </div>

          <div className="mt-5 grid grid-cols-1 gap-x-6 gap-y-3 border-t border-gray-100 pt-5 sm:grid-cols-2 lg:grid-cols-3">
            <MetaPill icon={IdCard} label="User ID" value={profile.userId} />
            <MetaPill icon={Mail} label="Email" value={profile.email} />
            <MetaPill icon={MapPin} label="Location" value={profile.location} />
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-2 flex items-center gap-2 text-base font-semibold text-gray-900">
              <User className="h-4 w-4 text-emerald-600" aria-hidden />
              Account Information
            </h2>
            <div className="divide-y divide-gray-100">
              {profile.employeeId &&
              profile.employeeId !== profile.userId ? (
                <InfoRow
                  icon={IdCard}
                  label="Employee ID"
                  value={profile.employeeId}
                />
              ) : null}
              <InfoRow icon={Phone} label="Phone" value={profile.phone} />
              <InfoRow icon={User} label="Gender" value={profile.gender} />
              <InfoRow
                icon={CalendarDays}
                label="Joining Date"
                value={profile.joiningDate}
              />
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-2 flex items-center gap-2 text-base font-semibold text-gray-900">
              <Building2 className="h-4 w-4 text-emerald-600" aria-hidden />
              Organization Details
            </h2>
            <div className="divide-y divide-gray-100">
              <InfoRow
                icon={Building2}
                label="Company"
                value={profile.company}
              />
              <InfoRow
                icon={Building2}
                label="Department"
                value={profile.departmentName}
              />
              <InfoRow
                icon={Briefcase}
                label="Designation"
                value={profile.designation}
              />
              {profile.airport &&
              profile.airport !== profile.location ? (
                <InfoRow icon={Plane} label="Airport" value={profile.airport} />
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
