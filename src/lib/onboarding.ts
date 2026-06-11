/**
 * „Първи стъпки" — лек onboarding за нов потребител (Phase 4.6). Чиста логика:
 * стъпките се извличат от реалните бройки ЖИВИ редове (подавай данни, заредени
 * с isNull(deletedAt) — каквито са store списъците на таблото).
 */

export interface OnboardingCounts {
  properties: number;
  leases: number;
  payments: number;
}

export interface OnboardingStep {
  key: 'property' | 'lease' | 'payment';
  /** Заглавие на стъпката — терминологията следва табовете/формите. */
  title: string;
  done: boolean;
}

export function onboardingSteps(counts: OnboardingCounts): OnboardingStep[] {
  return [
    { key: 'property', title: 'Добавете имот', done: counts.properties > 0 },
    { key: 'lease', title: 'Свържете наемател с договор', done: counts.leases > 0 },
    { key: 'payment', title: 'Запишете първото плащане', done: counts.payments > 0 },
  ];
}

/** Всички стъпки готови → картата изчезва сама. */
export function isOnboardingComplete(counts: OnboardingCounts): boolean {
  return onboardingSteps(counts).every((step) => step.done);
}
