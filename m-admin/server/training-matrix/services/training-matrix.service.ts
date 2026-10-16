import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { escapeRegex } from '../../common/escape-regex.util';
import { CreateTrainingMatrixDto } from '../dto/create-training-matrix.dto';
import {
  TrainingMatrix,
  TrainingMatrixDocument,
} from '../schema/training-matrix.schema';

function uniqueStationIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    const trimmed = id.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

@Injectable()
export class TrainingMatrixService {
  constructor(
    @InjectModel(TrainingMatrix.name)
    private trainingMatrixModel: Model<TrainingMatrixDocument>,
  ) {}

  async create(dto: CreateTrainingMatrixDto) {
    const stationIds = uniqueStationIds(dto.stationIds);
    if (stationIds.length === 0) {
      throw new BadRequestException('Select at least one station.');
    }

    const doc = new this.trainingMatrixModel({
      stationIds,
      name: dto.name.trim(),
      minPassPercent: dto.minPassPercent ?? null,
      frequencyMonths: dto.frequencyMonths ?? null,
      departments: dto.departments,
      note: dto.note?.trim() ?? '',
    });
    return doc.save();
  }

  async findAll(filter?: string) {
    let query: Record<string, unknown> = {};
    if (filter?.trim()) {
      const regex = new RegExp(escapeRegex(filter.trim()), 'i');
      query = {
        $or: [{ name: regex }, { note: regex }, { departments: regex }],
      };
    }

    return this.trainingMatrixModel
      .find(query)
      .sort({ createdAt: 1, name: 1 })
      .exec();
  }

  async findOne(id: string) {
    const doc = await this.trainingMatrixModel.findById(id).exec();
    if (!doc) {
      throw new NotFoundException('Training not found');
    }
    return doc;
  }

  async update(id: string, dto: Partial<CreateTrainingMatrixDto>) {
    const payload: Partial<TrainingMatrix> = {};

    let clearLegacyStation = false;
    if (dto.stationIds !== undefined) {
      const stationIds = uniqueStationIds(dto.stationIds);
      if (stationIds.length === 0) {
        throw new BadRequestException('Select at least one station.');
      }
      payload.stationIds = stationIds;
      clearLegacyStation = true;
    }
    if (dto.name !== undefined) payload.name = dto.name.trim();
    if (dto.minPassPercent !== undefined) payload.minPassPercent = dto.minPassPercent;
    if (dto.frequencyMonths !== undefined) payload.frequencyMonths = dto.frequencyMonths;
    if (dto.departments !== undefined) payload.departments = dto.departments;
    if (dto.note !== undefined) payload.note = dto.note.trim();

    const updated = await this.trainingMatrixModel
      .findByIdAndUpdate(
        id,
        clearLegacyStation ? { $set: payload, $unset: { stationId: 1 } } : payload,
        { new: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('Training not found');
    }

    return updated;
  }

  async remove(id: string) {
    const deleted = await this.trainingMatrixModel.findByIdAndDelete(id).exec();
    if (!deleted) {
      throw new NotFoundException('Training not found');
    }
    return { message: 'Deleted successfully' };
  }
}
