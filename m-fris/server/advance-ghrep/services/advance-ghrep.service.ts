import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AdvanceGhrep,
  AdvanceGhrepDocument,
} from '../schema/advance-ghrep.schema';
import { CreateAdvanceGhrepDto } from '../dto/create-advance-ghrep.dto';
import { UpdateAdvanceGhrepDto } from '../dto/update-advance-ghrep.dto';
import { BulkCreateAdvanceGhrepItemDto } from '../dto/bulk-create-advance-ghrep.dto';
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
export class AdvanceGhrepService {
  constructor(
    @InjectModel(AdvanceGhrep.name)
    private readonly advanceGhrepModel: Model<AdvanceGhrepDocument>,
    private readonly representativeSignatureService: RepresentativeSignatureService,
  ) {}

  private stampStationCode(station: StationScopeContext): string {
    return normalizeStationCode(station.stationCode) ?? LEGACY_STATION_CODE;
  }

  private normalize(dto: CreateAdvanceGhrepDto | UpdateAdvanceGhrepDto) {
    const out: Partial<CreateAdvanceGhrepDto> = {};
    if (dto.employeeName !== undefined) {
      const employeeName = String(dto.employeeName).trim().replace(/\s+/g, ' ');
      if (employeeName && !/^[A-Za-z]+(?: [A-Za-z]+)*$/.test(employeeName)) {
        throw new BadRequestException(
          'Employee name may only contain letters.',
        );
      }
      out.employeeName = employeeName;
    }
    if (dto.employeeCode !== undefined) {
      out.employeeCode = String(dto.employeeCode).trim().toUpperCase();
    }
    if (dto.emailId !== undefined) {
      out.emailId = String(dto.emailId).trim().toLowerCase();
    }
    if (dto.active !== undefined) {
      out.active = dto.active === true;
    }
    if (dto.signatureUrl !== undefined) {
      out.signatureUrl = String(dto.signatureUrl).trim();
    }
    return out;
  }

  private async syncSignatureToRepository(
    employeeName: string,
    signatureUrl: string | undefined,
    station: StationScopeContext,
    actor?: SignatureActor,
  ): Promise<void> {
    if (signatureUrl === undefined || !actor) return;
    const trimmed = String(signatureUrl).trim();
    if (!trimmed || !employeeName.trim()) return;
    await this.representativeSignatureService.upsertByName(
      employeeName.trim(),
      'GH_REPRESENTATIVE',
      trimmed,
      actor,
      this.stampStationCode(station),
    );
  }

  async create(
    dto: CreateAdvanceGhrepDto,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
    actor?: SignatureActor,
  ) {
    const body = this.normalize(dto) as CreateAdvanceGhrepDto;
    if (!body.employeeName || !body.employeeCode || !body.emailId) {
      throw new ConflictException('Employee name, code, and email ID are required');
    }
    const dup = await this.advanceGhrepModel
      .findOne(StationScope.filter({ employeeCode: body.employeeCode }, station))
      .exec();
    if (dup) {
      throw new ConflictException('Employee code already exists');
    }
    const doc = new this.advanceGhrepModel({
      employeeName: body.employeeName,
      employeeCode: body.employeeCode,
      emailId: body.emailId,
      active: body.active !== false,
      signatureUrl: body.signatureUrl ?? '',
      stationCode: this.stampStationCode(station),
    });
    const saved = await doc.save();
    await this.syncSignatureToRepository(
      saved.employeeName,
      body.signatureUrl,
      station,
      actor,
    );
    return saved;
  }

  private normalizeBulkItem(dto: BulkCreateAdvanceGhrepItemDto) {
    const employeeCode = String(dto.employeeCode ?? '').trim().toUpperCase();
    const employeeName = String(dto.employeeName ?? '').trim();
    const rawEmail = String(dto.emailId ?? '').trim().toLowerCase();
    const emailId =
      rawEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail) ? rawEmail : '';
    const signatureUrl = String(dto.signatureUrl ?? '').trim();
    return {
      employeeName,
      employeeCode,
      emailId,
      active: dto.active !== false,
      signatureUrl,
    };
  }

  async createBulk(
    dtos: BulkCreateAdvanceGhrepItemDto[],
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
    actor?: SignatureActor,
  ) {
    if (!Array.isArray(dtos) || dtos.length === 0) {
      return { inserted: 0, skipped: 0, docs: [] as AdvanceGhrepDocument[] };
    }

    const stationCode = this.stampStationCode(station);
    const existing = await this.advanceGhrepModel
      .find(StationScope.filter({}, station))
      .select('employeeCode')
      .lean()
      .exec();
    const existingCodes = new Set(
      existing.map((row) => String(row.employeeCode ?? '').trim().toUpperCase()).filter(Boolean),
    );

    const seenInFile = new Set<string>();
    const toInsert: Array<{
      employeeName: string;
      employeeCode: string;
      emailId: string;
      active: boolean;
      signatureUrl: string;
      stationCode: string;
    }> = [];
    let skipped = 0;

    for (const dto of dtos) {
      const row = this.normalizeBulkItem(dto);
      if (!row.employeeCode) {
        skipped += 1;
        continue;
      }
      if (seenInFile.has(row.employeeCode) || existingCodes.has(row.employeeCode)) {
        skipped += 1;
        continue;
      }
      seenInFile.add(row.employeeCode);
      toInsert.push({ ...row, stationCode });
    }

    if (toInsert.length === 0) {
      return { inserted: 0, skipped, docs: [] as AdvanceGhrepDocument[] };
    }

    const docs = await this.advanceGhrepModel.insertMany(toInsert);
    for (const doc of docs) {
      if (doc.signatureUrl?.trim()) {
        await this.syncSignatureToRepository(
          doc.employeeName,
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
        $or: [{ employeeName: regex }, { employeeCode: regex }, { emailId: regex }],
      };
    }
    return this.advanceGhrepModel
      .find(StationScope.filter(query, station))
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(
    id: string,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const doc = await this.advanceGhrepModel
      .findOne(StationScope.filter({ _id: id }, station))
      .exec();
    if (!doc) {
      throw new NotFoundException('GH representative not found');
    }
    return doc;
  }

  /** Resolve active GH rep email by saved representative name or employee code (case-insensitive). */
  async findActiveEmailByRepresentativeName(
    repName: string,
  ): Promise<string | null> {
    const trimmed = String(repName ?? '').trim();
    if (!trimmed) return null;
    const exact = new RegExp(`^${escapeRegex(trimmed)}$`, 'i');
    const doc = await this.advanceGhrepModel
      .findOne({
        active: { $ne: false },
        $or: [{ employeeName: exact }, { employeeCode: exact }],
      })
      .lean()
      .exec();
    const email = String(doc?.emailId ?? '')
      .trim()
      .toLowerCase();
    return email || null;
  }

  async update(
    id: string,
    dto: UpdateAdvanceGhrepDto,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
    actor?: SignatureActor,
  ) {
    const existing = await this.advanceGhrepModel
      .findOne(StationScope.filter({ _id: id }, station))
      .exec();
    if (!existing) {
      throw new NotFoundException('GH representative not found');
    }
    const body = this.normalize(dto);
    if (body.employeeCode) {
      const dup = await this.advanceGhrepModel
        .findOne(
          StationScope.filter(
            { employeeCode: body.employeeCode, _id: { $ne: id } },
            station,
          ),
        )
        .exec();
      if (dup) {
        throw new ConflictException('Employee code already exists');
      }
    }
    const updated = await this.advanceGhrepModel
      .findByIdAndUpdate(id, body, { new: true })
      .exec();
    if (!updated) {
      throw new NotFoundException('GH representative not found');
    }
    if (body.signatureUrl !== undefined) {
      await this.syncSignatureToRepository(
        updated.employeeName,
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
    const deleted = await this.advanceGhrepModel
      .findOneAndDelete(StationScope.filter({ _id: id }, station))
      .exec();
    if (!deleted) {
      throw new NotFoundException('GH representative not found');
    }
    return { message: 'Deleted successfully' };
  }
}
