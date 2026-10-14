import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Report, ReportDocument } from '../schema/reports.schema';
import { CreateReportDto } from '../dto/create-report.dto';

@Injectable()
export class ReportsService {
  constructor(
    @InjectModel(Report.name) private reportModel: Model<ReportDocument>,
  ) {}

  async create(dto: CreateReportDto) {
    const doc = new this.reportModel(dto);
    return doc.save();
  }

  async findAll() {
    return this.reportModel.find().sort({ serialNo: -1, createdAt: -1 }).limit(100).lean().exec();
  }

  async findOne(id: string) {
    return this.reportModel.findById(id).exec();
  }

  async findBySerialNo(serialNo: number) {
    return this.reportModel.find({ serialNo }).sort({ createdAt: -1 }).exec();
  }

  async findBySerialNoAndType(serialNo: number, reportType: string) {
    return this.reportModel.findOne({ serialNo, reportType }).exec();
  }

  async update(id: string, dto: Partial<CreateReportDto>) {
    return this.reportModel.findByIdAndUpdate(id, dto, { new: true }).exec();
  }

  async clearSignature(
    serialNo: number,
    reportType: string,
    clearedBy: string,
    timestamp?: string,
  ) {
    const doc = await this.reportModel.findOne({ serialNo, reportType }).exec();
    if (!doc) {
      return this.reportModel.create({
        serialNo,
        reportType,
        signatureCleared: true,
        signatureClearedAt: timestamp || new Date().toISOString(),
        signatureClearedBy: clearedBy,
      });
    }
    doc.signatureCleared = true;
    doc.signatureClearedAt = timestamp || new Date().toISOString();
    doc.signatureClearedBy = clearedBy;
    return doc.save();
  }

  async remove(id: string) {
    return this.reportModel.findByIdAndDelete(id).exec();
  }
}
