import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Manifest, ManifestDocument } from '../schema/manifest.schema';
import { CreateManifestDto } from '../dto/create-manifest.dto';
import {
  StationScope,
  type StationScopeContext,
} from '../../common/station';

@Injectable()
export class ManifestService {
  constructor(
    @InjectModel(Manifest.name)
    private manifestModel: Model<ManifestDocument>,
  ) {}

  async findBySerial(serial: number, station: StationScopeContext) {
    return this.manifestModel
      .findOne(StationScope.filter({ serialNo: serial }, station))
      .exec();
  }

  async upsertBySerial(
    serial: number,
    dto: CreateManifestDto,
    station: StationScopeContext,
  ) {
    const stationCode = StationScope.require(station);
    // Strip any client-supplied stationCode; derive it from the session.
    const { stationCode: _ignored, ...payload } = dto as Record<
      string,
      unknown
    >;
    const updated = await this.manifestModel.findOneAndUpdate(
      { serialNo: serial, stationCode },
      {
        $set: { ...payload, serialNo: serial },
        $setOnInsert: { stationCode },
      },
      { new: true, upsert: true },
    );
    return updated;
  }

  async updateBySerial(
    serial: number,
    dto: Partial<CreateManifestDto>,
    station: StationScopeContext,
  ) {
    const { stationCode: _ignored, ...payload } = dto as Record<
      string,
      unknown
    >;
    const updated = await this.manifestModel.findOneAndUpdate(
      StationScope.filter({ serialNo: serial }, station),
      payload,
      { new: true },
    );
    if (!updated) {
      throw new NotFoundException('Manifest not found');
    }
    return updated;
  }

  async deleteBySerial(serial: number, station: StationScopeContext) {
    const deleted = await this.manifestModel.findOneAndDelete(
      StationScope.filter({ serialNo: serial }, station),
    );
    if (!deleted) {
      throw new NotFoundException('Manifest not found');
    }
    return { success: true, message: 'Deleted successfully' };
  }

  async findAll(station: StationScopeContext) {
    return this.manifestModel.find(StationScope.filter({}, station)).exec();
  }
}
