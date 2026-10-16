import { mapActivityToAuditRecord } from './map-activity-to-audit.util';

describe('mapActivityToAuditRecord explicit data', () => {
  it('preserves rich activity fields ahead of inferred/enriched values', () => {
    const record = mapActivityToAuditRecord(
      {
        userId: 'user-id',
        userName: 'Finance User',
        userEmail: 'finance@example.com',
        accountType: 'user',
        actorRole: 'Finance Manager',
        action: 'Posted Invoice',
        module: 'Billing',
        entityType: 'invoice',
        entityId: 'invoice-id',
        stationId: 'station-id',
        stationName: 'MAA',
        method: 'POST',
        path: '/billing/invoices/invoice-id/post',
      },
      {
        role: 'employee',
        station: 'fallback-station',
      },
    );

    expect(record).toMatchObject({
      module: 'Billing',
      entityType: 'invoice',
      entityId: 'invoice-id',
      role: 'Finance Manager',
      station: 'MAA',
    });
  });
});
