import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  PaxDutyAllocation,
  PaxDutyAllocationDocument,
} from '../schema/pax-duty-allocation.schema';
import { CreatePaxDutyAllocationDto } from '../dto/create-pax-duty-allocation.dto';

@Injectable()
export class PaxDutyAllocationService {
  constructor(
    @InjectModel(PaxDutyAllocation.name)
    private readonly model: Model<PaxDutyAllocationDocument>,
  ) {}

  async create(dto: CreatePaxDutyAllocationDto) {
    const doc = new this.model({
      date: dto.date.trim(),
      shift: dto.shift ?? '',
      flight: dto.flight ?? '',
      flightNo: dto.flightNo ?? '',
      staffAssignments: (dto.staffAssignments ?? []).map((a) => ({
        staff: (a.staff ?? '').trim(),
        employeeCode: (a.employeeCode ?? '').trim(),
        employeeName: (a.employeeName ?? '').trim(),
        dutyAllocations: Array.isArray(a.dutyAllocations)
          ? a.dutyAllocations.map((d) => String(d).trim()).filter(Boolean)
          : [],
      })),
    });
    return doc.save();
  }

  async findInDateRange(fromYmd: string, toYmd: string) {
    const from = fromYmd.trim();
    const to = toYmd.trim();
    return this.model
      .find({ date: { $gte: from, $lte: to } })
      .sort({ date: -1, updatedAt: -1 })
      .lean()
      .exec();
  }

  async findOne(id: string) {
    const doc = await this.model.findById(id).lean().exec();
    if (!doc) throw new NotFoundException('Pax duty allocation not found');
    return doc;
  }

  async update(id: string, dto: CreatePaxDutyAllocationDto) {
    const updated = await this.model
      .findByIdAndUpdate(
        id,
        {
          $set: {
            date: dto.date.trim(),
            shift: dto.shift ?? '',
            flight: dto.flight ?? '',
            flightNo: dto.flightNo ?? '',
            staffAssignments: (dto.staffAssignments ?? []).map((a) => ({
              staff: (a.staff ?? '').trim(),
              employeeCode: (a.employeeCode ?? '').trim(),
              employeeName: (a.employeeName ?? '').trim(),
              dutyAllocations: Array.isArray(a.dutyAllocations)
                ? a.dutyAllocations.map((d) => String(d).trim()).filter(Boolean)
                : [],
            })),
          },
        },
        { new: true, runValidators: true },
      )
      .lean()
      .exec();
    if (!updated) throw new NotFoundException('Pax duty allocation not found');
    return updated;
  }

  async remove(id: string) {
    const deleted = await this.model.findByIdAndDelete(id).exec();
    if (!deleted) throw new NotFoundException('Pax duty allocation not found');
    return { message: 'Deleted successfully' };
  }
}
