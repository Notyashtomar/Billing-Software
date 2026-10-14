import {
  billingPersonalWorkspace,
  preparationRowVisibleToCurrentUser,
  preparationSentMarkerClause,
  preparationVisibilityClause,
  withPreparationVisibility,
} from './billing-personal-workspace';

describe('billing personal workspace', () => {
  it('hides another user open preparation rows and keeps legacy rows', () => {
    const clause = preparationVisibilityClause('user-a');
    expect(clause).toEqual({
      $or: [{ ownerUserId: 'user-a' }, { ownerUserId: null }, { ownerUserId: '' }],
    });
  });

  it('treats invoiced flights as sent without exposing another user pending rows', () => {
    const clause = preparationSentMarkerClause('user-a');
    const or = (clause?.$or ?? []) as Array<Record<string, unknown>>;
    expect(or).toContainEqual({ ownerUserId: 'user-a' });
    expect(or).toContainEqual({ status: 'invoiced' });
    expect(or.some((item) => item.ownerUserId === 'user-b')).toBe(false);
  });

  it('scopes list filters only inside a user request', () => {
    expect(withPreparationVisibility({ status: 'pending' })).toEqual({
      status: 'pending',
    });
    billingPersonalWorkspace.run('user-a', () => {
      expect(preparationRowVisibleToCurrentUser('user-a')).toBe(true);
      expect(preparationRowVisibleToCurrentUser('')).toBe(true);
      expect(preparationRowVisibleToCurrentUser('user-b')).toBe(false);
      expect(withPreparationVisibility({ status: 'pending' })).toEqual({
        $and: [
          { status: 'pending' },
          {
            $or: [
              { ownerUserId: 'user-a' },
              { ownerUserId: null },
              { ownerUserId: '' },
            ],
          },
        ],
      });
    });
  });
});
