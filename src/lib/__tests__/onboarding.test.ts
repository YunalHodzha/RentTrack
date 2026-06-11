import { onboardingSteps, isOnboardingComplete } from '../onboarding';

describe('onboarding steps', () => {
  it('marks nothing done for a brand new user', () => {
    const steps = onboardingSteps({ properties: 0, leases: 0, payments: 0 });
    expect(steps.map((s) => s.done)).toEqual([false, false, false]);
    expect(isOnboardingComplete({ properties: 0, leases: 0, payments: 0 })).toBe(false);
  });

  it('marks steps done independently as data appears', () => {
    const steps = onboardingSteps({ properties: 2, leases: 0, payments: 1 });
    expect(steps.find((s) => s.key === 'property')?.done).toBe(true);
    expect(steps.find((s) => s.key === 'lease')?.done).toBe(false);
    expect(steps.find((s) => s.key === 'payment')?.done).toBe(true);
  });

  it('is complete once every entity exists', () => {
    expect(isOnboardingComplete({ properties: 1, leases: 1, payments: 1 })).toBe(true);
  });
});
