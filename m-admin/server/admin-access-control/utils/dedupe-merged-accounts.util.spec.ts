import {
  dedupeMergedAccounts,
  uniqueIdList,
} from './dedupe-merged-accounts.util';

describe('dedupeMergedAccounts', () => {
  it('drops admin shadows of panel users', () => {
    const merged = dedupeMergedAccounts(
      [{ id: 'u1', userid: 'DELJ0084', employeeId: 'DELJ0084', email: 'csc@bird.in' }],
      [{ id: 'a1', userid: 'DELJ0084', employeeId: 'DELJ0084', email: 'csc@bird.in' }],
    );
    expect(merged.map((row) => row.id)).toEqual(['u1']);
  });
});

describe('uniqueIdList', () => {
  it('removes duplicate station ids', () => {
    expect(uniqueIdList(['del', 'del', 'maa'])).toEqual(['del', 'maa']);
  });
});
