import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { StationScope } from '../common/station-scope';
import type { StationScopeContext } from '../common/station-scope';
import type { BillingActor } from './billing-customers.service';
import {
  BillingPreparationPresence,
  type BillingPreparationPresenceDocument,
} from '../schemas/billing-preparation-presence.schema';
import { successResponse } from '../common/billing-response.util';

const PRESENCE_TTL_MS = 45_000;
const MAX_FLIGHT_KEYS = 500;
const MAX_INTERESTS = 20;

export type PreparationPresenceInterest = {
  customerCode: string;
  category: 'BHS' | 'ADS';
  flightKeys: string[];
};

export type PreparationPresencePeer = {
  userId: string;
  userName: string;
  customerCode: string;
  category: 'BHS' | 'ADS';
  overlappingFlightKeys: string[];
  lastSeenAt: string;
};

@Injectable()
export class BillingPreparationPresenceService {
  constructor(
    @InjectModel(BillingPreparationPresence.name)
    private readonly presenceModel: Model<BillingPreparationPresenceDocument>,
  ) {}

  async heartbeat(
    ctx: StationScopeContext,
    actor: BillingActor,
    body: {
      sessionId: string;
      periodFrom?: string;
      periodTo?: string;
      interests?: PreparationPresenceInterest[];
    },
  ) {
    const stationCode = StationScope.require(ctx);
    const sessionId = String(body.sessionId ?? '').trim();
    if (!sessionId) {
      return successResponse({ conflicts: [] as PreparationPresencePeer[] });
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + PRESENCE_TTL_MS);
    const periodFrom = body.periodFrom?.trim() || undefined;
    const periodTo = body.periodTo?.trim() || undefined;

    const interests = this.normalizeInterests(body.interests ?? []);
    const keepKeys = new Set(
      interests.map((i) => `${i.customerCode}|${i.category}`),
    );

    // Drop stale interests for this browser tab (selection changed).
    const existing = await this.presenceModel
      .find({ stationCode, sessionId })
      .select('customerCode category')
      .lean();
    const staleIds = existing
      .filter(
        (doc) =>
          !keepKeys.has(
            `${String(doc.customerCode).toUpperCase()}|${String(doc.category).toUpperCase()}`,
          ),
      )
      .map((doc) => doc._id);
    if (staleIds.length > 0) {
      await this.presenceModel.deleteMany({ _id: { $in: staleIds } });
    }

    if (interests.length === 0) {
      await this.presenceModel.deleteMany({ stationCode, sessionId });
      return successResponse({ conflicts: [] as PreparationPresencePeer[] });
    }

    await Promise.all(
      interests.map((interest) =>
        this.presenceModel
          .findOneAndUpdate(
            {
              stationCode,
              sessionId,
              customerCode: interest.customerCode,
              category: interest.category,
            },
            {
              $set: {
                stationCode,
                sessionId,
                userId: actor.userId,
                userName: actor.userName || actor.userId,
                customerCode: interest.customerCode,
                category: interest.category,
                flightKeys: interest.flightKeys,
                periodFrom,
                periodTo,
                lastSeenAt: now,
                expiresAt,
              },
            },
            { upsert: true, new: true },
          )
          .exec(),
      ),
    );

    const conflicts = await this.findConflicts(
      stationCode,
      sessionId,
      interests,
      periodFrom,
      periodTo,
    );
    return successResponse({ conflicts });
  }

  async clearSession(ctx: StationScopeContext, sessionId: string) {
    const stationCode = StationScope.require(ctx);
    const id = String(sessionId ?? '').trim();
    if (!id) return successResponse({ cleared: 0 });
    const result = await this.presenceModel.deleteMany({
      stationCode,
      sessionId: id,
    });
    return successResponse({ cleared: result.deletedCount ?? 0 });
  }

  private normalizeInterests(
    raw: PreparationPresenceInterest[],
  ): PreparationPresenceInterest[] {
    const byKey = new Map<string, PreparationPresenceInterest>();
    for (const item of raw.slice(0, MAX_INTERESTS)) {
      const customerCode = String(item.customerCode ?? '')
        .trim()
        .toUpperCase();
      const categoryRaw = String(item.category ?? '')
        .trim()
        .toUpperCase();
      if (!customerCode || (categoryRaw !== 'BHS' && categoryRaw !== 'ADS')) {
        continue;
      }
      const category = categoryRaw as 'BHS' | 'ADS';
      const flightKeys = [
        ...new Set(
          (item.flightKeys ?? [])
            .map((k) => String(k ?? '').trim())
            .filter(Boolean),
        ),
      ].slice(0, MAX_FLIGHT_KEYS);
      if (flightKeys.length === 0) continue;
      const key = `${customerCode}|${category}`;
      const prev = byKey.get(key);
      if (prev) {
        byKey.set(key, {
          customerCode,
          category,
          flightKeys: [
            ...new Set([...prev.flightKeys, ...flightKeys]),
          ].slice(0, MAX_FLIGHT_KEYS),
        });
      } else {
        byKey.set(key, { customerCode, category, flightKeys });
      }
    }
    return [...byKey.values()];
  }

  private async findConflicts(
    stationCode: string,
    sessionId: string,
    interests: PreparationPresenceInterest[],
    periodFrom?: string,
    periodTo?: string,
  ): Promise<PreparationPresencePeer[]> {
    const now = new Date();
    const peers: PreparationPresencePeer[] = [];
    const seen = new Set<string>();

    for (const interest of interests) {
      const candidates = await this.presenceModel
        .find({
          stationCode,
          sessionId: { $ne: sessionId },
          customerCode: interest.customerCode,
          category: interest.category,
          expiresAt: { $gt: now },
          flightKeys: { $in: interest.flightKeys },
        })
        .lean();

      for (const doc of candidates) {
        if (
          periodFrom &&
          periodTo &&
          doc.periodFrom &&
          doc.periodTo &&
          !periodsOverlap(periodFrom, periodTo, doc.periodFrom, doc.periodTo)
        ) {
          continue;
        }
        const theirKeys = new Set(doc.flightKeys ?? []);
        const overlappingFlightKeys = interest.flightKeys.filter((k) =>
          theirKeys.has(k),
        );
        if (overlappingFlightKeys.length === 0) continue;
        const fingerprint = [
          doc.userId,
          doc.customerCode,
          doc.category,
          overlappingFlightKeys.slice().sort().join(','),
        ].join('|');
        if (seen.has(fingerprint)) continue;
        seen.add(fingerprint);
        peers.push({
          userId: String(doc.userId),
          userName: String(doc.userName || doc.userId),
          customerCode: String(doc.customerCode),
          category: doc.category as 'BHS' | 'ADS',
          overlappingFlightKeys,
          lastSeenAt: new Date(doc.lastSeenAt).toISOString(),
        });
      }
    }

    return peers;
  }
}

function periodsOverlap(
  aFrom: string,
  aTo: string,
  bFrom: string,
  bTo: string,
): boolean {
  return aFrom <= bTo && bFrom <= aTo;
}
