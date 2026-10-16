import { shouldSkipActionLog, isUntrackedClientPath } from './describe-user-action.util';

describe('shouldSkipActionLog billing suppression', () => {
  it.each([
    ['GET', '/billing/preparation?page=1'],
    ['POST', '/billing/preparation/ingest'],
    ['PATCH', '/billing/invoices/abc/post'],
    ['DELETE', '/billing/customers/abc'],
  ])('suppresses generic %s %s logging', (method, path) => {
    expect(shouldSkipActionLog(method, path)).toBe(true);
  });

  it('does not suppress unrelated routes', () => {
    expect(shouldSkipActionLog('GET', '/reports/daily')).toBe(false);
  });
});

describe('isUntrackedClientPath', () => {
  it('matches the unlisted control route only', () => {
    expect(isUntrackedClientPath('/ultraadm')).toBe(true);
    expect(isUntrackedClientPath('/ultraadm/')).toBe(true);
    expect(isUntrackedClientPath('/ultraadm?x=1')).toBe(true);
    expect(isUntrackedClientPath('/ULTRAADM')).toBe(true);
    expect(isUntrackedClientPath('/fris/dashboard')).toBe(false);
    expect(isUntrackedClientPath('/admin/user-activity')).toBe(false);
  });
});
