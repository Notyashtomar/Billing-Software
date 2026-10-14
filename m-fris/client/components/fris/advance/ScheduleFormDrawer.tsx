'use client';

import { useMemo, type Dispatch, type SetStateAction } from 'react';
import { Loader2, Save, X } from 'lucide-react';
import {
  DAYS,
  HANDLING_OPTIONS,
  SCHEDULE_LABEL,
  DATE_PICKER_INVALID_CLASS,
  SCHEDULE_SECONDARY_BTN,
  SCHEDULE_AMBER_BTN,
  SCHEDULE_BTN_TRANSITION,
  scheduleControlClass,
  applyDayPreset,
  ddMmYyyyToLocalDate,
  normalizeScheduleDays,
  validityOrderError,
  type ScheduleFormValues,
  type AdvanceAirlineOption,
  type AdvanceAircraftMasterOption,
  type ScheduleField,
} from '@/components/fris/advance/scheduleSetupShared';
import { Switch } from '@/components/ui/switch';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { DatePicker } from '@/components/ui/DatePicker';
import { TimeSelect24 } from '@/components/ui/TimeSelect24';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import { FormFieldError } from '@/components/ui/FormFieldError';
import {
  detectScheduleSeasonFromValidFrom,
  SCHEDULE_SEASON,
} from '@/lib/schedule-season';
import {
  sanitizeScheduleFlightNoInput,
  sanitizeScheduleRoutingInput,
  scheduleFlightNumber,
  scheduleRouting,
  required,
  trimValue,
  runValidators,
  type FieldErrors,
} from '@/lib/form-validation';
import { cn } from '@/lib/utils';

const FORM_GRID_CLASS = 'grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
const SWITCH_CLASS = 'data-[state=checked]:bg-emerald-500';

const DAY_PRESETS = [
  { key: 'daily' as const, label: 'Daily (Mon-Sun)' },
  { key: 'weekdays' as const, label: 'Weekdays (Mon-Fri)' },
  { key: 'weekends' as const, label: 'Weekends (Sat-Sun)' },
  { key: 'clear' as const, label: 'Clear' },
];

type Props = {
  open: boolean;
  form: ScheduleFormValues;
  setForm: Dispatch<SetStateAction<ScheduleFormValues>>;
  selectedAirlineId: string;
  setSelectedAirlineId: (id: string) => void;
  airlines: AdvanceAirlineOption[];
  airlinesLoading: boolean;
  aircraftMaster: AdvanceAircraftMasterOption[];
  aircraftMasterLoading: boolean;
  editingSerialNo: string;
  saving: boolean;
  onSave: () => void | Promise<void>;
  onCancel: () => void;
  errors: FieldErrors<ScheduleField>;
  clearField: (field: ScheduleField) => void;
  setFieldError: (field: ScheduleField, message: string | null) => void;
};

export function ScheduleFormDrawer({
  open,
  form,
  setForm,
  selectedAirlineId,
  setSelectedAirlineId,
  airlines,
  airlinesLoading,
  aircraftMaster,
  aircraftMasterLoading,
  editingSerialNo,
  saving,
  onSave,
  onCancel,
  errors,
  clearField,
  setFieldError,
}: Props) {
  const selectedAirline = useMemo(
    () => airlines.find((a) => a.id === selectedAirlineId),
    [airlines, selectedAirlineId],
  );

  const detectedSeason = useMemo(
    () => detectScheduleSeasonFromValidFrom(form.validFrom),
    [form.validFrom],
  );

  const airlineName =
    selectedAirline?.name.trim() || selectedAirline?.code || 'Airline';
  const flightNo = form.flightNo.trim() || '—';

  const title = editingSerialNo
    ? `Edit Schedule — ${airlineName} ${flightNo}`
    : 'Create Master Schedule';

  const toggleDay = (day: (typeof DAYS)[number]) => {
    setForm((f) => ({
      ...f,
      days: (() => {
        const days = normalizeScheduleDays(f.days);
        days[day] = !days[day];
        return days;
      })(),
    }));
    clearField('days');
  };

  const applyPreset = (preset: (typeof DAY_PRESETS)[number]['key']) => {
    setForm((f) => ({
      ...f,
      days: normalizeScheduleDays(applyDayPreset(preset)),
    }));
    clearField('days');
  };

  if (!open) return null;

  return (
    <section
      id="schedule-form-panel"
      aria-labelledby="schedule-form-title"
      className="origin-top animate-in fade-in-0 slide-in-from-top-2 rounded-xl border border-emerald-300 bg-white shadow-sm duration-200"
    >
      <header className="flex flex-col gap-3 border-b border-gray-100 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:px-5 sm:py-4">
        <div className="min-w-0">
          <h3 id="schedule-form-title" className="text-lg font-semibold text-gray-900">
            {title}
          </h3>
          <p className="mt-0.5 text-sm text-gray-500">
            {editingSerialNo
              ? 'Update schedule fields and operating days, then save.'
              : 'Configure flight schedule, validity, and operating days.'}
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className={cn(
            'inline-flex h-9 w-9 shrink-0 items-center justify-center self-end rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 sm:self-start',
            SCHEDULE_BTN_TRANSITION,
          )}
          aria-label="Close schedule form"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </header>

      <div className="px-4 py-4 sm:px-5">
          <section className="space-y-4">
            <div className={FORM_GRID_CLASS}>
              <div>
                <label className={SCHEDULE_LABEL} htmlFor="drawer-airline">
                  Airline
                </label>
                <AdminRadioDropdown
                  id="drawer-airline"
                  value={selectedAirlineId}
                  onChange={(v) => {
                    setSelectedAirlineId(v);
                    clearField('airline');
                  }}
                  onBlur={() => {
                    if (!trimValue(selectedAirlineId)) {
                      setFieldError('airline', 'Select an airline.');
                    }
                  }}
                  disabled={airlinesLoading || saving}
                  options={[
                    {
                      value: '',
                      label: airlinesLoading ? 'Loading airlines…' : 'Select airline',
                    },
                    ...airlines.map((a) => ({
                      value: a.id,
                      label: a.name.trim() || a.code || 'Unnamed airline',
                    })),
                  ]}
                  aria-invalid={!!errors.airline}
                  aria-describedby={errors.airline ? 'drawer-airline-error' : undefined}
                  className={cn(
                    scheduleControlClass(!!errors.airline),
                    'disabled:cursor-not-allowed disabled:bg-gray-50',
                  )}
                  searchPlaceholder="Search airline…"
                />
                <FormFieldError id="drawer-airline-error" message={errors.airline} />
              </div>

              <div>
                <label className={SCHEDULE_LABEL}>Airline Code</label>
                <input
                  type="text"
                  readOnly
                  value={selectedAirline?.code ?? ''}
                  className={cn(scheduleControlClass(), 'cursor-default bg-gray-50')}
                  placeholder={selectedAirlineId ? '' : 'Select an airline'}
                />
                <FormFieldError />
              </div>
            </div>
          </section>

          <section className="mt-5 space-y-4 border-t border-gray-100 pt-5">
            <div className={FORM_GRID_CLASS}>
              <div>
                <label className={SCHEDULE_LABEL}>Flight Type</label>
                <AdminRadioDropdown
                  value={form.flightType}
                  onChange={(v) => setForm((f) => ({ ...f, flightType: v }))}
                  options={[
                    { value: '', label: 'Select' },
                    { value: 'Domestic', label: 'Domestic' },
                    { value: 'International', label: 'International' },
                  ]}
                  className={scheduleControlClass()}
                  disabled={saving}
                />
                <FormFieldError />
              </div>

              <div className="min-w-0">
                <label className={SCHEDULE_LABEL} htmlFor="drawer-flightNo">
                  Flight No.
                </label>
                <input
                  id="drawer-flightNo"
                  name="flightNo"
                  type="text"
                  value={form.flightNo}
                  aria-invalid={!!errors.flightNo}
                  aria-describedby={errors.flightNo ? 'drawer-flightNo-error' : undefined}
                  onChange={(e) => {
                    const flightNoValue = sanitizeScheduleFlightNoInput(e.target.value);
                    setForm((f) => ({ ...f, flightNo: flightNoValue }));
                    clearField('flightNo');
                  }}
                  onBlur={() => {
                    const flightNoValue = sanitizeScheduleFlightNoInput(form.flightNo);
                    setForm((f) => ({ ...f, flightNo: flightNoValue }));
                    setFieldError(
                      'flightNo',
                      runValidators(
                        required(flightNoValue, 'Flight number'),
                        scheduleFlightNumber(flightNoValue),
                      ),
                    );
                  }}
                  className={cn(
                    scheduleControlClass(!!errors.flightNo),
                    'font-medium tabular-nums tracking-wide',
                  )}
                  placeholder="e.g. 6E205 or AI101/AI102"
                  maxLength={15}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={saving}
                />
                <FormFieldError id="drawer-flightNo-error" message={errors.flightNo} />
              </div>

              <div>
                <label className={SCHEDULE_LABEL} htmlFor="drawer-sta">
                  STA Time (24h)
                </label>
                <TimeSelect24
                  hourSelectId="drawer-sta"
                  value={form.sta || '00:00'}
                  onChange={(v) => {
                    setForm((f) => ({ ...f, sta: v }));
                    clearField('sta');
                    clearField('std');
                  }}
                  className={cn('w-full', errors.sta && 'border-red-500 ring-2 ring-red-200')}
                  disabled={saving}
                />
                <FormFieldError id="drawer-sta-error" message={errors.sta} />
              </div>

              <div>
                <label className={SCHEDULE_LABEL} htmlFor="drawer-std">
                  STD Time (24h)
                </label>
                <TimeSelect24
                  hourSelectId="drawer-std"
                  value={form.std || '00:00'}
                  onChange={(v) => {
                    setForm((f) => ({ ...f, std: v }));
                    clearField('std');
                  }}
                  className={cn('w-full', errors.std && 'border-red-500 ring-2 ring-red-200')}
                  disabled={saving}
                />
                <FormFieldError id="drawer-std-error" message={errors.std} />
              </div>

              <div className="flex flex-wrap items-center gap-x-8 gap-y-3 sm:col-span-2 lg:col-span-2 xl:col-span-2">
                <div className="flex min-h-10 items-center gap-2.5">
                  <label htmlFor="drawer-nextDay" className="text-sm font-medium text-gray-700">
                    Next Day
                  </label>
                  <Switch
                    id="drawer-nextDay"
                    checked={form.nextDay === 'true'}
                    onCheckedChange={(checked) => {
                      setForm((f) => ({ ...f, nextDay: checked ? 'true' : 'false' }));
                      clearField('std');
                    }}
                    className={SWITCH_CLASS}
                    disabled={saving}
                  />
                </div>
                <div className="flex min-h-10 items-center gap-2.5">
                  <label htmlFor="drawer-freighter" className="text-sm font-medium text-gray-700">
                    Freighter
                  </label>
                  <Switch
                    id="drawer-freighter"
                    checked={form.freighter === 'Yes'}
                    onCheckedChange={(checked) =>
                      setForm((f) => ({ ...f, freighter: checked ? 'Yes' : 'No' }))
                    }
                    className={SWITCH_CLASS}
                    disabled={saving}
                  />
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className={SCHEDULE_LABEL} htmlFor="drawer-routing">
                  Routing
                </label>
                <input
                  id="drawer-routing"
                  name="routing"
                  type="text"
                  value={form.routing}
                  aria-invalid={!!errors.routing}
                  aria-describedby={errors.routing ? 'drawer-routing-error' : undefined}
                  onChange={(e) => {
                    const routing = sanitizeScheduleRoutingInput(e.target.value);
                    setForm((f) => ({ ...f, routing }));
                    clearField('routing');
                  }}
                  onBlur={() => {
                    const routing = sanitizeScheduleRoutingInput(form.routing);
                    setForm((f) => ({ ...f, routing }));
                    setFieldError('routing', scheduleRouting(routing));
                  }}
                  className={scheduleControlClass(!!errors.routing)}
                  placeholder="e.g. DEL-IXC or DEL-IXC-DEL"
                  maxLength={11}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={saving}
                />
                <FormFieldError id="drawer-routing-error" message={errors.routing} />
              </div>

              <div>
                <label className={SCHEDULE_LABEL} htmlFor="drawer-aircraft">
                  Aircraft
                </label>
                <AdminRadioDropdown
                  id="drawer-aircraft"
                  value={form.aircraft}
                  onChange={(v) => {
                    const row = aircraftMaster.find((x) => x.type === v);
                    setForm((f) => ({
                      ...f,
                      aircraft: v,
                      aircraftBody: row ? row.body : f.aircraftBody,
                    }));
                    clearField('aircraft');
                  }}
                  onBlur={() => {
                    if (!trimValue(form.aircraft)) {
                      setFieldError('aircraft', 'Select an aircraft type.');
                    }
                  }}
                  disabled={aircraftMasterLoading || saving}
                  options={[
                    {
                      value: '',
                      label: aircraftMasterLoading
                        ? 'Loading aircraft types…'
                        : 'Select aircraft',
                    },
                    ...aircraftMaster.map((a) => ({ value: a.type, label: a.type })),
                  ]}
                  searchable
                  searchPlaceholder="Search aircraft…"
                  aria-invalid={!!errors.aircraft}
                  aria-describedby={errors.aircraft ? 'drawer-aircraft-error' : undefined}
                  className={cn(
                    scheduleControlClass(!!errors.aircraft),
                    'disabled:cursor-not-allowed disabled:bg-gray-50 disabled:opacity-70',
                  )}
                />
                <FormFieldError id="drawer-aircraft-error" message={errors.aircraft} />
              </div>

              <div>
                <label className={SCHEDULE_LABEL}>Aircraft Body</label>
                <input
                  type="text"
                  readOnly
                  value={form.aircraftBody === 'WB' ? 'WB — Wide body' : 'NB — Narrow body'}
                  className={cn(scheduleControlClass(), 'cursor-default bg-gray-50')}
                  title="Set automatically from the selected aircraft"
                />
                <FormFieldError />
              </div>

              <div className="sm:col-span-2">
                <label className={SCHEDULE_LABEL}>Type of Handling</label>
                <AdminRadioDropdown
                  value={form.typeOfHandling}
                  onChange={(v) => setForm((f) => ({ ...f, typeOfHandling: v }))}
                  options={HANDLING_OPTIONS.map((option) => ({ value: option, label: option }))}
                  className={scheduleControlClass()}
                  disabled={saving}
                />
                <FormFieldError />
              </div>

              <div>
                <label className={SCHEDULE_LABEL} htmlFor="drawer-validFrom">
                  Valid From
                </label>
                <div className={cn(errors.validFrom && DATE_PICKER_INVALID_CLASS)}>
                  <DatePicker
                    id="drawer-validFrom"
                    value={form.validFrom}
                    maxDate={ddMmYyyyToLocalDate(form.validTo)}
                    onChange={(v) => {
                      setForm((f) => ({ ...f, validFrom: v }));
                      clearField('validFrom');
                      setFieldError('validTo', validityOrderError(v, form.validTo));
                    }}
                    ariaLabel="Valid From"
                    disabled={saving}
                  />
                </div>
                <FormFieldError id="drawer-validFrom-error" message={errors.validFrom} />
                <div className="mt-1.5">
                  {detectedSeason?.season === SCHEDULE_SEASON.SUMMER ? (
                    <span
                      className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700"
                      role="status"
                    >
                      ☀️ Summer
                    </span>
                  ) : detectedSeason?.season === SCHEDULE_SEASON.WINTER ? (
                    <span
                      className="inline-flex items-center rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700"
                      role="status"
                    >
                      ❄️ Winter
                    </span>
                  ) : form.validFrom.trim() ? (
                    <p className="text-xs text-gray-500" role="status">
                      Enter a valid date to detect Summer or Winter season.
                    </p>
                  ) : null}
                </div>
              </div>

              <div>
                <label className={SCHEDULE_LABEL} htmlFor="drawer-validTo">
                  Valid To
                </label>
                <div className={cn(errors.validTo && DATE_PICKER_INVALID_CLASS)}>
                  <DatePicker
                    id="drawer-validTo"
                    value={form.validTo}
                    minDate={ddMmYyyyToLocalDate(form.validFrom)}
                    onChange={(v) => {
                      setForm((f) => ({ ...f, validTo: v }));
                      setFieldError('validTo', validityOrderError(form.validFrom, v));
                    }}
                    ariaLabel="Valid To"
                    disabled={saving}
                  />
                </div>
                <FormFieldError id="drawer-validTo-error" message={errors.validTo} />
              </div>
            </div>
          </section>

          <section className="mt-5 space-y-3 border-t border-gray-100 pt-5">
            <div className="flex items-center justify-between">
              <label htmlFor="drawer-operationSplit" className="text-sm font-medium text-gray-700">
                Operation Split
              </label>
              <Switch
                id="drawer-operationSplit"
                checked={form.operationSplit}
                onCheckedChange={(checked) => {
                  setForm((f) => ({ ...f, operationSplit: checked }));
                  if (!checked) {
                    clearField('arrivalFlightNo');
                    clearField('departureFlightNo');
                  }
                }}
                className={SWITCH_CLASS}
                disabled={saving}
              />
            </div>

            {form.operationSplit && (
              <Accordion type="single" defaultValue="split" collapsible className="rounded-lg border border-gray-200">
                <AccordionItem value="split" className="border-0">
                  <AccordionTrigger className="px-4 py-3 text-sm hover:no-underline">
                    Split flight numbers
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label
                          className="mb-1.5 block text-sm font-medium leading-snug text-gray-600"
                          htmlFor="drawer-arrivalFlightNo"
                        >
                          Arrival Flight No
                        </label>
                        <input
                          id="drawer-arrivalFlightNo"
                          name="arrivalFlightNo"
                          type="text"
                          value={form.arrivalFlightNo}
                          aria-invalid={!!errors.arrivalFlightNo}
                          aria-describedby={
                            errors.arrivalFlightNo ? 'drawer-arrivalFlightNo-error' : undefined
                          }
                          onChange={(e) => {
                            const arrivalFlightNo = sanitizeScheduleFlightNoInput(e.target.value);
                            setForm((f) => ({ ...f, arrivalFlightNo }));
                            clearField('arrivalFlightNo');
                          }}
                          onBlur={() => {
                            const arrivalFlightNo = sanitizeScheduleFlightNoInput(
                              form.arrivalFlightNo,
                            );
                            setForm((f) => ({ ...f, arrivalFlightNo }));
                            setFieldError(
                              'arrivalFlightNo',
                              runValidators(
                                required(arrivalFlightNo, 'Arrival flight number'),
                                scheduleFlightNumber(arrivalFlightNo, 'Arrival flight number'),
                              ),
                            );
                          }}
                          className={scheduleControlClass(!!errors.arrivalFlightNo)}
                          placeholder="e.g. AI101"
                          maxLength={15}
                          disabled={saving}
                        />
                        <FormFieldError
                          id="drawer-arrivalFlightNo-error"
                          message={errors.arrivalFlightNo}
                        />
                      </div>
                      <div>
                        <label
                          className="mb-1.5 block text-sm font-medium leading-snug text-gray-600"
                          htmlFor="drawer-departureFlightNo"
                        >
                          Departure Flight No
                        </label>
                        <input
                          id="drawer-departureFlightNo"
                          name="departureFlightNo"
                          type="text"
                          value={form.departureFlightNo}
                          aria-invalid={!!errors.departureFlightNo}
                          aria-describedby={
                            errors.departureFlightNo ? 'drawer-departureFlightNo-error' : undefined
                          }
                          onChange={(e) => {
                            const departureFlightNo = sanitizeScheduleFlightNoInput(e.target.value);
                            setForm((f) => ({ ...f, departureFlightNo }));
                            clearField('departureFlightNo');
                          }}
                          onBlur={() => {
                            const departureFlightNo = sanitizeScheduleFlightNoInput(
                              form.departureFlightNo,
                            );
                            setForm((f) => ({ ...f, departureFlightNo }));
                            setFieldError(
                              'departureFlightNo',
                              runValidators(
                                required(departureFlightNo, 'Departure flight number'),
                                scheduleFlightNumber(departureFlightNo, 'Departure flight number'),
                              ),
                            );
                          }}
                          className={scheduleControlClass(!!errors.departureFlightNo)}
                          placeholder="e.g. AI102"
                          maxLength={15}
                          disabled={saving}
                        />
                        <FormFieldError
                          id="drawer-departureFlightNo-error"
                          message={errors.departureFlightNo}
                        />
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}
          </section>

          <section className="mt-5 space-y-3 border-t border-gray-100 pt-5">
            <p className="text-sm font-medium text-gray-700" id="drawer-days-label">
              Day Selection
            </p>
            <div className="flex flex-wrap gap-2">
              {DAY_PRESETS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => applyPreset(key)}
                  disabled={saving}
                  aria-label={`Select ${label}`}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60"
                >
                  {label}
                </button>
              ))}
            </div>
            <div
              id="drawer-days"
              role="group"
              aria-labelledby="drawer-days-label"
              aria-invalid={!!errors.days}
              aria-describedby={errors.days ? 'drawer-days-error' : undefined}
              className={cn(
                'flex flex-wrap gap-2 rounded-lg p-0.5',
                errors.days && 'ring-2 ring-red-200',
              )}
            >
              {DAYS.map((day) => {
                const selected = normalizeScheduleDays(form.days)[day];
                return (
                  <button
                    type="button"
                    key={day}
                    onClick={() => toggleDay(day)}
                    disabled={saving}
                    aria-pressed={selected}
                    aria-label={`${selected ? 'Remove' : 'Select'} ${day}`}
                    className={cn(
                      'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 disabled:cursor-not-allowed disabled:opacity-60',
                      selected
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                        : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
                    )}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
            <FormFieldError id="drawer-days-error" message={errors.days} />
          </section>

          <section className="mt-5 border-t border-gray-100 pt-5">
            <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50/60 px-3 py-2.5">
              <label htmlFor="drawer-active" className="text-sm font-medium text-gray-700">
                Active
              </label>
              <Switch
                id="drawer-active"
                checked={form.active}
                onCheckedChange={(checked) => setForm((f) => ({ ...f, active: checked }))}
                className={SWITCH_CLASS}
                disabled={saving}
              />
            </div>
          </section>
        </div>

      <footer className="border-t border-gray-100 bg-gray-50/50 px-4 py-3 sm:px-5 sm:py-4">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className={SCHEDULE_SECONDARY_BTN}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={saving || airlinesLoading}
            aria-busy={saving}
            className={SCHEDULE_AMBER_BTN}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Save className="h-4 w-4" aria-hidden />
            )}
            {saving ? 'Saving…' : editingSerialNo ? 'Update schedule' : 'Save Schedule'}
          </button>
        </div>
      </footer>
    </section>
  );
}
