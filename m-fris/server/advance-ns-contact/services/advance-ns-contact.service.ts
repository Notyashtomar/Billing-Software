import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AdvanceNsContact,
  AdvanceNsContactDocument,
} from '../schema/advance-ns-contact.schema';
import { CreateAdvanceNsContactDto } from '../dto/create-advance-ns-contact.dto';
import { BulkCreateAdvanceNsContactItemDto } from '../dto/bulk-create-advance-ns-contact.dto';
import { escapeRegex } from '../../common/escape-regex.util';
import {
  CROSS_STATION_SYSTEM_SCOPE,
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
export class AdvanceNsContactService {
  constructor(
    @InjectModel(AdvanceNsContact.name)
    private advanceNsContactModel: Model<AdvanceNsContactDocument>,
    private readonly representativeSignatureService: RepresentativeSignatureService,
  ) {}

  private stampStationCode(station: StationScopeContext): string {
    return normalizeStationCode(station.stationCode) ?? LEGACY_STATION_CODE;
  }

  private normalize(
    dto: CreateAdvanceNsContactDto | Partial<CreateAdvanceNsContactDto>,
  ) {
    const out: Partial<CreateAdvanceNsContactDto> = {};
    if (dto.email !== undefined) out.email = String(dto.email).trim().toLowerCase();
    if (dto.contact !== undefined) out.contact = String(dto.contact).trim();
    if (dto.airline !== undefined) out.airline = String(dto.airline).trim();
    if (dto.airlineRepresentative !== undefined) {
      out.airlineRepresentative = String(dto.airlineRepresentative).trim();
    }
    if (dto.mobileNo !== undefined) out.mobileNo = String(dto.mobileNo).trim();
    if (dto.weekDay !== undefined) out.weekDay = String(dto.weekDay).trim();
    if (dto.companyName !== undefined) {
      out.companyName = String(dto.companyName).trim();
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
    dto: CreateAdvanceNsContactDto,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
    actor?: SignatureActor,
  ) {
    const body = this.normalize(dto);
    const doc = new this.advanceNsContactModel({
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

  private normalizeBulkItem(dto: BulkCreateAdvanceNsContactItemDto) {
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
    dtos: BulkCreateAdvanceNsContactItemDto[],
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
    actor?: SignatureActor,
  ) {
    if (!Array.isArray(dtos) || dtos.length === 0) {
      return { inserted: 0, skipped: 0, docs: [] as AdvanceNsContactDocument[] };
    }

    const stationCode = this.stampStationCode(station);
    const toInsert: Array<
      ReturnType<AdvanceNsContactService['normalizeBulkItem']> & {
        stationCode: string;
      }
    > = [];
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
      return { inserted: 0, skipped, docs: [] as AdvanceNsContactDocument[] };
    }

    const docs = await this.advanceNsContactModel.insertMany(toInsert);
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
    return this.advanceNsContactModel
      .find(StationScope.filter(query, station))
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(
    id: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const doc = await this.advanceNsContactModel
      .findOne(StationScope.filter({ _id: id }, station))
      .exec();
    if (!doc) {
      throw new NotFoundException('Non-scheduled advance contact not found');
    }
    return doc;
  }

  async update(
    id: string,
    dto: Partial<CreateAdvanceNsContactDto>,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
    actor?: SignatureActor,
  ) {
    const existing = await this.advanceNsContactModel
      .findOne(StationScope.filter({ _id: id }, station))
      .exec();
    if (!existing) {
      throw new NotFoundException('Non-scheduled advance contact not found');
    }
    const body = this.normalize(dto);
    const updated = await this.advanceNsContactModel
      .findByIdAndUpdate(id, body, { new: true })
      .exec();
    if (!updated) {
      throw new NotFoundException('Non-scheduled advance contact not found');
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
    const deleted = await this.advanceNsContactModel
      .findOneAndDelete(StationScope.filter({ _id: id }, station))
      .exec();
    if (!deleted) {
      throw new NotFoundException('Non-scheduled advance contact not found');
    }
    return { message: 'Deleted successfully' };
  }
}
