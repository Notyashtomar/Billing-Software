import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomUUID } from 'crypto';
import {
  PAX_SHIFT_REPORT_KIND,
  DUTY_ALLOCATION_SINGLETON_SERIAL,
  SHORT_SHIPPED_BAGS_SINGLETON_SERIAL,
  isPaxShiftEmployeeSectionKey,
} from '../constants/reports-pax-shift-report.constants';
import {
  ReportsPaxShiftReport,
  ReportsPaxShiftReportDocument,
  type PaxShiftDutyAllocationEntry,
  type PaxShiftShortShippedBagFlightEntry,
} from '../schema/reports-pax-shift-report.schema';
import { UpsertFlightReportSectionDto } from '../dto/upsert-flight-report-section.dto';
import { UpsertFlightDetailsDto } from '../dto/upsert-flight-details.dto';
import { UpsertShortShippedBagsDto } from '../dto/upsert-short-shipped-bags.dto';
import { CreateDutyAllocationDto } from '../dto/create-duty-allocation.dto';
import {
  flightReportHasOpenFormData,
  normalizeEmployeeRows,
  sectionsMapToObject,
} from '../utils/flight-report-data.util';
import {
  dutyAllocationEntriesToObject,
  isDutyAllocationSingletonSerial,
  leanDutyAllocationEntry,
  leanDutyAllocationFromLegacyDoc,
} from '../utils/duty-allocation.util';
import {
  normalizeFlightDetails,
  normalizeNoOfBags,
  noOfBagsHasValue,
} from '../utils/pax-shift-field-coercion.util';
import {
  isShortShippedSingletonSerial,
  leanShortShippedFlightEntry,
  normalizeFlightSnapshot,
  shortShippedBagsByFlightToObject,
} from '../utils/short-shipped-bags.util';

function leanFlightReport(doc: ReportsPaxShiftReport & { _id?: Types.ObjectId }) {
  const sections = sectionsMapToObject(doc.sections);
  return {
    reportKind: PAX_SHIFT_REPORT_KIND.FLIGHT_REPORT,
    flightSerial: String(doc.flightSerial ?? '').trim(),
    flightDetails: doc.flightDetails ?? {},
    sections,
    flightSnapshot: doc.flightSnapshot ?? undefined,
    hasOpenFormData: Boolean(doc.hasOpenFormData),
    updatedAt: (doc as { updatedAt?: Date }).updatedAt,
    createdAt: (doc as { createdAt?: Date }).createdAt,
  };
}

function mapStaffAssignmentsFromDto(
  dto: CreateDutyAllocationDto,
): PaxShiftDutyAllocationEntry['staffAssignments'] {
  return dto.staffAssignments.map((s) => ({
    staff: String(s.staff ?? '').trim(),
    employeeCode: String(s.employeeCode ?? '').trim(),
    employeeName: String(s.employeeName ?? '').trim(),
    dutyAllocations: Array.isArray(s.dutyAllocations)
      ? s.dutyAllocations.map((d) => String(d).trim())
      : [],
  }));
}

@Injectable()
export class ReportsPaxShiftReportService {
  constructor(
    @InjectModel(ReportsPaxShiftReport.name)
    private readonly model: Model<ReportsPaxShiftReportDocument>,
  ) {}

  /** Flights that have any Open-button form data saved. */
  async listFlightReportsWithData(): Promise<
    { flightSerial: string; hasOpenFormData: boolean }[]
  > {
    const docs = await this.model
      .find({
        reportKind: PAX_SHIFT_REPORT_KIND.FLIGHT_REPORT,
        hasOpenFormData: true,
      })
      .select({ flightSerial: 1 })
      .lean()
      .exec();
    return docs.map((d) => ({
      flightSerial: String(d.flightSerial ?? '').trim(),
      hasOpenFormData: true,
    }));
  }

  async getFlightReport(flightSerial: string) {
    const fs = flightSerial.trim();
    const doc = await this.model
      .findOne({
        reportKind: PAX_SHIFT_REPORT_KIND.FLIGHT_REPORT,
        flightSerial: fs,
      })
      .lean()
      .exec();
    if (!doc) {
      return {
        reportKind: PAX_SHIFT_REPORT_KIND.FLIGHT_REPORT,
        flightSerial: fs,
        flightDetails: {},
        sections: {},
        hasOpenFormData: false,
      };
    }
    return leanFlightReport(doc);
  }

  async getBatchFlightReports(flightSerials: string[]) {
    const fsList = [...new Set(flightSerials.map((s) => String(s ?? '').trim()).filter(Boolean))];
    if (fsList.length === 0) return {};

    const docs = await this.model
      .find({
        reportKind: PAX_SHIFT_REPORT_KIND.FLIGHT_REPORT,
        flightSerial: { $in: fsList },
      })
      .lean()
      .exec();

    const reportsByFs = docs.reduce((acc, doc) => {
      const fs = String(doc.flightSerial ?? '').trim();
      if (fs) {
        acc[fs] = leanFlightReport(doc as any);
      }
      return acc;
    }, {} as Record<string, ReturnType<typeof leanFlightReport>>);

    const shortShippedByFs = await this.getShortShippedBagsByFlightSerials(fsList);

    const out: Record<string, { flightReport: ReturnType<typeof leanFlightReport>; shortShippedBags: any }> = {};
    for (const fs of fsList) {
      out[fs] = {
        flightReport: reportsByFs[fs] || {
          reportKind: PAX_SHIFT_REPORT_KIND.FLIGHT_REPORT,
          flightSerial: fs,
          flightDetails: {},
          sections: {},
          hasOpenFormData: false,
        },
        shortShippedBags: shortShippedByFs[fs] || { shortShippedBags: { rows: [] } },
      };
    }
    return out;
  }

  async upsertFlightReportSection(dto: UpsertFlightReportSectionDto) {
    const flightSerial = dto.flightSerial.trim();
    const section = dto.section.trim();
    if (!isPaxShiftEmployeeSectionKey(section)) {
      throw new BadRequestException(`Unknown employee section: ${section}`);
    }
    const rows = normalizeEmployeeRows(dto.rows);
    const flightSnapshot = normalizeFlightSnapshot(dto.flightSnapshot);

    const existing = await this.model
      .findOne({
        reportKind: PAX_SHIFT_REPORT_KIND.FLIGHT_REPORT,
        flightSerial,
      })
      .exec();

    const sections =
      existing?.sections instanceof Map
        ? new Map(existing.sections)
        : new Map(
            Object.entries(
              sectionsMapToObject(
                existing?.sections as Record<string, unknown> | undefined,
              ),
            ),
          );
    sections.set(section, { rows });

    const flightDetails = existing?.flightDetails ?? {};
    const shortShippedBags = existing?.shortShippedBags;
    const hasOpenFormData = flightReportHasOpenFormData({
      flightDetails,
      sections,
      shortShippedBags,
    });

    const updated = await this.model
      .findOneAndUpdate(
        { reportKind: PAX_SHIFT_REPORT_KIND.FLIGHT_REPORT, flightSerial },
        {
          $set: {
            reportKind: PAX_SHIFT_REPORT_KIND.FLIGHT_REPORT,
            flightSerial,
            sections,
            ...(flightSnapshot ? { flightSnapshot } : {}),
            hasOpenFormData,
          },
          $setOnInsert: {
            flightDetails: {},
          },
        },
        { new: true, upsert: true, runValidators: true },
      )
      .lean()
      .exec();

    return leanFlightReport(updated!);
  }

  async upsertFlightDetails(dto: UpsertFlightDetailsDto) {
    const flightSerial = dto.flightSerial.trim();
    const flightDetails = normalizeFlightDetails(dto.data);
    const flightSnapshot = normalizeFlightSnapshot(dto.flightSnapshot);

    const existing = await this.model
      .findOne({
        reportKind: PAX_SHIFT_REPORT_KIND.FLIGHT_REPORT,
        flightSerial,
      })
      .lean()
      .exec();

    const sections = existing?.sections;
    const hasOpenFormData = flightReportHasOpenFormData({
      flightDetails,
      sections: sections as never,
      shortShippedBags: existing?.shortShippedBags,
    });

    const updated = await this.model
      .findOneAndUpdate(
        { reportKind: PAX_SHIFT_REPORT_KIND.FLIGHT_REPORT, flightSerial },
        {
          $set: {
            reportKind: PAX_SHIFT_REPORT_KIND.FLIGHT_REPORT,
            flightSerial,
            flightDetails,
            hasOpenFormData,
            ...(flightSnapshot ? { flightSnapshot } : {}),
          },
          $setOnInsert: { sections: new Map() },
        },
        { new: true, upsert: true, runValidators: true },
      )
      .lean()
      .exec();

    return {
      flightSerial,
      data: updated?.flightDetails ?? flightDetails,
      hasOpenFormData: Boolean(updated?.hasOpenFormData),
    };
  }

  /** Merge legacy per-flight `short_shipped_bags` docs into the singleton instance. */
  private async consolidateLegacyShortShippedDocs(): Promise<void> {
    const legacyDocs = await this.model
      .find({
        reportKind: PAX_SHIFT_REPORT_KIND.SHORT_SHIPPED_BAGS,
        flightSerial: {
          $exists: true,
          $nin: ['', SHORT_SHIPPED_BAGS_SINGLETON_SERIAL],
        },
      })
      .exec();

    if (!legacyDocs.length) return;

    let singleton = await this.model
      .findOne({
        reportKind: PAX_SHIFT_REPORT_KIND.SHORT_SHIPPED_BAGS,
        flightSerial: SHORT_SHIPPED_BAGS_SINGLETON_SERIAL,
      })
      .exec();

    if (!singleton) {
      singleton = await this.model.create({
        reportKind: PAX_SHIFT_REPORT_KIND.SHORT_SHIPPED_BAGS,
        flightSerial: SHORT_SHIPPED_BAGS_SINGLETON_SERIAL,
        shortShippedBagsByFlight: new Map(),
      });
    }

    const byFlight =
      singleton.shortShippedBagsByFlight instanceof Map
        ? new Map(singleton.shortShippedBagsByFlight)
        : new Map(
            Object.entries(
              shortShippedBagsByFlightToObject(singleton.shortShippedBagsByFlight),
            ),
          );

    const legacyIds: Types.ObjectId[] = [];
    for (const doc of legacyDocs) {
      const fs = String(doc.flightSerial ?? '').trim();
      if (!fs || isShortShippedSingletonSerial(fs)) continue;
      legacyIds.push(doc._id as Types.ObjectId);
      const existing = byFlight.get(fs);
      const bags = doc.shortShippedBags ?? { rows: [] };
      const legacyBagCount = normalizeNoOfBags(bags.noOfBags);
      const hasLegacy =
        (bags.rows?.length ?? 0) > 0 || noOfBagsHasValue(legacyBagCount);
      const existingCount = normalizeNoOfBags(existing?.shortShippedBags?.noOfBags);
      const hasExisting =
        (existing?.shortShippedBags?.rows?.length ?? 0) > 0 ||
        noOfBagsHasValue(existingCount);
      if (!hasLegacy && hasExisting) continue;
      const entry: PaxShiftShortShippedBagFlightEntry = {
        shortShippedBags: {
          ...(legacyBagCount !== undefined ? { noOfBags: legacyBagCount } : {}),
          rows: (bags.rows ?? []).map((r) => ({
            id: String(r.id ?? '').trim(),
            optionSection: String(r.optionSection ?? '').trim(),
            remarks: String(r.remarks ?? '').trim(),
          })),
        },
        ...(doc.flightSnapshot ? { flightSnapshot: doc.flightSnapshot } : {}),
      };
      byFlight.set(fs, entry);
    }

    singleton.shortShippedBagsByFlight = byFlight;
    singleton.markModified('shortShippedBagsByFlight');
    await singleton.save();

    if (legacyIds.length) {
      await this.model.deleteMany({ _id: { $in: legacyIds } }).exec();
    }
  }

  private async getShortShippedBagsSingletonDoc() {
    await this.consolidateLegacyShortShippedDocs();
    let doc = await this.model
      .findOne({
        reportKind: PAX_SHIFT_REPORT_KIND.SHORT_SHIPPED_BAGS,
        flightSerial: SHORT_SHIPPED_BAGS_SINGLETON_SERIAL,
      })
      .exec();

    if (!doc) {
      doc = await this.model.create({
        reportKind: PAX_SHIFT_REPORT_KIND.SHORT_SHIPPED_BAGS,
        flightSerial: SHORT_SHIPPED_BAGS_SINGLETON_SERIAL,
        shortShippedBagsByFlight: new Map(),
      });
    }

    return doc;
  }

  async getShortShippedBags(flightSerial: string) {
    const fs = flightSerial.trim();
    if (!fs || isShortShippedSingletonSerial(fs)) {
      return { flightSerial: fs, noOfBags: 0, rows: [] };
    }

    const doc = await this.getShortShippedBagsSingletonDoc();
    const byFlight = shortShippedBagsByFlightToObject(doc.shortShippedBagsByFlight);
    return leanShortShippedFlightEntry(fs, byFlight[fs]);
  }

  async findAllShortShippedBags() {
    const doc = await this.getShortShippedBagsSingletonDoc();
    const byFlight = shortShippedBagsByFlightToObject(doc.shortShippedBagsByFlight);
    return Object.entries(byFlight)
      .map(([flightSerial, entry]) =>
        leanShortShippedFlightEntry(flightSerial, entry),
      )
      .filter(
        (row) =>
          row.rows.length > 0 || noOfBagsHasValue(row.noOfBags),
      )
      .slice(0, 500);
  }

  async getShortShippedBagsByFlightSerials(flightSerials: string[]) {
    const keys = [
      ...new Set(
        flightSerials
          .map((s) => String(s ?? '').trim())
          .filter((s) => s && !isShortShippedSingletonSerial(s)),
      ),
    ];
    if (!keys.length) return {};

    const doc = await this.getShortShippedBagsSingletonDoc();
    const byFlight = shortShippedBagsByFlightToObject(doc.shortShippedBagsByFlight);
    const out: Record<string, ReturnType<typeof leanShortShippedFlightEntry>> =
      {};
    for (const k of keys) {
      if (byFlight[k]) {
        out[k] = leanShortShippedFlightEntry(k, byFlight[k]);
      }
    }
    return out;
  }

  async upsertShortShippedBags(dto: UpsertShortShippedBagsDto) {
    const flightSerial = dto.flightSerial.trim();
    if (!flightSerial || isShortShippedSingletonSerial(flightSerial)) {
      throw new BadRequestException('A valid flight serial is required.');
    }

    const noOfBags = normalizeNoOfBags(dto.noOfBags);
    const rows = Array.isArray(dto.rows)
      ? dto.rows.map((r) => ({
          id: String(r.id ?? '').trim(),
          optionSection: String(r.optionSection ?? '').trim(),
          remarks: String(r.remarks ?? '').trim(),
        }))
      : [];
    const flightSnapshot = normalizeFlightSnapshot(dto.flightSnapshot);

    const doc = await this.getShortShippedBagsSingletonDoc();
    const byFlight =
      doc.shortShippedBagsByFlight instanceof Map
        ? new Map(doc.shortShippedBagsByFlight)
        : new Map(
            Object.entries(
              shortShippedBagsByFlightToObject(doc.shortShippedBagsByFlight),
            ),
          );

    const entry: PaxShiftShortShippedBagFlightEntry = {
      shortShippedBags: {
        ...(noOfBags !== undefined ? { noOfBags } : {}),
        rows,
      },
      ...(flightSnapshot ? { flightSnapshot } : {}),
    };
    byFlight.set(flightSerial, entry);
    doc.shortShippedBagsByFlight = byFlight;
    doc.markModified('shortShippedBagsByFlight');
    await doc.save();

    return leanShortShippedFlightEntry(flightSerial, entry);
  }

  /** Merge legacy per-document duty_allocation rows into the singleton instance. */
  private async consolidateLegacyDutyAllocationDocs(): Promise<void> {
    const legacyDocs = await this.model
      .find({
        reportKind: PAX_SHIFT_REPORT_KIND.DUTY_ALLOCATION,
        flightSerial: { $ne: DUTY_ALLOCATION_SINGLETON_SERIAL },
      })
      .exec();

    if (!legacyDocs.length) return;

    let singleton = await this.model
      .findOne({
        reportKind: PAX_SHIFT_REPORT_KIND.DUTY_ALLOCATION,
        flightSerial: DUTY_ALLOCATION_SINGLETON_SERIAL,
      })
      .exec();

    if (!singleton) {
      singleton = await this.model.create({
        reportKind: PAX_SHIFT_REPORT_KIND.DUTY_ALLOCATION,
        flightSerial: DUTY_ALLOCATION_SINGLETON_SERIAL,
        dutyAllocationEntries: new Map(),
      });
    }

    const entries =
      singleton.dutyAllocationEntries instanceof Map
        ? new Map(singleton.dutyAllocationEntries)
        : new Map(
            Object.entries(
              dutyAllocationEntriesToObject(singleton.dutyAllocationEntries),
            ),
          );

    const legacyIds: Types.ObjectId[] = [];
    for (const doc of legacyDocs) {
      const entryId = String(doc._id ?? '').trim();
      if (!entryId) continue;
      legacyIds.push(doc._id as Types.ObjectId);
      if (entries.has(entryId)) continue;
      entries.set(entryId, {
        date: String(doc.date ?? '').trim(),
        shift: String(doc.shift ?? '').trim(),
        flight: String(doc.flight ?? '').trim(),
        flightNo: String(doc.flightNo ?? '').trim(),
        staffAssignments: (doc.staffAssignments ?? []).map((s) => ({
          staff: String(s.staff ?? '').trim(),
          employeeCode: String(s.employeeCode ?? '').trim(),
          employeeName: String(s.employeeName ?? '').trim(),
          dutyAllocations: Array.isArray(s.dutyAllocations)
            ? s.dutyAllocations.map((d) => String(d).trim())
            : [],
        })),
      });
    }

    singleton.dutyAllocationEntries = entries;
    singleton.markModified('dutyAllocationEntries');
    await singleton.save();

    if (legacyIds.length) {
      await this.model.deleteMany({ _id: { $in: legacyIds } }).exec();
    }
  }

  private async getDutyAllocationSingletonDoc(): Promise<ReportsPaxShiftReportDocument> {
    await this.consolidateLegacyDutyAllocationDocs();
    let doc = await this.model
      .findOne({
        reportKind: PAX_SHIFT_REPORT_KIND.DUTY_ALLOCATION,
        flightSerial: DUTY_ALLOCATION_SINGLETON_SERIAL,
      })
      .exec();

    if (!doc) {
      doc = await this.model.create({
        reportKind: PAX_SHIFT_REPORT_KIND.DUTY_ALLOCATION,
        flightSerial: DUTY_ALLOCATION_SINGLETON_SERIAL,
        dutyAllocationEntries: new Map(),
      });
    }

    return doc;
  }

  async createDutyAllocation(dto: CreateDutyAllocationDto) {
    const entryId = randomUUID();
    const entry: PaxShiftDutyAllocationEntry = {
      date: dto.date.trim(),
      shift: String(dto.shift ?? '').trim(),
      flight: String(dto.flight ?? '').trim(),
      flightNo: String(dto.flightNo ?? '').trim(),
      staffAssignments: mapStaffAssignmentsFromDto(dto),
    };

    const doc = await this.getDutyAllocationSingletonDoc();
    const entries =
      doc.dutyAllocationEntries instanceof Map
        ? new Map(doc.dutyAllocationEntries)
        : new Map(
            Object.entries(
              dutyAllocationEntriesToObject(doc.dutyAllocationEntries),
            ),
          );
    entries.set(entryId, entry);
    doc.dutyAllocationEntries = entries;
    doc.markModified('dutyAllocationEntries');
    await doc.save();

    return leanDutyAllocationEntry(entryId, entry, {
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  }

  async listDutyAllocations(fromYmd: string, toYmd: string) {
    const from = fromYmd.trim();
    const to = toYmd.trim();
    const doc = await this.getDutyAllocationSingletonDoc();
    const byId = dutyAllocationEntriesToObject(doc.dutyAllocationEntries);
    return Object.entries(byId)
      .map(([entryId, entry]) =>
        leanDutyAllocationEntry(entryId, entry, {
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
        }),
      )
      .filter((row) => {
        const d = row.date;
        return d >= from && d <= to;
      })
      .sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        return String(b._id).localeCompare(String(a._id));
      });
  }

  async findOneDutyAllocation(id: string) {
    const entryId = String(id ?? '').trim();
    if (!entryId) {
      throw new NotFoundException('Duty allocation not found.');
    }

    const doc = await this.getDutyAllocationSingletonDoc();
    const byId = dutyAllocationEntriesToObject(doc.dutyAllocationEntries);
    const entry = byId[entryId];
    if (entry) {
      return leanDutyAllocationEntry(entryId, entry, {
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      });
    }

    if (Types.ObjectId.isValid(entryId)) {
      const legacy = await this.model
        .findOne({
          _id: new Types.ObjectId(entryId),
          reportKind: PAX_SHIFT_REPORT_KIND.DUTY_ALLOCATION,
        })
        .lean()
        .exec();
      if (legacy && !isDutyAllocationSingletonSerial(String(legacy.flightSerial ?? ''))) {
        return leanDutyAllocationFromLegacyDoc(
          legacy as ReportsPaxShiftReport & { _id: Types.ObjectId },
        );
      }
    }

    throw new NotFoundException('Duty allocation not found.');
  }

  async updateDutyAllocation(id: string, dto: CreateDutyAllocationDto) {
    const entryId = String(id ?? '').trim();
    if (!entryId) {
      throw new NotFoundException('Duty allocation not found.');
    }

    const doc = await this.getDutyAllocationSingletonDoc();
    const entries =
      doc.dutyAllocationEntries instanceof Map
        ? new Map(doc.dutyAllocationEntries)
        : new Map(
            Object.entries(
              dutyAllocationEntriesToObject(doc.dutyAllocationEntries),
            ),
          );

    if (!entries.has(entryId)) {
      throw new NotFoundException('Duty allocation not found.');
    }

    const entry: PaxShiftDutyAllocationEntry = {
      date: dto.date.trim(),
      shift: String(dto.shift ?? '').trim(),
      flight: String(dto.flight ?? '').trim(),
      flightNo: String(dto.flightNo ?? '').trim(),
      staffAssignments: mapStaffAssignmentsFromDto(dto),
    };
    entries.set(entryId, entry);
    doc.dutyAllocationEntries = entries;
    doc.markModified('dutyAllocationEntries');
    await doc.save();

    return leanDutyAllocationEntry(entryId, entry, {
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  }

  async removeDutyAllocation(id: string) {
    const entryId = String(id ?? '').trim();
    if (!entryId) {
      throw new NotFoundException('Duty allocation not found.');
    }

    const doc = await this.getDutyAllocationSingletonDoc();
    const entries =
      doc.dutyAllocationEntries instanceof Map
        ? new Map(doc.dutyAllocationEntries)
        : new Map(
            Object.entries(
              dutyAllocationEntriesToObject(doc.dutyAllocationEntries),
            ),
          );

    if (!entries.delete(entryId)) {
      throw new NotFoundException('Duty allocation not found.');
    }

    doc.dutyAllocationEntries = entries;
    doc.markModified('dutyAllocationEntries');
    await doc.save();

    return { deleted: true };
  }
}
