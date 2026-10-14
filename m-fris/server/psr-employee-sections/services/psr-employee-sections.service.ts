import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  PsrEmployeeSection,
  PsrEmployeeSectionDocument,
} from '../schema/psr-employee-section.schema';
import { PsrEmployeeSectionRowDto } from '../dto/upsert-psr-employee-section.dto';

export type PsrEmployeeSectionPayload = {
  flightSerial: string;
  section: string;
  rows: PsrEmployeeSectionRowDto[];
};

@Injectable()
export class PsrEmployeeSectionsService {
  constructor(
    @InjectModel(PsrEmployeeSection.name)
    private readonly psrEmployeeSectionsModel: Model<PsrEmployeeSectionDocument>,
  ) {}

  async getByFlightSerialAndSection(
    flightSerial: string,
    section: string,
  ): Promise<PsrEmployeeSectionPayload> {
    const fs = flightSerial.trim();
    const sec = section.trim();
    const doc = await this.psrEmployeeSectionsModel
      .findOne({ flightSerial: fs, section: sec })
      .lean()
      .exec();
    if (!doc) return { flightSerial: fs, section: sec, rows: [] };
    return {
      flightSerial: String(doc.flightSerial ?? '').trim(),
      section: String(doc.section ?? '').trim(),
      rows: (doc.rows ?? []).map((r) => ({
        id: String(r.id ?? '').trim(),
        employeeCode: String(r.employeeCode ?? '').trim(),
        employeeName: String(r.employeeName ?? '').trim(),
      })),
    };
  }

  async upsert(
    dto: PsrEmployeeSectionPayload,
  ): Promise<PsrEmployeeSectionPayload> {
    const flightSerial = dto.flightSerial.trim();
    const section = dto.section.trim();
    const rows = Array.isArray(dto.rows)
      ? dto.rows.map((r) => ({
          id: String(r.id ?? '').trim(),
          employeeCode: String(r.employeeCode ?? '').trim(),
          employeeName: String(r.employeeName ?? '').trim(),
        }))
      : [];

    const updated = await this.psrEmployeeSectionsModel
      .findOneAndUpdate(
        { flightSerial, section },
        { $set: { flightSerial, section, rows } },
        { new: true, upsert: true, runValidators: true },
      )
      .lean()
      .exec();

    return {
      flightSerial: String(updated?.flightSerial ?? flightSerial).trim(),
      section: String(updated?.section ?? section).trim(),
      rows: (updated?.rows ?? rows).map((r) => ({
        id: String(r.id ?? '').trim(),
        employeeCode: String(r.employeeCode ?? '').trim(),
        employeeName: String(r.employeeName ?? '').trim(),
      })),
    };
  }
}
