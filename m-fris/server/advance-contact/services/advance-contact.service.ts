import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AdvanceContact,
  AdvanceContactDocument,
} from '../schema/advance-contact.schema';
import { CreateAdvanceContactDto } from '../dto/create-advance-contact.dto';
import { BulkCreateAdvanceContactItemDto } from '../dto/bulk-create-advance-contact.dto';
import {
  MainDetails,
  MainDetailsDocument,
} from '../../main-details/schema/main-details.schema';
import { escapeRegex } from '../../common/escape-regex.util';
import {
  CROSS_STATION_SYSTEM_SCOPE,
  scopeForGatewayRead,
  StationScope,
  type StationScopeContext,
} from '../../common/station/station-scope';
import {
  LEGACY_STATION_CODE,
  normalizeStationCode,
} from '../../common/station/station.constants';
import {
  RepresentativeSignatureService,
  type SignatureActor,
} from '../../representative-signatures/services/representative-signature.service';

@Injectable()
export class AdvanceContactService {
  constructor(
    @InjectModel(AdvanceContact.name)
    private advanceContactModel: Model<AdvanceContactDocument>,
    @InjectModel(MainDetails.name)
    private readonly mainDetailsModel: Model<MainDetailsDocument>,
    private readonly representativeSignatureService: RepresentativeSignatureService,
  ) {}

  private stampStationCode(station: StationScopeContext): string {
    return normalizeStationCode(station.stationCode) ?? LEGACY_STATION_CODE;
  }

  private normalize(dto: CreateAdvanceContactDto | Partial<CreateAdvanceContactDto>) {
    const out: Partial<CreateAdvanceContactDto> = {};
    if (dto.email !== undefined) out.email = String(dto.email).trim().toLowerCase();
    if (dto.contact !== undefined) out.contact = String(dto.contact).trim();
    if (dto.airline !== undefined) out.airline = String(dto.airline).trim();
    if (dto.airlineRepresentative !== undefined) {
      const airlineRepresentative = String(dto.airlineRepresentative)
        .trim()
        .replace(/\s+/g, ' ');
      if (
        airlineRepresentative &&
        !/^[A-Za-z]+(?: [A-Za-z]+)*$/.test(airlineRepresentative)
      ) {
        throw new BadRequestException(
          'Airline representative name may only contain letters.',
        );
      }
      out.airlineRepresentative = airlineRepresentative;
    }
    if (dto.mobileNo !== undefined) out.mobileNo = String(dto.mobileNo).trim();
    if (dto.weekDay !== undefined) out.weekDay = String(dto.weekDay).trim();
    if (dto.companyName !== undefined) {
      const companyName = String(dto.companyName).trim().replace(/\s+/g, ' ');
      if (companyName && !/^[A-Za-z]+(?: [A-Za-z]+)*$/.test(companyName)) {
        throw new BadRequestException('Company name may only contain letters.');
      }
      out.companyName = companyName;
    }
    if (dto.signatureUrl !== undefined) {
      out.signatureUrl = String(dto.signatureUrl).trim();
    }
    return out;
  }

  private async syncSignatureToRepository(
    representativeName: string,
    signatureUrl: string | undefined,
    station: StationScopeContext,
    actor?: SignatureActor,
  ): Promise<void> {
    if (signatureUrl === undefined || !actor) return;
    const trimmed = String(signatureUrl).trim();
    if (!trimmed || !representativeName.trim()) return;
    await this.representativeSignatureService.upsertByName(
      representativeName.trim(),
      'AIRLINE_REPRESENTATIVE',
      trimmed,
      actor,
      this.stampStationCode(station),
    );
  }

  async create(
    dto: CreateAdvanceContactDto,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
    actor?: SignatureActor,
  ) {
    const body = this.normalize(dto);
    const doc = new this.advanceContactModel({
      ...body,
      stationCode: this.stampStationCode(station),
    });
    const saved = await doc.save();
    await this.syncSignatureToRepository(
      saved.airlineRepresentative,
      body.signatureUrl,
      station,
      actor,
    );
    return saved;
  }

  private normalizeBulkItem(dto: BulkCreateAdvanceContactItemDto) {
    const rawEmail = String(dto.email ?? '').trim().toLowerCase();
    const email =
      rawEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail) ? rawEmail : '';
    return {
      email,
      contact: String(dto.contact ?? '').trim(),
      airline: String(dto.airline ?? '').trim(),
      airlineRepresentative: String(dto.airlineRepresentative ?? '').trim(),
      mobileNo: String(dto.mobileNo ?? '').trim(),
      companyName: String(dto.companyName ?? '').trim(),
      weekDay: String(dto.weekDay ?? '').trim(),
      signatureUrl: String(dto.signatureUrl ?? '').trim(),
    };
  }

  async createBulk(
    dtos: BulkCreateAdvanceContactItemDto[],
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
    actor?: SignatureActor,
  ) {
    if (!Array.isArray(dtos) || dtos.length === 0) {
      return { inserted: 0, skipped: 0, docs: [] as AdvanceContactDocument[] };
    }

    const stationCode = this.stampStationCode(station);
    const toInsert: Array<ReturnType<AdvanceContactService['normalizeBulkItem']> & {
      stationCode: string;
    }> = [];
    let skipped = 0;

    for (const dto of dtos) {
      const row = this.normalizeBulkItem(dto);
      const hasValue = Object.values(row).some((v) => String(v).trim());
      if (!hasValue) {
        skipped += 1;
        continue;
      }
      toInsert.push({ ...row, stationCode });
    }

    if (toInsert.length === 0) {
      return { inserted: 0, skipped, docs: [] as AdvanceContactDocument[] };
    }

    const docs = await this.advanceContactModel.insertMany(toInsert);
    for (const doc of docs) {
      if (doc.signatureUrl?.trim() && doc.airlineRepresentative?.trim()) {
        await this.syncSignatureToRepository(
          doc.airlineRepresentative,
          doc.signatureUrl,
          station,
          actor,
        );
      }
    }

    return { inserted: docs.length, skipped, docs };
  }

  /**
   * Airline representatives surfaced in FHR Main Details (master + names used on
   * flights but not yet saved here).
   */
  async listFhrRepresentatives(
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const docs = await this.advanceContactModel
      .find(
        StationScope.filter(
          { airlineRepresentative: { $exists: true, $nin: [null, ''] } },
          station,
        ),
      )
      .sort({ airlineRepresentative: 1, airline: 1 })
      .exec();

    const master = docs
      .map((doc) => ({
        id: String(doc._id),
        email: String(doc.email ?? '').trim(),
        contact: String(doc.contact ?? '').trim(),
        airline: String(doc.airline ?? '').trim(),
        airlineRepresentative: String(doc.airlineRepresentative ?? '').trim(),
        mobileNo: String(doc.mobileNo ?? '').trim(),
        companyName: String(doc.companyName ?? '').trim(),
        signatureUrl: String(doc.signatureUrl ?? '').trim(),
      }))
      .filter((row) => row.airlineRepresentative);

    const masterKeys = new Set(
      master.map((row) => row.airlineRepresentative.trim().toLowerCase()),
    );

    const fromFlights = await this.mainDetailsModel
      .aggregate<{
        _id: string;
        airlineRepresentative: string;
        airline: string;
        usageCount: number;
      }>([
        {
          $match: {
            airrep: { $type: 'string', $nin: [null, ''] },
          },
        },
        {
          $group: {
            _id: { $toLower: { $trim: { input: '$airrep' } } },
            airlineRepresentative: { $first: '$airrep' },
            airline: { $first: { $ifNull: ['$Airline', ''] } },
            usageCount: { $sum: 1 },
          },
        },
        { $sort: { airlineRepresentative: 1 } },
      ])
      .exec();

    const usedInFhrOnly = fromFlights
      .map((row) => ({
        airlineRepresentative: String(row.airlineRepresentative ?? '').trim(),
        airline: String(row.airline ?? '').trim(),
        usageCount: row.usageCount ?? 0,
      }))
      .filter(
        (row) =>
          row.airlineRepresentative &&
          !masterKeys.has(row.airlineRepresentative.toLowerCase()),
      );

    return { master, usedInFhrOnly };
  }

  async findAll(
    filter?: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    let query: Record<string, unknown> = {};
    if (filter?.trim()) {
      const regex = new RegExp(escapeRegex(filter.trim()), 'i');
      query = {
        $or: [
          { email: regex },
          { contact: regex },
          { airline: regex },
          { airlineRepresentative: regex },
          { mobileNo: regex },
          { weekDay: regex },
          { companyName: regex },
        ],
      };
    }
    return this.advanceContactModel
      .find(StationScope.filter(query, scopeForGatewayRead(station)))
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(
    id: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const doc = await this.advanceContactModel
      .findOne(StationScope.filter({ _id: id }, station))
      .exec();
    if (!doc) {
      throw new NotFoundException('Advance contact not found');
    }
    return doc;
  }

  async update(
    id: string,
    dto: Partial<CreateAdvanceContactDto>,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
    actor?: SignatureActor,
  ) {
    const existing = await this.advanceContactModel
      .findOne(StationScope.filter({ _id: id }, station))
      .exec();
    if (!existing) {
      throw new NotFoundException('Advance contact not found');
    }
    const body = this.normalize(dto);
    const updated = await this.advanceContactModel
      .findByIdAndUpdate(id, body, { new: true })
      .exec();
    if (!updated) {
      throw new NotFoundException('Advance contact not found');
    }
    if (body.signatureUrl !== undefined) {
      await this.syncSignatureToRepository(
        updated.airlineRepresentative,
        body.signatureUrl,
        station,
        actor,
      );
    }
    return updated;
  }

  async remove(
    id: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const deleted = await this.advanceContactModel
      .findOneAndDelete(StationScope.filter({ _id: id }, station))
      .exec();
    if (!deleted) {
      throw new NotFoundException('Advance contact not found');
    }
    return { message: 'Deleted successfully' };
  }

  /** Resolve airline email from Advance → Airline Contact (Gateway contact master). */
  async findEmailByAirlineNameOrCode(
    airlineCode: string,
    airlineName: string,
  ): Promise<string | null> {
    const code = String(airlineCode ?? '').trim();
    const name = String(airlineName ?? '').trim();
    const or: Record<string, unknown>[] = [];
    if (code) {
      or.push({ airline: new RegExp(`^${escapeRegex(code)}$`, 'i') });
    }
    if (name) {
      or.push({ airline: new RegExp(`^${escapeRegex(name)}$`, 'i') });
    }
    if (or.length === 0) return null;
    const doc = await this.advanceContactModel
      .findOne({
        email: { $exists: true, $ne: '' },
        $or: or,
      })
      .sort({ updatedAt: -1 })
      .lean()
      .exec();
    const email = String(doc?.email ?? '')
      .trim()
      .toLowerCase();
    return email || null;
  }
}
