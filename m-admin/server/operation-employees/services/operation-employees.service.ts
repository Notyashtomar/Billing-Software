import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  OperationEmployee,
  OperationEmployeeDocument,
} from '../schema/operation-employee.schema';
import { CreateOperationEmployeeDto } from '../dto/create-operation-employee.dto';
import { escapeRegex } from '../../common/escape-regex.util';

@Injectable()
export class OperationEmployeesService {
  constructor(
    @InjectModel(OperationEmployee.name)
    private operationEmployeeModel: Model<OperationEmployeeDocument>,
  ) {}

  async create(dto: CreateOperationEmployeeDto) {
    const doc = new this.operationEmployeeModel(dto);
    return doc.save();
  }

  async createMany(dtos: CreateOperationEmployeeDto[]) {
    try {
      const docs = await this.operationEmployeeModel.insertMany(dtos, {
        ordered: false,
      });
      return {
        insertedCount: docs.length,
        employees: docs,
        errors: [] as { index: number; code?: string; message: string }[],
      };
    } catch (err: unknown) {
      const e = err as {
        insertedDocs?: OperationEmployeeDocument[];
        writeErrors?: { index: number; errmsg?: string }[];
        message?: string;
      };
      const inserted = e.insertedDocs ?? [];
      const writeErrors = (e.writeErrors ?? []).map((w) => ({
        index: w.index,
        message: w.errmsg ?? 'Write error',
      }));
      if (inserted.length === 0 && writeErrors.length === 0) {
        throw err;
      }
      return {
        insertedCount: inserted.length,
        employees: inserted,
        errors: writeErrors,
      };
    }
  }

  async findAll(filter?: string) {
    let query: Record<string, unknown> = {};
    if (filter?.trim()) {
      const regex = new RegExp(escapeRegex(filter.trim()), 'i');
      query = {
        $or: [{ employeeName: regex }, { code: regex }],
      };
    }
    return this.operationEmployeeModel
      .find(query)
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(id: string) {
    const doc = await this.operationEmployeeModel.findById(id).exec();
    if (!doc) {
      throw new NotFoundException('Operation employee not found');
    }
    return doc;
  }

  async update(id: string, dto: Partial<CreateOperationEmployeeDto>) {
    const updated = await this.operationEmployeeModel
      .findByIdAndUpdate(id, dto, { new: true })
      .exec();
    if (!updated) {
      throw new NotFoundException('Operation employee not found');
    }
    return updated;
  }

  async remove(id: string) {
    const deleted = await this.operationEmployeeModel
      .findByIdAndDelete(id)
      .exec();
    if (!deleted) {
      throw new NotFoundException('Operation employee not found');
    }
    return { message: 'Deleted successfully' };
  }
}
