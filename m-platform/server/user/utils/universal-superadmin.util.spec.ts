import { isUniversalSuperadminUserid } from './universal-superadmin.util';

describe('isUniversalSuperadminUserid', () => {
  it('locks full BWMS grants only for the canonical portal id', () => {
    expect(isUniversalSuperadminUserid('supadm123')).toBe(true);
    expect(isUniversalSuperadminUserid('SUPADM123')).toBe(true);
  });

  it('lets other superadmin logins keep editable grants', () => {
    expect(isUniversalSuperadminUserid('rishi01')).toBe(false);
    expect(isUniversalSuperadminUserid('superadmin')).toBe(false);
    expect(isUniversalSuperadminUserid('')).toBe(false);
  });
});
