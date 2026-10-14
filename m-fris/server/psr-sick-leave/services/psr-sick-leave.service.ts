import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  PsrSickLeave,
  PsrSickLeaveDocument,
} from '../schema/psr-sick-leave.schema';
import { PsrSickLeaveRowDto } from '../dto/upsert-psr-sick-leave.dto';

export type PsrSickLeavePayload = {
  flightSerial: string;
  rows: PsrSickLeaveRowDto[];
};

@Injectable()
export class PsrSickLeaveService {
  constructor(
    @InjectModel(PsrSickLeave.name)
    private readonly psrSickLeaveModel: Model<PsrSickLeaveDocument>,
  ) {}

  async getByFlightSerial(flightSerial: string): Promise<PsrSickLeavePayload> {
    const fs = flightSerial.trim();
    const doc = await this.psrSickLeaveModel
      .findOne({ flightSerial: fs })
      .lean()
      .exec();
    if (!doc) return { flightSerial: fs, rows: [] };
    return {
      flightSerial: String(doc.flightSerial ?? '').trim(),
      rows: (doc.rows ?? []).map((r) => ({
        id: String(r.id ?? '').trim(),
        employeeCode: String(r.employeeCode ?? '').trim(),
        employeeName: String(r.employeeName ?? '').trim(),
      })),
    };
  }

  async upsert(dto: PsrSickLeavePayload): Promise<PsrSickLeavePayload> {
    const flightSerial = dto.flightSerial.trim();
    const rows = Array.isArray(dto.rows)
      ? dto.rows.map((r) => ({
          id: String(r.id ?? '').trim(),
          employeeCode: String(r.employeeCode ?? '').trim(),
          employeeName: String(r.employeeName ?? '').trim(),
        }))
      : [];

    const updated = await this.psrSickLeaveModel
      .findOneAndUpdate(
        { flightSerial },
        { $set: { flightSerial, rows } },
        { new: true, upsert: true, runValidators: true },
      )
      .lean()
      .exec();

    return {
      flightSerial: String(updated?.flightSerial ?? flightSerial).trim(),
      rows: (updated?.rows ?? rows).map((r) => ({
        id: String(r.id ?? '').trim(),
        employeeCode: String(r.employeeCode ?? '').trim(),
        employeeName: String(r.employeeName ?? '').trim(),
      })),
    };
  }
}
