import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  EquipmentDetails,
  EquipmentDetailsDocument,
} from '../schema/equipment-details.schema';
import { CreateEquipmentDetailsDto } from '../dto/create-equipment-details.dto';
import {
  StationScope,
  type StationScopeContext,
} from '../../common/station/station-scope';

@Injectable()
export class EquipmentDetailsService {
  constructor(
    @InjectModel(EquipmentDetails.name)
    private equipmentDetailsModel: Model<EquipmentDetailsDocument>,
  ) {}

  // 🔥 Helper: Calculate Engage Time
  private calculateEngageTime(
    fromdate?: string,
    fromtime?: string,
    todate?: string,
    totime?: string,
  ): string {
    if (!fromdate || !fromtime || !todate || !totime) {
      return '';
    }

    const formatDate = (dateStr: string) => {
      const [dd, mm, yyyy] = dateStr.split('-');
      return `${yyyy}-${mm}-${dd}`;
    };

    const start = new Date(`${formatDate(fromdate)}T${fromtime}:00`);
    const end = new Date(`${formatDate(todate)}T${totime}:00`);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return '';
    }

    const diffMs = end.getTime() - start.getTime();

    if (diffMs <= 0) return '0h 0m';

    const totalMinutes = Math.floor(diffMs / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return `${hours}h ${minutes}m`;
  }

  // ✅ CREATE (Auto calculate)
  async create(dto: CreateEquipmentDetailsDto, station: StationScopeContext) {
    const stationCode = StationScope.require(station);
    const calculatedTime = this.calculateEngageTime(
      dto.fromdate,
      dto.fromtime,
      dto.todate,
      dto.totime,
    );

    const { stationCode: _ignored, ...payload } = dto as unknown as Record<
      string,
      unknown
    >;
    const doc = new this.equipmentDetailsModel({
      ...payload,
      engagetime: calculatedTime, // always backend-generated
      stationCode,
    });

    return doc.save();
  }

  // ✅ GET ALL
  async findAll(station: StationScopeContext) {
    return this.equipmentDetailsModel
      .find(StationScope.filter({}, station))
      .sort({ createdAt: -1 })
      .exec();
  }

  // ✅ GET ONE
  async findOne(id: string, station: StationScopeContext) {
    const doc = await this.equipmentDetailsModel
      .findOne(StationScope.filter({ _id: id }, station))
      .exec();
    if (!doc) {
      throw new NotFoundException('Equipment details not found');
    }
    return doc;
  }

  // ✅ UPDATE (Always recalculate)
  async update(
    id: string,
    dto: Partial<CreateEquipmentDetailsDto>,
    station: StationScopeContext,
  ) {
    const existing = await this.equipmentDetailsModel.findOne(
      StationScope.filter({ _id: id }, station),
    );

    if (!existing) {
      throw new NotFoundException('Equipment details not found');
    }

    // Use updated values if provided, else existing values
    const fromdate = dto.fromdate ?? existing.fromdate;
    const fromtime = dto.fromtime ?? existing.fromtime;
    const todate = dto.todate ?? existing.todate;
    const totime = dto.totime ?? existing.totime;

    const calculatedTime = this.calculateEngageTime(
      fromdate,
      fromtime,
      todate,
      totime,
    );

    const { stationCode: _ignored, ...payload } = dto as unknown as Record<
      string,
      unknown
    >;
    const updated = await this.equipmentDetailsModel.findOneAndUpdate(
      StationScope.filter({ _id: id }, station),
      {
        ...payload,
        engagetime: calculatedTime, // always override
      },
      { new: true },
    );

    return updated;
  }

  // ✅ DELETE
  async remove(id: string, station: StationScopeContext) {
    const deleted = await this.equipmentDetailsModel
      .findOneAndDelete(StationScope.filter({ _id: id }, station))
      .exec();

    if (!deleted) {
      throw new NotFoundException('Equipment details not found');
    }

    return { message: 'Deleted successfully' };
  }
}
