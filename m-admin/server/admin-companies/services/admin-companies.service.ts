import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AdminCompany,
  AdminCompanyDocument,
} from '../schema/admin-company.schema';

@Injectable()
export class AdminCompaniesService {
  constructor(
    @InjectModel(AdminCompany.name)
    private companyModel: Model<AdminCompanyDocument>,
  ) {}

  async listOptions() {
    const rows = await this.companyModel
      .find({ status: { $in: ['Active', 'active'] } })
      .select('name sortOrder')
      .sort({ sortOrder: 1, name: 1 })
      .lean()
      .exec();

    return rows.map((row) => ({
      name: String(row.name ?? '').trim(),
      sortOrder: Number(row.sortOrder ?? 0),
    }));
  }
}
