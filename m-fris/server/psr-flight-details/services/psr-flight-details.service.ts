import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  PsrFlightDetails,
  PsrFlightDetailsDocument,
} from '../schema/psr-flight-details.schema';

export type PsrFlightDetailsPayload = {
  flightSerial: string;
  data: Record<string, unknown>;
};

@Injectable()
export class PsrFlightDetailsService {
  constructor(
    @InjectModel(PsrFlightDetails.name)
    private readonly psrFlightDetailsModel: Model<PsrFlightDetailsDocument>,
  ) {}

  async getByFlightSerial(
    flightSerial: string,
  ): Promise<PsrFlightDetailsPayload> {
    const fs = flightSerial.trim();
    const doc = await this.psrFlightDetailsModel
      .findOne({ flightSerial: fs })
      .lean()
      .exec();
    if (!doc) return { flightSerial: fs, data: {} };
    return {
      flightSerial: String(doc.flightSerial ?? '').trim(),
      data:
        doc.data && typeof doc.data === 'object' && !Array.isArray(doc.data)
          ? doc.data
          : {},
    };
  }

  async upsert(dto: PsrFlightDetailsPayload): Promise<PsrFlightDetailsPayload> {
    const flightSerial = dto.flightSerial.trim();
    const data =
      dto.data && typeof dto.data === 'object' && !Array.isArray(dto.data)
        ? dto.data
        : {};

    const updated = await this.psrFlightDetailsModel
      .findOneAndUpdate(
        { flightSerial },
        { $set: { flightSerial, data } },
        { new: true, upsert: true, runValidators: true },
      )
      .lean()
      .exec();

    return {
      flightSerial: String(updated?.flightSerial ?? flightSerial).trim(),
      data:
        updated?.data &&
        typeof updated.data === 'object' &&
        !Array.isArray(updated.data)
          ? updated.data
          : {},
    };
  }
}
