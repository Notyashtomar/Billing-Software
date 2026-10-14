import { Types } from 'mongoose';
import {
  buildPreparationAggregateMetadata,
  isBillingActivityAllowed,
  mapBillingAuditToActivity,
  preparationActivitySample,
  preparationActivityTab,
} from './billing-audit-activity.util';

const base = {
  entityId: new Types.ObjectId(),
  userId: new Types.ObjectId().toString(),
  userName: 'Finance User',
  stationCode: 'MAA',
};

describe('billing audit activity bridge helpers', () => {
  it('allows selected mutations and suppresses noisy updates', () => {
    expect(
      isBillingActivityAllowed({
        ...base,
        entityType: 'invoice',
        action: 'posted',
      }),
    ).toBe(true);
    expect(
      isBillingActivityAllowed({
        ...base,
        entityType: 'invoice',
        action: 'updated',
      }),
    ).toBe(false);
    expect(
      isBillingActivityAllowed({
        ...base,
        entityType: 'customer',
        action: 'updated',
        changes: { syncFromAdvanceAirline: { updated: 10 } },
      }),
    ).toBe(false);
  });

  it('maps explicit rich actor context', () => {
    const event = mapBillingAuditToActivity({
      ...base,
      entityType: 'contract',
      action: 'approved',
      actor: {
        userId: base.userId,
        userName: 'Finance User',
        loginId: 'EMP-7',
        userEmail: 'finance@example.com',
        role: 'manager',
        accountType: 'user',
        stationId: 'station-id',
        stationCode: 'MAA',
        ipAddress: '203.0.113.7',
        userAgent: 'test-agent',
        requestId: 'req-1',
        correlationId: 'corr-1',
      },
    });

    expect(event).toMatchObject({
      module: 'Billing',
      page: 'Contract',
      entityType: 'contract',
      accountType: 'user',
      actorRole: 'manager',
      userEmail: 'finance@example.com',
      stationId: 'station-id',
      ipAddress: '203.0.113.7',
      requestId: 'req-1',
      correlationId: 'corr-1',
    });
  });

  it('builds bounded-record fields from pre-delete data', () => {
    expect(
      preparationActivitySample({
        _id: 'prep-1',
        sourceRef: { serialNo: '123', flightNo: '6E123' },
        customerCode: '6E',
        sourceType: 'scheduled_flight',
        status: 'pending',
        operationalSnapshot: {
          staDate: '2026-07-19T10:00:00Z',
          route: 'MAA-DEL',
        },
      }),
    ).toEqual({
      id: 'prep-1',
      serial: '123',
      airlineCustomer: '6E',
      flightNumber: '6E123',
      flightDateTime: '2026-07-19T10:00:00Z',
      route: 'MAA-DEL',
      sourceType: 'scheduled_flight',
      priorStatus: 'pending',
    });
  });

  it('builds structured partial metadata with capped samples and failures', () => {
    const affected = Array.from({ length: 30 }, (_, index) => ({
      _id: `prep-${index}`,
      sourceRef: { serialNo: String(index) },
      customerCode: index % 2 === 0 ? '6E' : 'AI',
      sourceType: 'scheduled_flight',
      status: index === 0 ? 'validation_error' : 'pending',
    }));
    const failures = Array.from({ length: 27 }, (_, index) => ({
      id: `failed-${index}`,
      reason: 'Not found',
    }));
    const tab = preparationActivityTab(affected);
    const metadata = buildPreparationAggregateMetadata({
      affected,
      failures,
      counts: {
        requested: 57,
        deleted: 30,
        skipped: 0,
        failed: 27,
      },
      page: 'Preparation',
      tab,
      scope: { stationCode: 'MAA' },
    });

    expect(Object.keys(metadata).sort()).toEqual(
      [
        'affectedFlightCount',
        'affectedFlights',
        'counts',
        'customerBreakdown',
        'failures',
        'outcome',
        'page',
        'remainingAffectedCount',
        'remainingFailureCount',
        'scope',
        'sourceBreakdown',
        'statusBreakdown',
        'tab',
      ].sort(),
    );
    expect(metadata).toMatchObject({
      outcome: 'partial',
      counts: {
        requested: 57,
        deleted: 30,
        skipped: 0,
        failed: 27,
      },
      page: 'Preparation',
      tab: 'Validation Error',
      affectedFlightCount: 25,
      remainingAffectedCount: 5,
      remainingFailureCount: 2,
      sourceBreakdown: { scheduled_flight: 30 },
      customerBreakdown: { '6E': 15, AI: 15 },
      statusBreakdown: { validation_error: 1, pending: 29 },
      scope: { stationCode: 'MAA' },
    });
    expect(metadata.affectedFlights).toHaveLength(25);
    expect(metadata.failures).toHaveLength(25);
  });
});
