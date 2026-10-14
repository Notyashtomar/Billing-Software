import { planDelhiInternationalCategoryUpdates } from './delhi-international-price-card';

describe('planDelhiInternationalCategoryUpdates', () => {
  it('rewrites a domestic-only aircraft to International', () => {
    const plan = planDelhiInternationalCategoryUpdates([
      {
        id: 'a330',
        handlingType: 'BHS',
        customerCode: 'MU',
        aircraftType: 'A330',
        category: 'Dom',
      },
    ]);
    expect(plan.updateIds).toEqual(['a330']);
    expect(plan.retireIds).toEqual([]);
  });

  it('retires a domestic duplicate when International already exists', () => {
    const plan = planDelhiInternationalCategoryUpdates([
      {
        id: 'int',
        handlingType: 'BHS',
        customerCode: 'MU',
        aircraftType: 'A320',
        category: 'Int',
      },
      {
        id: 'dom',
        handlingType: 'BHS',
        customerCode: 'MU',
        aircraftType: 'A320',
        category: 'Dom',
      },
    ]);
    expect(plan.updateIds).toEqual([]);
    expect(plan.retireIds).toEqual(['dom']);
  });
});
