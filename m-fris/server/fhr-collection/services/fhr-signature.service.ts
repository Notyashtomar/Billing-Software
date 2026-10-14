import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  USER_ACTIVITY_LOG_EVENT,
  type UserActivityLogEventPayload,
} from 'src/user-activity-notifications/events/user-activity.events';
import {
  FhrCollection,
  FhrCollectionDocument,
} from '../schema/fhr-collection.schema';
import {
  NsFhrCollection,
  type NsFhrCollectionDocument,
} from '../../ns-fhr-collection/schema/ns-fhr-collection.schema';
import type { FhrSignatures } from '../schema/fhr-signatures.schema';
import type { SaveFhrSignatureDto } from '../dto/save-fhr-signature.dto';
import { RepresentativeSignatureService } from 'src/representative-signatures/services/representative-signature.service';
import type { AssignReportType } from 'src/representative-signatures/services/representative-signature.service';
import type { RepresentativeType } from 'src/representative-signatures/schema/representative-signature.schema';
import {
  CROSS_STATION_SYSTEM_SCOPE,
  type StationScopeContext,
} from '../../common/station/station-scope';
import {
  LEGACY_STATION_CODE,
  normalizeStationCode,
} from '../../common/station/station.constants';

/** Authenticated caller context forwarded from the controller for audit logging. */
export type FhrSignatureActor = {
  userId: string;
  userName: string;
  userEmail?: string;
  accountType: 'admin' | 'user';
  ipAddress?: string;
  userAgent?: string;
};

export type FhrSignatureView = {
  signatures: FhrSignatures;
  status: 'DRAFT' | 'FINALIZED';
  finalizedAt: Date | null;
  isFinalized: boolean;
};

/** A single resolved signature party (image resolved from repository or legacy embed). */
export type ResolvedSignatureParty = {
  name: string;
  signatureUrl: string;
  signatureId: string;
  signedAt: Date | null;
};

/** Render-ready signatures for PDF generation (FHR / GSE / Team). */
export type ResolvedFhrSignatures = {
  gh: ResolvedSignatureParty;
  airline: ResolvedSignatureParty;
  status: 'DRAFT' | 'FINALIZED';
  finalizedAt: Date | null;
  isFinalized: boolean;
};

const EMPTY_SIGNATURES: FhrSignatures = {
  ghRepresentativeName: '',
  ghSignatureId: '',
  ghSignatureUrl: '',
  ghSignedAt: null,
  ghSignedByUserId: '',
  airlineRepresentativeName: '',
  airlineSignatureId: '',
  airlineSignatureUrl: '',
  airlineSignedAt: null,
  airlineSignedByUserId: '',
};

type SignatureHostDocument = FhrCollectionDocument | NsFhrCollectionDocument;

@Injectable()
export class FhrSignatureService {
  private readonly logger = new Logger(FhrSignatureService.name);

  constructor(
    @InjectModel(FhrCollection.name)
    private readonly fhrModel: Model<FhrCollectionDocument>,
    @InjectModel(NsFhrCollection.name)
    private readonly nsFhrModel: Model<NsFhrCollectionDocument>,
    private readonly eventEmitter: EventEmitter2,
    private readonly repository: RepresentativeSignatureService,
  ) {}

  private serialFilter(serial: number) {
    return { $or: [{ SerialNo: serial }, { flightSerialNumber: serial }] };
  }

  private isNsHost(doc: SignatureHostDocument): boolean {
    return (
      String(
        (doc as { collection?: { collectionName?: string } }).collection
          ?.collectionName ?? '',
      ) === 'ns_fhr_collection'
    );
  }

  private async persistHost(
    doc: SignatureHostDocument,
    set: Record<string, unknown>,
  ): Promise<SignatureHostDocument | null> {
    if (this.isNsHost(doc)) {
      return this.nsFhrModel
        .findOneAndUpdate({ _id: doc._id }, { $set: set }, { new: true })
        .exec();
    }
    return this.fhrModel
      .findOneAndUpdate({ _id: doc._id }, { $set: set }, { new: true })
      .exec();
  }

  /** Station to stamp on a newly auto-created FHR draft (cross-station → legacy MAA). */
  private stampStationCode(station: StationScopeContext): string {
    if (station.crossStation) return LEGACY_STATION_CODE;
    return normalizeStationCode(station.stationCode) ?? LEGACY_STATION_CODE;
  }

  private async loadDoc(serial: number): Promise<SignatureHostDocument> {
    const ns = await this.nsFhrModel.findOne(this.serialFilter(serial)).exec();
    if (ns) return ns;
    const doc = await this.fhrModel.findOne(this.serialFilter(serial)).exec();
    if (!doc) {
      throw new NotFoundException(
        `No FHR found for flight serial ${serial}. Save Main Details first.`,
      );
    }
    return doc;
  }

  /**
   * Load the FHR document for a flight, creating a minimal DRAFT shell when it
   * does not exist yet. Capturing a signature must not require the user to first
   * save Main Details — the draft is auto-created (and later enriched when the
   * form collections are saved via `upsertMerge`). Keyed by the unique
   * `SerialNo` so concurrent writes converge on a single document.
   */
  private async ensureDoc(
    serial: number,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<SignatureHostDocument> {
    const nsExisting = await this.nsFhrModel
      .findOne(this.serialFilter(serial))
      .exec();
    if (nsExisting) {
      this.logger.debug(
        `[sig-debug] ensureDoc found ns_fhr doc for serial=${serial} _id=${String(nsExisting._id)}`,
      );
      return nsExisting;
    }
    const existing = await this.fhrModel
      .findOne(this.serialFilter(serial))
      .exec();
    if (existing) {
      this.logger.debug(
        `[sig-debug] ensureDoc found existing doc for serial=${serial} _id=${String(existing._id)}`,
      );
      return existing;
    }

    this.logger.debug(
      `[sig-debug] ensureDoc creating DRAFT shell for serial=${serial}`,
    );
    const created = await this.fhrModel
      .findOneAndUpdate(
        { SerialNo: serial },
        {
          $setOnInsert: {
            SerialNo: serial,
            flightSerialNumber: serial,
            stationCode: this.stampStationCode(station),
            status: 'DRAFT',
            lastSnapshotAt: new Date(),
            lastSnapshotReason: 'signature_autocreate',
            // The collection has a unique index on the nested
            // `mainDetails.flightSerialNumber`; a bare shell would leave it
            // null and collide with the single permitted null doc. Seed the
            // serial here (mirrors `upsertMerge`) so inserts never collide.
            'mainDetails.SerialNo': serial,
            'mainDetails.flightSerialNumber': serial,
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .exec();

    if (!created) {
      throw new NotFoundException(
        `Unable to create FHR draft for flight serial ${serial}.`,
      );
    }
    this.logger.debug(
      `[sig-debug] ensureDoc created doc serial=${serial} _id=${String(created._id)}`,
    );
    return created;
  }

  private flightNoFromDoc(doc: SignatureHostDocument): string {
    const md = (doc.mainDetails ?? {}) as Record<string, unknown>;
    return String(
      md.DepartureFltNo ?? md.ArrivalFltNo ?? md.flightCode ?? '',
    ).trim();
  }

  private stationFromDoc(doc: SignatureHostDocument): string {
    const md = (doc.mainDetails ?? {}) as Record<string, unknown>;
    return String(md.Terminal ?? md.station ?? '').trim();
  }

  /**
   * Read the embedded signatures as a plain object. `doc.signatures` is a
   * Mongoose subdocument — its schema fields live behind getters in `_doc`, so
   * a naive `{ ...doc.signatures }` spread copies internal Mongoose state rather
   * than the actual fields (yielding empty values). Convert via `toObject()`.
   */
  private plainSignatures(doc: SignatureHostDocument): FhrSignatures {
    const raw = doc.signatures as unknown;
    const obj =
      raw &&
      typeof (raw as { toObject?: () => unknown }).toObject === 'function'
        ? ((raw as { toObject: () => Record<string, unknown> }).toObject() ??
          {})
        : ((raw as Record<string, unknown>) ?? {});
    return { ...EMPTY_SIGNATURES, ...obj } as FhrSignatures;
  }

  private toView(doc: SignatureHostDocument): FhrSignatureView {
    const signatures = this.plainSignatures(doc);
    const status = doc.status === 'FINALIZED' ? 'FINALIZED' : 'DRAFT';
    return {
      signatures,
      status,
      finalizedAt: doc.finalizedAt ?? null,
      isFinalized: status === 'FINALIZED',
    };
  }

  async getSignatures(serial: number): Promise<FhrSignatureView> {
    const doc = await this.loadDoc(serial);
    return this.toView(doc);
  }

  async saveSignature(
    serial: number,
    dto: SaveFhrSignatureDto,
    actor: FhrSignatureActor,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<FhrSignatureView> {
    const doc = await this.ensureDoc(serial, station);

    if (doc.status === 'FINALIZED') {
      throw new BadRequestException(
        'This FHR is finalized and digitally signed. Editing signatures is disabled.',
      );
    }

    const current = this.plainSignatures(doc);

    const now = new Date();
    let isReplacement: boolean;
    let repName: string;
    const repType: RepresentativeType =
      dto.party === 'gh' ? 'GH_REPRESENTATIVE' : 'AIRLINE_REPRESENTATIVE';

    if (dto.party === 'gh') {
      isReplacement = Boolean(current.ghSignatureUrl || current.ghSignatureId);
      // GH representative name is authoritative from the authenticated user.
      repName =
        dto.representativeName?.trim() ||
        actor.userName?.trim() ||
        current.ghRepresentativeName ||
        '';
    } else {
      const name = dto.representativeName?.trim();
      if (!name) {
        throw new BadRequestException(
          'Airline Representative name is required before capturing the airline signature.',
        );
      }
      isReplacement = Boolean(
        current.airlineSignatureUrl || current.airlineSignatureId,
      );
      repName = name;
    }

    // Persist into the centralized reusable repository (create or replace).
    const repoSignature = await this.repository.upsertByName(
      repName,
      repType,
      dto.signatureUrl,
      actor,
      this.stationFromDoc(doc),
    );

    // Atomically update ONLY this party's fields. A full `doc.save()` would
    // re-persist the entire `signatures` subdocument and clobber the other
    // party's signature when the two parties are written concurrently
    // (lost-update race seen between airline save + GH auto-apply).
    const updated = await this.patchParty(doc, dto.party, {
      signatureId: repoSignature.id,
      signatureUrl: dto.signatureUrl,
      signedAt: now,
      signedByUserId: actor.userId,
      representativeName: repName,
    });

    // Record assignment of the repository signature to this FHR.
    await this.repository.assignSignatureToReport(
      repoSignature.id,
      'FHR',
      actor,
      {
        flightNo: this.flightNoFromDoc(doc),
        station: this.stationFromDoc(doc),
        serialNo: serial,
      },
    );

    this.emitAudit(
      actor,
      serial,
      doc,
      dto.party === 'gh'
        ? isReplacement
          ? 'GH_SIGNATURE_UPDATED'
          : 'GH_SIGNATURE_CAPTURED'
        : isReplacement
          ? 'AIRLINE_SIGNATURE_UPDATED'
          : 'AIRLINE_SIGNATURE_CAPTURED',
      'PUT',
    );

    return this.toView(updated);
  }

  /**
   * Atomically set a single party's signature fields with a field-scoped `$set`.
   * Avoids the lost-update race that whole-document `doc.save()` introduces when
   * the GH and Airline signatures are written concurrently.
   */
  private async patchParty(
    doc: SignatureHostDocument,
    party: 'gh' | 'airline',
    values: {
      signatureId: string;
      signatureUrl: string;
      signedAt: Date;
      signedByUserId: string;
      representativeName: string;
    },
  ): Promise<SignatureHostDocument> {
    const prefix = party === 'gh' ? 'gh' : 'airline';
    const set: Record<string, unknown> = {
      [`signatures.${prefix}SignatureId`]: values.signatureId,
      [`signatures.${prefix}SignatureUrl`]: values.signatureUrl,
      [`signatures.${prefix}SignedAt`]: values.signedAt,
      [`signatures.${prefix}SignedByUserId`]: values.signedByUserId,
      [`signatures.${prefix}RepresentativeName`]: values.representativeName,
    };
    if (!doc.status) set.status = 'DRAFT';
    const updated = await this.persistHost(doc, set);
    const sig = (updated?.signatures ?? {}) as Partial<FhrSignatures>;
    this.logger.debug(
      `[sig-debug] patchParty done party=${party} _id=${String(doc._id)} ` +
        `ghUrl.len=${sig.ghSignatureUrl?.length ?? 0} airlineUrl.len=${sig.airlineSignatureUrl?.length ?? 0}`,
    );
    return updated ?? doc;
  }

  /**
   * Assign an existing repository signature (chosen via "Use Existing Signature")
   * to this FHR without re-drawing. Sets the embed reference + denormalized cache.
   */
  async assignExistingSignature(
    serial: number,
    party: 'gh' | 'airline',
    signatureId: string,
    actor: FhrSignatureActor,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<FhrSignatureView> {
    this.logger.debug(
      `[sig-debug] assignExistingSignature serial=${serial} party=${party} signatureId=${signatureId}`,
    );
    const doc = await this.ensureDoc(serial, station);
    if (doc.status === 'FINALIZED') {
      throw new BadRequestException(
        'This FHR is finalized and digitally signed. Editing signatures is disabled.',
      );
    }
    const repoSignature = await this.repository.findById(signatureId);
    if (!repoSignature) {
      this.logger.warn(
        `[sig-debug] assignExistingSignature: repo signature not found id=${signatureId}`,
      );
      throw new NotFoundException('Selected signature was not found.');
    }
    this.logger.debug(
      `[sig-debug] assignExistingSignature: patching party=${party} url.len=${repoSignature.signatureUrl?.length ?? 0}`,
    );

    // Field-scoped atomic update (see patchParty) to avoid clobbering the other
    // party's signature when both are applied around the same time.
    const updated = await this.patchParty(doc, party, {
      signatureId: repoSignature.id,
      signatureUrl: repoSignature.signatureUrl,
      signedAt: new Date(),
      signedByUserId: actor.userId,
      representativeName: repoSignature.representativeName,
    });

    await this.repository.assignSignatureToReport(
      repoSignature.id,
      'FHR',
      actor,
      {
        flightNo: this.flightNoFromDoc(doc),
        station: this.stationFromDoc(doc),
        serialNo: serial,
      },
    );

    return this.toView(updated);
  }

  /**
   * Resolve render-ready signatures for a flight. Image data is resolved from the
   * repository by reference id, falling back to the legacy embedded data URL.
   * When `reportType` is GSE/TEAM_REPORT, an assignment audit event is emitted.
   */
  async resolveForFlight(
    serial: number,
    reportType?: AssignReportType,
    actor?: FhrSignatureActor,
  ): Promise<ResolvedFhrSignatures> {
    const doc = await this.loadDoc(serial);
    const sig = this.plainSignatures(doc);

    const resolveParty = async (
      id: string,
      fallbackUrl: string,
      fallbackName: string,
      signedAt: Date | null,
    ): Promise<ResolvedSignatureParty> => {
      let url = fallbackUrl || '';
      let name = fallbackName || '';
      if (id) {
        const repo = await this.repository.findById(id);
        if (repo) {
          url = repo.signatureUrl || url;
          name = repo.representativeName || name;
        }
      }
      return { name, signatureUrl: url, signatureId: id || '', signedAt };
    };

    const gh = await resolveParty(
      sig.ghSignatureId,
      sig.ghSignatureUrl,
      sig.ghRepresentativeName,
      sig.ghSignedAt ?? null,
    );
    const airline = await resolveParty(
      sig.airlineSignatureId,
      sig.airlineSignatureUrl,
      sig.airlineRepresentativeName,
      sig.airlineSignedAt ?? null,
    );

    if (
      reportType &&
      reportType !== 'FHR' &&
      actor &&
      (gh.signatureId || airline.signatureId)
    ) {
      const ctx = {
        flightNo: this.flightNoFromDoc(doc),
        station: this.stationFromDoc(doc),
        serialNo: serial,
      };
      try {
        if (gh.signatureId) {
          await this.repository.assignSignatureToReport(
            gh.signatureId,
            reportType,
            actor,
            ctx,
          );
        }
        if (airline.signatureId) {
          await this.repository.assignSignatureToReport(
            airline.signatureId,
            reportType,
            actor,
            ctx,
          );
        }
      } catch (err) {
        this.logger.warn(
          `Failed to record ${reportType} signature assignment: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    this.logger.debug(
      `[sig-debug] resolveForFlight serial=${serial} report=${reportType ?? 'none'} ` +
        `ghUrl.len=${gh.signatureUrl?.length ?? 0} airlineUrl.len=${airline.signatureUrl?.length ?? 0}`,
    );

    const status = doc.status === 'FINALIZED' ? 'FINALIZED' : 'DRAFT';
    return {
      gh,
      airline,
      status,
      finalizedAt: doc.finalizedAt ?? null,
      isFinalized: status === 'FINALIZED',
    };
  }

  async finalize(
    serial: number,
    actor: FhrSignatureActor,
  ): Promise<FhrSignatureView> {
    const doc = await this.loadDoc(serial);

    if (doc.status === 'FINALIZED') {
      throw new BadRequestException('This FHR is already finalized.');
    }

    const sig = this.plainSignatures(doc);

    if (!sig.ghSignatureUrl && !sig.ghSignatureId) {
      throw new BadRequestException('GH Representative signature is required.');
    }
    if (!sig.airlineRepresentativeName?.trim()) {
      throw new BadRequestException('Airline Representative name is required.');
    }
    if (!sig.airlineSignatureUrl && !sig.airlineSignatureId) {
      throw new BadRequestException(
        'Airline Representative signature is required.',
      );
    }

    const finalizedAt = new Date();
    const updated = await this.persistHost(doc, {
      status: 'FINALIZED',
      finalizedAt,
      finalizedByUserId: actor.userId,
    });

    this.emitAudit(actor, serial, updated ?? doc, 'FHR_FINALIZED', 'POST');

    return this.toView(updated ?? doc);
  }

  /** Emit a rich, FHR-specific audit event (recorded by the user-activity listener). */
  private emitAudit(
    actor: FhrSignatureActor,
    serial: number,
    doc: SignatureHostDocument,
    event:
      | 'GH_SIGNATURE_CAPTURED'
      | 'GH_SIGNATURE_UPDATED'
      | 'AIRLINE_SIGNATURE_CAPTURED'
      | 'AIRLINE_SIGNATURE_UPDATED'
      | 'FHR_FINALIZED',
    method: 'PUT' | 'POST',
  ): void {
    const flightNo = this.flightNoFromDoc(doc);
    const station = this.stationFromDoc(doc);
    const labels: Record<string, string> = {
      GH_SIGNATURE_CAPTURED: 'GH representative signature captured',
      GH_SIGNATURE_UPDATED: 'GH representative signature updated',
      AIRLINE_SIGNATURE_CAPTURED: 'Airline representative signature captured',
      AIRLINE_SIGNATURE_UPDATED: 'Airline representative signature updated',
      FHR_FINALIZED: 'FHR digitally signed and finalized',
    };

    const payload: UserActivityLogEventPayload = {
      userId: actor.userId,
      userName: actor.userName,
      userEmail: actor.userEmail,
      accountType: actor.accountType,
      action: `${labels[event]}${flightNo ? ` — ${flightNo}` : ''}`,
      method,
      path: `/fhr-collection/flight/${serial}/signature`,
      metadata: {
        auditEvent: event,
        fhrNo: serial,
        serialNo: serial,
        flightNo: flightNo || undefined,
        station: station || undefined,
        stationName: station || undefined,
      },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    };

    try {
      this.eventEmitter.emit(USER_ACTIVITY_LOG_EVENT, payload);
    } catch (err) {
      this.logger.warn(
        `Failed to emit FHR signature audit event: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
