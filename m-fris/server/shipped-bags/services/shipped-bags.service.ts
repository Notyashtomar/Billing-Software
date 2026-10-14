import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ShippedBag, ShippedBagDocument } from '../schema/shipped-bag.schema';
import { ShippedBagRowDto } from '../dto/upsert-shipped-bags.dto';

export type ShippedBagPayload = {
  flightSerial: string;
  noOfBags: string;
  rows: ShippedBagRowDto[];
};

@Injectable()
export class ShippedBagsService {
  constructor(
    @InjectModel(ShippedBag.name)
    private readonly shippedBagModel: Model<ShippedBagDocument>,
  ) {}

  async findAll(): Promise<ShippedBagPayload[]> {
    const docs = await this.shippedBagModel
      .find({})
      .sort({ updatedAt: -1 })
      .lean()
      .exec();
    return docs.map((doc) => ({
      flightSerial: String(doc.flightSerial ?? '').trim(),
      noOfBags: doc.noOfBags ?? '',
      rows: (doc.rows ?? []).map((r) => ({
        id: r.id,
        optionSection: r.optionSection ?? '',
        remarks: r.remarks ?? '',
      })),
    }));
  }

  async getByFlightSerial(flightSerial: string): Promise<ShippedBagPayload> {
    const fs = flightSerial.trim();
    const doc = await this.shippedBagModel
      .findOne({ flightSerial: fs })
      .lean()
      .exec();
    if (!doc) {
      return { flightSerial: fs, noOfBags: '', rows: [] };
    }
    return {
      flightSerial: doc.flightSerial,
      noOfBags: doc.noOfBags ?? '',
      rows: (doc.rows ?? []).map((r) => ({
        id: r.id,
        optionSection: r.optionSection ?? '',
        remarks: r.remarks ?? '',
      })),
    };
  }

  /**
   * Returns one payload per requested serial (empty payload if no document).
   * Keys are trimmed serial strings from the request.
   */
  async getByFlightSerials(
    flightSerials: string[],
  ): Promise<Record<string, ShippedBagPayload>> {
    const cleaned = [
      ...new Set(
        flightSerials.map((s) => String(s ?? '').trim()).filter(Boolean),
      ),
    ];
    const out: Record<string, ShippedBagPayload> = {};
    for (const fs of cleaned) {
      out[fs] = { flightSerial: fs, noOfBags: '', rows: [] };
    }
    if (cleaned.length === 0) return out;

    const docs = await this.shippedBagModel
      .find({ flightSerial: { $in: cleaned } })
      .lean()
      .exec();

    for (const doc of docs) {
      const fs = String(doc.flightSerial ?? '').trim();
      if (!fs || !out[fs]) continue;
      out[fs] = {
        flightSerial: fs,
        noOfBags: doc.noOfBags ?? '',
        rows: (doc.rows ?? []).map((r) => ({
          id: r.id,
          optionSection: r.optionSection ?? '',
          remarks: r.remarks ?? '',
        })),
      };
    }
    return out;
  }

  async upsert(dto: ShippedBagPayload) {
    const flightSerial = dto.flightSerial.trim();
    const noOfBags = dto.noOfBags ?? '';
    const rows = Array.isArray(dto.rows) ? dto.rows : [];
    const updated = await this.shippedBagModel
      .findOneAndUpdate(
        { flightSerial },
        { $set: { flightSerial, noOfBags, rows } },
        { new: true, upsert: true, runValidators: true },
      )
      .lean()
      .exec();
    return {
      flightSerial: updated?.flightSerial ?? flightSerial,
      noOfBags: updated?.noOfBags ?? noOfBags,
      rows: (updated?.rows ?? rows).map((r) => ({
        id: r.id,
        optionSection: r.optionSection ?? '',
        remarks: r.remarks ?? '',
      })),
    };
  }
}
