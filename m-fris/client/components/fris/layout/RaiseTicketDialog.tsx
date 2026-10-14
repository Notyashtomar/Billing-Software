'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  CheckCircle2,
  Copy,
  ImagePlus,
  Mail,
  MessageSquarePlus,
  Search,
  Ticket,
  Trash2,
  Video,
  XCircle,
  Loader2,
  ChevronRight,
  MessageSquare,
  AlertCircle,
} from 'lucide-react';
import { getErrorMessage } from '@/lib/error-utils';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { PERMISSION_NAV_DROPDOWNS } from '@/lib/nav-permissions';
import {
  buildSectionDropdownOptions,
  buildSubPageDropdownOptions,
  findTicketPageInSection,
  ticketSectionPaths,
  type TicketNavSection,
} from '@/lib/ticket-nav-pages';
import {
  closeSupportTicket,
  fetchMySupportTickets,
  fetchSupportTicketAdminContacts,
  resolveSupportTicketUserEmail,
  submitSupportTicket,
  trackSupportTicket,
  type SupportTicketAdminContact,
  type SupportTicketAttachmentView,
  type SupportTicketDetail,
  type SupportTicketSummary,
} from '@/lib/support-tickets-api';
import { FormFieldError } from '@/components/ui/FormFieldError';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import {
  FRIS_INVALID_CONTROL,
  required,
  minLength,
  maxLength,
  normalizeText,
  fileMaxSize,
  runValidators,
  selectRequired,
  type FieldErrors,
} from '@/lib/form-validation';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
const ATTACHMENT_MAX_COUNT = 8;

const RAISE_FIELD_ORDER = [
  'sectionPath',
  'subPagePath',
  'issueReason',
  'description',
  'urgency',
  'issueType',
  'attachments',
] as const;
type RaiseField = (typeof RAISE_FIELD_ORDER)[number];

const TRACK_FIELD_ORDER = ['trackTicketId'] as const;
type TrackField = (typeof TRACK_FIELD_ORDER)[number];

const CLOSE_FIELD_ORDER = ['closeTicketId', 'closeComment'] as const;
type CloseField = (typeof CLOSE_FIELD_ORDER)[number];

const URGENCY_OPTIONS = ['urgent', 'non-urgent'] as const;
const ISSUE_TYPES = [
  'Cosmetic',
  'Minor',
  'Major',
  'Catastrophic',
  'Show stopper',
] as const;

const ISSUE_REASON_OTHER_VALUE = 'OTHER';

const ISSUE_REASON_CATEGORIES = [
  { prefix: 'UI', category: 'Interface/Display', subcategories: ['DISPLAY', 'LAYOUT', 'RESPONSIVE', 'LOADING'] },
  { prefix: 'DATA', category: 'Data Issues', subcategories: ['MISSING', 'INCORRECT', 'SYNC', 'DUPLICATE'] },
  { prefix: 'FUNC', category: 'Functionality', subcategories: ['BUTTON', 'DROPDOWN', 'SAVE', 'SEARCH', 'FILTER'] },
  { prefix: 'PERF', category: 'Performance', subcategories: ['SLOW', 'TIMEOUT', 'CRASH'] },
  { prefix: 'AUTH', category: 'Access/Permissions', subcategories: ['LOGIN', 'ROLE', 'SESSION'] },
  { prefix: 'INTG', category: 'Integrations', subcategories: ['API', 'EXPORT', 'IMPORT'] },
] as const;

const ISSUE_REASON_OPTIONS = [
  ...ISSUE_REASON_CATEGORIES.flatMap((entry) =>
    entry.subcategories.map((sub) => ({
      value: `${entry.prefix}:${sub}`,
      label: `${entry.prefix} — ${entry.category}: ${sub}`,
    })),
  ),
  { value: ISSUE_REASON_OTHER_VALUE, label: 'Others' },
];

const ACCEPTED_MEDIA = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/svg+xml',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
]);

const dropdownTriggerClass = 'h-10 w-full min-w-0';

type Urgency = (typeof URGENCY_OPTIONS)[number];
type IssueType = (typeof ISSUE_TYPES)[number];
type TicketTab = 'raise' | 'track' | 'contact' | 'close';

type UploadedMedia = {
  id: string;
  file: File;
  previewUrl: string;
  kind: 'image' | 'video';
};

const TABS: { id: TicketTab; label: string; icon: typeof Ticket }[] = [
  { id: 'raise', label: 'New ticket', icon: MessageSquarePlus },
  { id: 'track', label: 'Track ticket', icon: Search },
  { id: 'contact', label: 'Contact admins', icon: Mail },
  { id: 'close', label: 'Close ticket', icon: XCircle },
];

export type RaiseTicketDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  navSections: TicketNavSection[];
  currentPath?: string;
};

function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className="text-sm font-medium text-gray-700 dark:text-[var(--dash-text-strong)]"
    >
      {children}
    </label>
  );
}

function formatUrgency(value: Urgency): string {
  return value === 'urgent' ? 'Urgent' : 'Non-urgent';
}

function formatTicketWhen(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}


function getLoggedInUserEmail(): string {
  return resolveSupportTicketUserEmail();
}

function isVideoMime(mimeType: string): boolean {
  return mimeType.startsWith('video/');
}

function TicketAttachmentsGallery({
  attachments,
}: {
  attachments: SupportTicketAttachmentView[];
}) {
  if (!attachments.length) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-[var(--dash-text-muted)]">
        Attachments ({attachments.length})
      </p>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {attachments.map((item) => (
          <li
            key={`${item.fileName}-${item.sizeBytes}`}
            className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-[var(--dash-border)] dark:bg-[var(--dash-card-elevated)]"
          >
            {isVideoMime(item.mimeType) ? (
              <video
                src={item.dataUrl}
                controls
                playsInline
                preload="metadata"
                className="aspect-video w-full bg-black object-contain"
              >
                <track kind="captions" />
              </video>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.dataUrl}
                alt={item.fileName}
                className="aspect-video w-full object-contain bg-gray-100 dark:bg-[var(--dash-surface)]"
              />
            )}
            <p className="truncate border-t border-gray-100 px-2 py-1.5 text-xs text-gray-600 dark:border-[var(--dash-border)] dark:text-[var(--dash-text-muted)]">
              {item.fileName}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function isTicketClosed(status: string): boolean {
  return status === 'closed';
}

function StatusBadge({ status }: { status: string }) {
  const closed = isTicketClosed(status);
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ring-1',
        closed
          ? 'bg-emerald-100 text-emerald-800 ring-emerald-300/60 dark:bg-emerald-900/40 dark:text-emerald-300 dark:ring-emerald-500/40'
          : 'bg-amber-100 text-amber-900 ring-amber-300/70 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-500/45',
      )}
    >
      {closed ? 'Closed' : 'Open'}
    </span>
  );
}

function ticketDetailCardClass(status: string): string {
  return isTicketClosed(status)
    ? 'border-emerald-200/80 bg-emerald-50/50 dark:border-emerald-800/40 dark:bg-emerald-950/20'
    : 'border-amber-200/80 bg-amber-50/50 dark:border-amber-700/40 dark:bg-amber-950/25';
}

function ticketDetailHeaderClass(status: string): string {
  return isTicketClosed(status)
    ? 'border-emerald-200/60 dark:border-emerald-800/40'
    : 'border-amber-200/60 dark:border-amber-700/40';
}

function ticketDetailIdClass(status: string): string {
  return isTicketClosed(status)
    ? 'text-emerald-800 dark:text-emerald-300'
    : 'text-amber-900 dark:text-amber-200';
}

function recentTicketButtonClass(status: string, isSelected: boolean): string {
  const closed = isTicketClosed(status);
  if (isSelected) {
    return closed
      ? 'border-emerald-500 bg-emerald-50/80 dark:border-emerald-600 dark:bg-emerald-950/30'
      : 'border-amber-500 bg-amber-50/80 dark:border-amber-600 dark:bg-amber-950/35';
  }
  return closed
    ? 'border-gray-200 hover:border-emerald-400 hover:bg-emerald-50/50 dark:border-[var(--dash-border)] dark:hover:border-emerald-600/50 dark:hover:bg-emerald-950/20'
    : 'border-gray-200 hover:border-amber-400 hover:bg-amber-50/50 dark:border-[var(--dash-border)] dark:hover:border-amber-600/50 dark:hover:bg-amber-950/20';
}

function TicketDetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-[var(--dash-text-muted)]">
        {label}
      </p>
      <p className="mt-1 break-words text-sm leading-snug text-gray-900 dark:text-[var(--dash-text)]">
        {value}
      </p>
    </div>
  );
}

function TicketDetailCard({ ticket }: { ticket: SupportTicketDetail }) {
  return (
    <div
      className={cn(
        'w-full rounded-xl border p-4',
        ticketDetailCardClass(ticket.status),
      )}
    >
      <div
        className={cn(
          'mb-4 flex items-start justify-between gap-3 border-b pb-3',
          ticketDetailHeaderClass(ticket.status),
        )}
      >
        <p
          className={cn(
            'min-w-0 break-all font-mono text-sm font-bold',
            ticketDetailIdClass(ticket.status),
          )}
        >
          {ticket.ticketNumber}
        </p>
        <StatusBadge status={ticket.status} />
      </div>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TicketDetailRow label="Raised" value={formatTicketWhen(ticket.raisedAt)} />
          <TicketDetailRow
            label="Closed"
            value={ticket.closedAt ? formatTicketWhen(ticket.closedAt) : '—'}
          />
        </div>
        <TicketDetailRow
          label="Page"
          value={`${ticket.navigationPageLabel} → ${ticket.subPageLabel}`}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TicketDetailRow
            label="Severity"
            value={`${ticket.urgency.replace('-', ' ')} · ${ticket.issueType}`}
          />
          <TicketDetailRow label="Reason" value={ticket.issueReason} />
        </div>
        <TicketDetailRow label="Description" value={ticket.description} />
        {ticket.closeComment ? (
          <TicketDetailRow label="Closing comment" value={ticket.closeComment} />
        ) : null}
        {ticket.attachments && ticket.attachments.length > 0 ? (
          <TicketAttachmentsGallery attachments={ticket.attachments} />
        ) : null}
      </div>
    </div>
  );
}

function buildPermissionTicketSection(
  sectionLabel: 'Creation' | 'Advance',
  basePath: string,
  entries: readonly { label: string; path: string }[],
): TicketNavSection {
  return {
    sectionLabel,
    sectionPath: basePath,
    hasNavDropdown: true,
    groups: entries.map((entry) => ({
      groupLabel: entry.label,
      groupPath: entry.path,
      hasNested: false,
      items: [{ label: entry.label, path: entry.path, isNested: false }],
    })),
  };
}

function enrichTicketNavSections(sections: TicketNavSection[]): TicketNavSection[] {
  return sections.map((section) => {
    if (section.sectionLabel === 'Creation') {
      const paths = ticketSectionPaths(section);
      if (paths.length > 1) return section;
      return buildPermissionTicketSection(
        'Creation',
        '/fris/creation',
        PERMISSION_NAV_DROPDOWNS.creation,
      );
    }
    if (section.sectionLabel === 'Advance') {
      const paths = ticketSectionPaths(section);
      if (paths.length > 1) return section;
      return buildPermissionTicketSection('Advance', '/fris/advance', PERMISSION_NAV_DROPDOWNS.advance);
    }
    return section;
  });
}

function resolveTicketLocation(
  sections: TicketNavSection[],
  pathname: string,
  search: string,
): { sectionPath: string; subPagePath: string } | null {
  const fullPath = search
    ? `${pathname}${search.startsWith('?') ? search : `?${search}`}`
    : pathname;

  for (const section of sections) {
    const hit = findTicketPageInSection(section, fullPath);
    if (hit) {
      return { sectionPath: section.sectionPath, subPagePath: hit.page.path };
    }
  }

  for (const section of sections) {
    if (pathname !== section.sectionPath && !pathname.startsWith(`${section.sectionPath}/`)) {
      continue;
    }

    if (section.sectionLabel === 'Creation' && search) {
      const params = new URLSearchParams(search.replace(/^\?/, ''));
      const sectionParam = params.get('section');
      if (sectionParam) {
        const candidate = `/fris/creation?section=${sectionParam}`;
        const hit = findTicketPageInSection(section, candidate);
        if (hit) {
          return { sectionPath: section.sectionPath, subPagePath: hit.page.path };
        }
      }
    }

    if (section.sectionLabel === 'Advance' && search) {
      const params = new URLSearchParams(search.replace(/^\?/, ''));
      const tab = params.get('tab');
      if (tab) {
        const candidate = `/fris/advance?tab=${tab}`;
        const hit = findTicketPageInSection(section, candidate);
        if (hit) {
          return { sectionPath: section.sectionPath, subPagePath: hit.page.path };
        }
      }
    }

    const paths = ticketSectionPaths(section);
    if (paths.length > 0) {
      return { sectionPath: section.sectionPath, subPagePath: paths[0] };
    }
  }

  return null;
}

function RaiseTicketDialogInner({
  open,
  onOpenChange,
  navSections,
  currentPath,
}: RaiseTicketDialogProps) {
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  const locationSearch = searchParams?.toString() ? `?${searchParams.toString()}` : '';

  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentsRef = useRef<UploadedMedia[]>([]);
  const prevOpenRef = useRef(false);

  const incomingSectionsKey = navSections
    .map((s) => `${s.sectionPath}#${s.groups.map((g) => g.items.map((i) => i.path).join(',')).join(';')}`)
    .join('|');

  const ticketSections = useMemo(
    () => enrichTicketNavSections(navSections),
    [incomingSectionsKey],
  );

  const ticketSectionsRef = useRef(ticketSections);
  ticketSectionsRef.current = ticketSections;

  const [activeTab, setActiveTab] = useState<TicketTab>('raise');
  const [sectionPath, setSectionPath] = useState('');
  const [subPagePath, setSubPagePath] = useState('');
  const [issueReason, setIssueReason] = useState('');
  const [description, setDescription] = useState('');
  const [urgency, setUrgency] = useState<Urgency>('non-urgent');
  const [issueType, setIssueType] = useState<IssueType>('Minor');
  const [attachments, setAttachments] = useState<UploadedMedia[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [raiseSuccessId, setRaiseSuccessId] = useState<string | null>(null);

  const [trackInput, setTrackInput] = useState('');
  const [trackedTicket, setTrackedTicket] = useState<SupportTicketDetail | null>(null);
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [myTickets, setMyTickets] = useState<SupportTicketSummary[]>([]);
  const [myTicketsLoading, setMyTicketsLoading] = useState(false);

  const [closeInput, setCloseInput] = useState('');
  const [closeComment, setCloseComment] = useState('');
  const [closeLoading, setCloseLoading] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  const [adminContacts, setAdminContacts] = useState<SupportTicketAdminContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [contactTicketRef, setContactTicketRef] = useState('');

  const {
    errors: raiseErrors,
    clearField: clearRaiseField,
    clearAll: clearRaiseErrors,
    applyAndFocus: applyRaiseErrors,
  } = useFieldErrors<RaiseField>(RAISE_FIELD_ORDER);
  const {
    errors: trackErrors,
    clearField: clearTrackField,
    clearAll: clearTrackErrors,
    applyAndFocus: applyTrackErrors,
  } = useFieldErrors<TrackField>(TRACK_FIELD_ORDER);
  const {
    errors: closeErrors,
    clearField: clearCloseField,
    clearAll: clearCloseErrors,
    applyAndFocus: applyCloseErrors,
  } = useFieldErrors<CloseField>(CLOSE_FIELD_ORDER);
  const ticketSectionsKey = ticketSections
    .map((s) => `${s.sectionPath}#${s.groups.map((g) => g.items.map((i) => i.path).join(',')).join(';')}`)
    .join('|');

  const locationKey = `${pathname}${locationSearch}` || (currentPath ?? '');

  const activeSection = useMemo(() => {
    const sections = ticketSectionsRef.current;
    return sections.find((s) => s.sectionPath === sectionPath) ?? sections[0] ?? null;
  }, [ticketSectionsKey, sectionPath]);

  const sectionOptions = useMemo(
    () => buildSectionDropdownOptions(ticketSectionsRef.current),
    [ticketSectionsKey],
  );

  const subPageOptions = useMemo(
    () => buildSubPageDropdownOptions(activeSection),
    [ticketSectionsKey, sectionPath, activeSection?.sectionPath],
  );

  const subPagesKey = useMemo(() => subPageOptions.map((o) => o.value).join(','), [subPageOptions]);

  const subPageValue =
    subPageOptions.some((o) => o.value === subPagePath) ? subPagePath : subPageOptions[0]?.value ?? '';

  const openInitEffectKey = open ? `1|${ticketSectionsKey}|${locationKey}` : '0';

  useEffect(() => {
    const sections = ticketSectionsRef.current;
    if (!open) {
      prevOpenRef.current = false;
      return;
    }
    if (prevOpenRef.current) return;
    prevOpenRef.current = true;

    if (sections.length === 0) return;

    const resolved = resolveTicketLocation(sections, pathname, locationSearch);
    if (resolved) {
      setSectionPath(resolved.sectionPath);
      setSubPagePath(resolved.subPagePath);
      return;
    }

    const first = sections[0];
    setSectionPath(first.sectionPath);
    setSubPagePath(first.groups[0]?.items[0]?.path ?? first.sectionPath);
  }, [openInitEffectKey]);

  useEffect(() => {
    const sections = ticketSectionsRef.current;
    const section = sections.find((s) => s.sectionPath === sectionPath);
    if (!section) return;
    const paths = ticketSectionPaths(section);
    setSubPagePath((prev) => (paths.includes(prev) ? prev : paths[0] ?? section.sectionPath));
  }, [`${sectionPath}|${subPagesKey}`]);

  const loadMyTickets = useCallback(async () => {
    setMyTicketsLoading(true);
    try {
      const rows = await fetchMySupportTickets();
      setMyTickets(rows.slice(0, 6));
    } catch {
      setMyTickets([]);
    } finally {
      setMyTicketsLoading(false);
    }
  }, []);

  const loadAdminContacts = useCallback(async () => {
    setContactsLoading(true);
    setContactsError(null);
    try {
      const rows = await fetchSupportTicketAdminContacts();
      const selfEmail = getLoggedInUserEmail();
      setAdminContacts(
        selfEmail
          ? rows.filter((c) => c.email.trim().toLowerCase() !== selfEmail)
          : rows,
      );
    } catch (err) {
      setContactsError(getErrorMessage(err, 'Could not load contacts.'));
      setAdminContacts([]);
    } finally {
      setContactsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    if (activeTab === 'track') void loadMyTickets();
    if (activeTab === 'contact') void loadAdminContacts();
  }, [open, activeTab, loadMyTickets, loadAdminContacts]);

  const revokeAttachments = useCallback((items: UploadedMedia[]) => {
    for (const item of items) {
      URL.revokeObjectURL(item.previewUrl);
    }
  }, []);

  const resetForm = useCallback(() => {
    setActiveTab('raise');
    setIssueReason('');
    setDescription('');
    setUrgency('non-urgent');
    setIssueType('Minor');
    setFileError(null);
    setSubmitting(false);
    setSubmitError(null);
    setRaiseSuccessId(null);
    setTrackInput('');
    setTrackedTicket(null);
    setTrackError(null);
    setCloseInput('');
    setCloseComment('');
    setCloseError(null);
    setContactTicketRef('');
    clearRaiseErrors();
    clearTrackErrors();
    clearCloseErrors();
    setAttachments((prev) => {
      revokeAttachments(prev);
      return [];
    });
    const sections = ticketSectionsRef.current;
    if (sections[0]) {
      setSectionPath(sections[0].sectionPath);
      setSubPagePath(sections[0].groups[0]?.items[0]?.path ?? sections[0].sectionPath);
    }
  }, [revokeAttachments, clearRaiseErrors, clearTrackErrors, clearCloseErrors]);

  const handleOpenChange = (next: boolean) => {
    if (!next) resetForm();
    onOpenChange(next);
  };

  const handleSectionChange = (path: string) => {
    setSectionPath(path);
    clearRaiseField('sectionPath');
    const section = ticketSectionsRef.current.find((s) => s.sectionPath === path);
    const options = buildSubPageDropdownOptions(section ?? null);
    setSubPagePath(options[0]?.value ?? path);
    clearRaiseField('subPagePath');
  };

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList?.length) return;
    setFileError(null);
    clearRaiseField('attachments');
    const next: UploadedMedia[] = [];
    const rejectedType: string[] = [];
    const rejectedSize: string[] = [];

    for (const file of Array.from(fileList)) {
      if (!ACCEPTED_MEDIA.has(file.type)) {
        rejectedType.push(file.name);
        continue;
      }
      const sizeErr = fileMaxSize(file, ATTACHMENT_MAX_BYTES, file.name);
      if (sizeErr) {
        rejectedSize.push(file.name);
        continue;
      }
      const kind = file.type.startsWith('video/') ? 'video' : 'image';
      next.push({
        id: `${file.name}-${file.size}-${file.lastModified}`,
        file,
        previewUrl: URL.createObjectURL(file),
        kind,
      });
    }

    const messages: string[] = [];
    if (rejectedType.length > 0) {
      messages.push(`Only images and videos are allowed. Skipped: ${rejectedType.join(', ')}`);
    }
    if (rejectedSize.length > 0) {
      messages.push(`Each file must be 10 MB or smaller. Skipped: ${rejectedSize.join(', ')}`);
    }
    if (attachments.length + next.length > ATTACHMENT_MAX_COUNT) {
      messages.push(`Maximum ${ATTACHMENT_MAX_COUNT} attachments.`);
    }
    if (messages.length > 0) {
      setFileError(messages.join(' '));
    }
    if (next.length > 0) {
      setAttachments((prev) => {
        const merged = [...prev, ...next];
        if (merged.length <= ATTACHMENT_MAX_COUNT) return merged;
        const keep = merged.slice(0, ATTACHMENT_MAX_COUNT);
        for (const item of merged.slice(ATTACHMENT_MAX_COUNT)) {
          URL.revokeObjectURL(item.previewUrl);
        }
        return keep;
      });
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  };

  attachmentsRef.current = attachments;

  useEffect(
    () => () => {
      revokeAttachments(attachmentsRef.current);
    },
    [revokeAttachments],
  );

  const readFileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        const comma = result.indexOf(',');
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
      reader.readAsDataURL(file);
    });

  const validateRaiseForm = (): FieldErrors<RaiseField> => {
    const next: FieldErrors<RaiseField> = {};
    const navErr = selectRequired(sectionPath, 'navigation page');
    if (navErr) next.sectionPath = navErr;
    const subErr = selectRequired(subPageValue, 'sub-page');
    if (subErr) next.subPagePath = subErr;
    const reasonErr = selectRequired(issueReason, 'issue reason');
    if (reasonErr) next.issueReason = reasonErr;
    const descErr = runValidators(
      required(description, 'Description'),
      minLength(description, 10, 'Description'),
      maxLength(description, 2000, 'Description'),
    );
    if (descErr) next.description = descErr;
    const urgencyErr = selectRequired(urgency, 'urgency');
    if (urgencyErr) next.urgency = urgencyErr;
    const typeErr = selectRequired(issueType, 'issue type');
    if (typeErr) next.issueType = typeErr;

    for (const item of attachments) {
      const sizeErr = fileMaxSize(item.file, ATTACHMENT_MAX_BYTES, item.file.name);
      if (sizeErr) {
        next.attachments = sizeErr;
        break;
      }
    }
    if (attachments.length > ATTACHMENT_MAX_COUNT) {
      next.attachments = `Maximum ${ATTACHMENT_MAX_COUNT} attachments.`;
    }
    if (fileError && !next.attachments) {
      next.attachments = fileError;
    }
    return next;
  };

  const runTrack = async (ticketNumber: string) => {
    const id = ticketNumber.trim().toUpperCase();
    if (
      applyTrackErrors(
        id ? {} : { trackTicketId: 'Ticket ID is required.' },
      )
    ) {
      return;
    }
    setTrackLoading(true);
    setTrackError(null);
    clearTrackErrors();
    try {
      const data = await trackSupportTicket(id);
      setTrackedTicket(data);
      setTrackInput(data.ticketNumber);
    } catch (err) {
      setTrackedTicket(null);
      setTrackError(getErrorMessage(err, 'Ticket not found.'));
    } finally {
      setTrackLoading(false);
    }
  };

  const runClose = async () => {
    const id = closeInput.trim().toUpperCase();
    const comment = closeComment.trim();
    const next: FieldErrors<CloseField> = {};
    if (!id) next.closeTicketId = 'Ticket ID is required.';
    if (!comment) next.closeComment = 'Closing comment is required.';
    if (applyCloseErrors(next)) return;

    setCloseLoading(true);
    setCloseError(null);
    clearCloseErrors();
    try {
      const result = await closeSupportTicket(id, { closeComment: comment });
      setTrackedTicket(result.data);
      setTrackInput(result.data.ticketNumber);
      toast.success(result.message);
      void loadMyTickets();
    } catch (err) {
      setCloseError(getErrorMessage(err, 'Could not close ticket.'));
    } finally {
      setCloseLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (applyRaiseErrors(validateRaiseForm())) {
      toast.error('Please fix the highlighted fields.');
      return;
    }

    const navLabel =
      sectionOptions.find((o) => o.value === sectionPath)?.label ?? sectionPath;
    const pageLabel =
      subPageOptions.find((o) => o.value === subPageValue)?.label ?? subPageValue;

    setSubmitting(true);
    setSubmitError(null);
    setRaiseSuccessId(null);
    clearRaiseErrors();

    try {
      const encodedAttachments = await Promise.all(
        attachments.map(async (item) => ({
          fileName: item.file.name,
          mimeType: item.file.type || 'application/octet-stream',
          sizeBytes: item.file.size,
          base64: await readFileAsBase64(item.file),
        })),
      );

      const result = await submitSupportTicket({
        navigationPageLabel: navLabel,
        navigationPagePath: sectionPath,
        subPageLabel: pageLabel,
        subPagePath: subPageValue,
        issueReason,
        description: normalizeText(description),
        urgency,
        issueType,
        attachments: encodedAttachments.length > 0 ? encodedAttachments : undefined,
      });

      const num = result.data?.ticketNumber ?? null;
      setRaiseSuccessId(num);
      if (num) {
        setTrackInput(num);
        setContactTicketRef(num);
      }
      toast.success('Ticket submitted', { description: num ? `Reference ${num}` : undefined });
      void loadMyTickets();
    } catch (err) {
      const message = getErrorMessage(err, 'Could not submit ticket.');
      setSubmitError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const copyTicketId = (id: string) => {
    void navigator.clipboard.writeText(id);
    toast.success('Ticket ID copied');
  };

  const mailtoAdmin = (email: string) => {
    const ref = contactTicketRef.trim() || trackInput.trim();
    const subject = encodeURIComponent(
      ref ? `FRIS support — ticket ${ref}` : 'FRIS support request',
    );
    window.location.href = `mailto:${email}?subject=${subject}`;
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          '!flex !h-[min(90dvh,680px)] !w-[min(calc(100vw-1.5rem),56rem)] !max-w-none !flex-col !gap-0 overflow-hidden !p-0',
          'border-gray-200 bg-white dark:border-[var(--dash-border)] dark:bg-[var(--dash-card)] sm:rounded-xl',
        )}
      >
        <div className="shrink-0 border-b border-gray-100 px-5 py-4 dark:border-[var(--dash-border)]">
          <DialogHeader className="space-y-2 text-left">
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-[var(--dash-text-strong)]">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white">
                <Ticket className="h-4 w-4" aria-hidden />
              </span>
              Raise Ticket
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-600 dark:text-[var(--dash-text-muted)]">
              Submit issues, track your ticket ID, email admins, or close a resolved ticket — all in one place.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={cn(
                  'inline-flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2.5 text-xs font-medium transition-colors sm:text-sm',
                  activeTab === id
                    ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-[var(--dash-border)] dark:bg-[var(--dash-card-elevated)] dark:text-[var(--dash-text)] dark:hover:bg-[var(--dash-hover-surface)]',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-4">
          {ticketSections.length === 0 && activeTab === 'raise' ? (
            <p className="text-center text-sm text-gray-600 dark:text-[var(--dash-text-muted)]">
              No navigation pages are available for your account.
            </p>
          ) : null}

          {activeTab === 'raise' && ticketSections.length > 0 ? (
            <form className="flex min-h-0 flex-1 flex-col gap-3" onSubmit={handleSubmit} noValidate>
              {raiseSuccessId ? (
                <div className="flex shrink-0 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm dark:border-emerald-800/50 dark:bg-emerald-950/30">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
                  <span className="min-w-0 flex-1 text-emerald-900 dark:text-emerald-200">
                    Submitted ·{' '}
                    <span className="font-mono font-semibold">{raiseSuccessId}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => copyTicketId(raiseSuccessId)}
                    className="shrink-0 rounded p-1 hover:bg-emerald-100 dark:hover:bg-emerald-900/50"
                    aria-label="Copy ticket ID"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              ) : null}

              <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4">
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="min-w-0 space-y-1.5">
                      <FieldLabel>Navigation page</FieldLabel>
                      <AdminRadioDropdown
                        id="field-sectionPath"
                        value={sectionPath}
                        onChange={handleSectionChange}
                        options={sectionOptions}
                        placeholder="Select page"
                        className={cn(
                          dropdownTriggerClass,
                          raiseErrors.sectionPath && FRIS_INVALID_CONTROL,
                        )}
                        aria-label="Navigation page"
                        aria-invalid={!!raiseErrors.sectionPath}
                        aria-describedby={
                          raiseErrors.sectionPath ? 'field-sectionPath-error' : undefined
                        }
                      />
                      <FormFieldError
                        id="field-sectionPath-error"
                        message={raiseErrors.sectionPath}
                      />
                    </div>
                    <div className="min-w-0 space-y-1.5">
                      <FieldLabel>{activeSection?.hasNavDropdown ? 'Sub-page' : 'Page'}</FieldLabel>
                      <AdminRadioDropdown
                        id="field-subPagePath"
                        value={subPageValue}
                        onChange={(v) => {
                          setSubPagePath(v);
                          clearRaiseField('subPagePath');
                        }}
                        options={subPageOptions}
                        placeholder="Select sub-page"
                        disabled={subPageOptions.length === 0}
                        className={cn(
                          dropdownTriggerClass,
                          raiseErrors.subPagePath && FRIS_INVALID_CONTROL,
                        )}
                        aria-label="Sub-page"
                        aria-invalid={!!raiseErrors.subPagePath}
                        aria-describedby={
                          raiseErrors.subPagePath ? 'field-subPagePath-error' : undefined
                        }
                      />
                      <FormFieldError
                        id="field-subPagePath-error"
                        message={raiseErrors.subPagePath}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <FieldLabel htmlFor="field-issueReason">Issue reason</FieldLabel>
                    <AdminRadioDropdown
                      id="field-issueReason"
                      value={issueReason}
                      onChange={(v) => {
                        setIssueReason(v);
                        clearRaiseField('issueReason');
                      }}
                      options={ISSUE_REASON_OPTIONS}
                      placeholder="Select issue reason"
                      className={cn(
                        dropdownTriggerClass,
                        raiseErrors.issueReason && FRIS_INVALID_CONTROL,
                      )}
                      aria-label="Issue reason"
                      aria-invalid={!!raiseErrors.issueReason}
                      aria-describedby={
                        raiseErrors.issueReason ? 'field-issueReason-error' : undefined
                      }
                    />
                    <FormFieldError
                      id="field-issueReason-error"
                      message={raiseErrors.issueReason}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <FieldLabel htmlFor="field-description">Description</FieldLabel>
                    <Textarea
                      id="field-description"
                      name="description"
                      value={description}
                      onChange={(e) => {
                        setDescription(e.target.value);
                        clearRaiseField('description');
                      }}
                      placeholder="Steps to reproduce, flight/date, expected vs actual…"
                      rows={3}
                      maxLength={2000}
                      aria-invalid={!!raiseErrors.description}
                      aria-describedby={
                        raiseErrors.description ? 'field-description-error' : undefined
                      }
                      className={cn(
                        'min-h-[4.5rem] w-full resize-none rounded-lg border-gray-200 bg-white text-gray-900',
                        'dark:border-[var(--dash-border)] dark:bg-[var(--dash-card-elevated)] dark:text-[var(--dash-text-strong)]',
                        raiseErrors.description && FRIS_INVALID_CONTROL,
                      )}
                    />
                    <FormFieldError
                      id="field-description-error"
                      message={raiseErrors.description}
                    />
                  </div>
                </div>

                <div className="flex min-w-0 flex-col gap-3">
                  <div className="space-y-2 rounded-xl border border-gray-100 bg-gray-50/80 p-3 dark:border-[var(--dash-border)] dark:bg-[var(--dash-surface)]">
                    <p className="text-sm font-semibold text-gray-900 dark:text-[var(--dash-text-strong)]">
                      Severity
                    </p>
                    <RadioGroup
                      id="field-urgency"
                      value={urgency}
                      onValueChange={(v) => {
                        setUrgency(v as Urgency);
                        clearRaiseField('urgency');
                      }}
                      className="flex flex-wrap gap-3"
                      aria-invalid={!!raiseErrors.urgency}
                      aria-describedby={
                        raiseErrors.urgency ? 'field-urgency-error' : undefined
                      }
                    >
                      {URGENCY_OPTIONS.map((opt) => (
                        <label
                          key={opt}
                          className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-[var(--dash-text)]"
                        >
                          <RadioGroupItem value={opt} />
                          {formatUrgency(opt)}
                        </label>
                      ))}
                    </RadioGroup>
                    <FormFieldError id="field-urgency-error" message={raiseErrors.urgency} />
                    <div className="space-y-1.5">
                      <FieldLabel>Type of issue</FieldLabel>
                      <AdminRadioDropdown
                        id="field-issueType"
                        value={issueType}
                        onChange={(v) => {
                          setIssueType(v as IssueType);
                          clearRaiseField('issueType');
                        }}
                        options={ISSUE_TYPES}
                        placeholder="Select issue type"
                        className={cn(
                          dropdownTriggerClass,
                          raiseErrors.issueType && FRIS_INVALID_CONTROL,
                        )}
                        aria-label="Type of issue"
                        aria-invalid={!!raiseErrors.issueType}
                        aria-describedby={
                          raiseErrors.issueType ? 'field-issueType-error' : undefined
                        }
                      />
                      <FormFieldError
                        id="field-issueType-error"
                        message={raiseErrors.issueType}
                      />
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 space-y-1.5">
                    <FieldLabel>Attachments</FieldLabel>
                    <input
                      ref={fileInputRef}
                      id="field-attachments"
                      type="file"
                      accept="image/*,video/*"
                      multiple
                      className="sr-only"
                      onChange={(e) => {
                        handleFiles(e.target.files);
                        e.target.value = '';
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className={cn(
                        'flex h-14 w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed text-sm',
                        'border-gray-200 text-gray-600 hover:border-emerald-400/60 hover:bg-emerald-50/40',
                        'dark:border-[var(--dash-border)] dark:text-[var(--dash-text-muted)]',
                        (raiseErrors.attachments || fileError) &&
                          'border-red-500 hover:border-red-500',
                      )}
                    >
                      <ImagePlus className="h-5 w-5 text-emerald-600" aria-hidden />
                      Upload images or videos (max {ATTACHMENT_MAX_COUNT}, 10 MB each)
                    </button>
                    <FormFieldError
                      id="field-attachments-error"
                      message={raiseErrors.attachments || fileError}
                    />
                    {attachments.length > 0 ? (
                      <ul className="grid grid-cols-4 gap-1.5">
                        {attachments.map((item) => (
                          <li key={item.id} className="relative overflow-hidden rounded-md border">
                            {item.kind === 'image' ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={item.previewUrl}
                                alt=""
                                className="h-14 w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-14 items-center justify-center bg-gray-50 dark:bg-[var(--dash-surface)]">
                                <Video className="h-5 w-5 text-emerald-600" />
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => removeAttachment(item.id)}
                              className="absolute right-0.5 top-0.5 rounded bg-black/55 p-0.5 text-white"
                              aria-label="Remove"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </div>
              </div>

              {submitError ? (
                <p className="shrink-0 text-sm text-red-600">{submitError}</p>
              ) : null}

              <div className="flex shrink-0 justify-end gap-2 border-t border-gray-100 pt-3 dark:border-[var(--dash-border)]">
                <button
                  type="button"
                  onClick={() => handleOpenChange(false)}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-[var(--dash-border)] dark:text-[var(--dash-text)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || ticketSections.length === 0}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
                >
                  {submitting ? 'Submitting…' : 'Submit ticket'}
                </button>
              </div>
            </form>
          ) : null}

          {activeTab === 'track' ? (
            <div className="flex min-h-0 w-full flex-1 flex-col">
              <div className="shrink-0 space-y-3 pb-3">
                <div className="flex w-full gap-2">
                  <div className="min-w-0 flex-1">
                    <input
                      id="field-trackTicketId"
                      name="trackTicketId"
                      type="text"
                      value={trackInput}
                      onChange={(e) => {
                        setTrackInput(e.target.value.toUpperCase());
                        clearTrackField('trackTicketId');
                      }}
                      placeholder="TKT-YYYYMMDD-XXXXXX"
                      aria-invalid={!!trackErrors.trackTicketId}
                      aria-describedby={
                        trackErrors.trackTicketId ? 'field-trackTicketId-error' : undefined
                      }
                      className={cn(
                        'w-full rounded-lg border border-gray-200 px-3 py-2.5 font-mono text-sm',
                        'dark:border-[var(--dash-border)] dark:bg-[var(--dash-card-elevated)] dark:text-[var(--dash-text-strong)]',
                        trackErrors.trackTicketId && FRIS_INVALID_CONTROL,
                      )}
                    />
                    <FormFieldError
                      id="field-trackTicketId-error"
                      message={trackErrors.trackTicketId}
                    />
                  </div>
                  <button
                    type="button"
                    disabled={trackLoading}
                    onClick={() => void runTrack(trackInput)}
                    className="h-[2.625rem] shrink-0 rounded-lg bg-emerald-600 px-5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
                  >
                    {trackLoading ? '…' : 'Track'}
                  </button>
                </div>
                {trackError ? (
                  <p className="text-sm text-red-600 dark:text-red-400">{trackError}</p>
                ) : null}
                {!trackedTicket && !trackError && !trackErrors.trackTicketId ? (
                  <p className="text-sm text-gray-500 dark:text-[var(--dash-text-muted)]">
                    Enter the ticket ID from your submission confirmation.
                  </p>
                ) : null}
              </div>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-y-contain pr-0.5">
                {trackedTicket ? <TicketDetailCard ticket={trackedTicket} /> : null}

                <section className="w-full border-t border-gray-100 pt-4 dark:border-[var(--dash-border)]">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-[var(--dash-text-muted)]">
                    Your recent tickets
                  </p>
                  {myTicketsLoading ? (
                    <p className="text-sm text-gray-500">Loading…</p>
                  ) : myTickets.length === 0 ? (
                    <p className="text-sm text-gray-500">No tickets yet.</p>
                  ) : (
                    <ul className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                      {myTickets.map((t) => (
                        <li key={t.ticketNumber} className="min-w-0">
                          <button
                            type="button"
                            onClick={() => void runTrack(t.ticketNumber)}
                            className={cn(
                              'flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
                              recentTicketButtonClass(
                                t.status,
                                trackedTicket?.ticketNumber === t.ticketNumber,
                              ),
                            )}
                          >
                            <span className="truncate font-mono font-medium">{t.ticketNumber}</span>
                            <StatusBadge status={t.status} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </div>
          ) : null}

          {activeTab === 'contact' ? (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <div className="space-y-1.5">
                <FieldLabel htmlFor="contact-ticket-ref">Ticket ID (optional)</FieldLabel>
                <input
                  id="contact-ticket-ref"
                  type="text"
                  value={contactTicketRef}
                  onChange={(e) => setContactTicketRef(e.target.value.toUpperCase())}
                  placeholder="Include in email subject"
                  className={cn(
                    'w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm',
                    'dark:border-[var(--dash-border)] dark:bg-[var(--dash-card-elevated)]',
                  )}
                />
              </div>
              {contactsError ? (
                <p className="text-sm text-red-600">{contactsError}</p>
              ) : null}
              {contactsLoading ? (
                <p className="text-sm text-gray-500">Loading admin contacts…</p>
              ) : adminContacts.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No admin contacts configured. Set SUPERADMIN_EMAIL or SUPPORT_TICKET_EMAIL on the server.
                </p>
              ) : (
                <ul className="grid min-h-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                  {adminContacts.map((c) => (
                    <li
                      key={c.email}
                      className="flex items-center justify-between gap-2 rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-3 dark:border-[var(--dash-border)] dark:bg-[var(--dash-surface)]"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-gray-900 dark:text-[var(--dash-text-strong)]">
                          {c.name}
                        </p>
                        <p className="truncate text-xs text-gray-500">{c.email}</p>
                        <p className="text-[10px] uppercase tracking-wide text-gray-400">{c.role}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => mailtoAdmin(c.email)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
                      >
                        <Mail className="h-3.5 w-3.5" aria-hidden />
                        Email
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {activeTab === 'close' ? (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <p className="shrink-0 text-sm text-gray-600 dark:text-[var(--dash-text-muted)]">
                Close a ticket when the issue is resolved. A closing comment is required. You can only
                close tickets you raised.
              </p>
              <div className="shrink-0 space-y-1.5">
                <FieldLabel htmlFor="field-closeTicketId">Ticket ID</FieldLabel>
                <input
                  id="field-closeTicketId"
                  name="closeTicketId"
                  type="text"
                  value={closeInput}
                  onChange={(e) => {
                    setCloseInput(e.target.value.toUpperCase());
                    clearCloseField('closeTicketId');
                  }}
                  placeholder="TKT-YYYYMMDD-XXXXXX"
                  aria-invalid={!!closeErrors.closeTicketId}
                  aria-describedby={
                    closeErrors.closeTicketId ? 'field-closeTicketId-error' : undefined
                  }
                  className={cn(
                    'w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm',
                    'dark:border-[var(--dash-border)] dark:bg-[var(--dash-card-elevated)]',
                    closeErrors.closeTicketId && FRIS_INVALID_CONTROL,
                  )}
                />
                <FormFieldError
                  id="field-closeTicketId-error"
                  message={closeErrors.closeTicketId}
                />
              </div>
              <div className="shrink-0 space-y-1.5">
                <FieldLabel htmlFor="field-closeComment">Closing comment</FieldLabel>
                <Textarea
                  id="field-closeComment"
                  name="closeComment"
                  value={closeComment}
                  onChange={(e) => {
                    setCloseComment(e.target.value);
                    clearCloseField('closeComment');
                  }}
                  placeholder="Describe how the issue was resolved or why you are closing this ticket…"
                  rows={3}
                  aria-invalid={!!closeErrors.closeComment}
                  aria-describedby={
                    closeErrors.closeComment ? 'field-closeComment-error' : undefined
                  }
                  className={cn(
                    'min-h-[4.5rem] w-full resize-none rounded-lg border-gray-200 bg-white text-gray-900',
                    'dark:border-[var(--dash-border)] dark:bg-[var(--dash-card-elevated)] dark:text-[var(--dash-text-strong)]',
                    closeErrors.closeComment && FRIS_INVALID_CONTROL,
                  )}
                />
                <FormFieldError
                  id="field-closeComment-error"
                  message={closeErrors.closeComment}
                />
              </div>
              <div className="flex shrink-0 justify-end">
                <button
                  type="button"
                  disabled={closeLoading}
                  onClick={() => void runClose()}
                  className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
                >
                  {closeLoading ? 'Closing…' : 'Close ticket'}
                </button>
              </div>
              {closeError ? <p className="shrink-0 text-sm text-red-600">{closeError}</p> : null}
              {trackedTicket && closeInput === trackedTicket.ticketNumber ? (
                <TicketDetailCard ticket={trackedTicket} />
              ) : null}
              <div className="shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('track');
                    void runTrack(closeInput || trackInput);
                  }}
                  className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                >
                  View ticket status first →
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function RaiseTicketDialog(props: RaiseTicketDialogProps) {
  return (
    <Suspense fallback={null}>
      <RaiseTicketDialogInner {...props} />
    </Suspense>
  );
}
