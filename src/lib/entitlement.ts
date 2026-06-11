/**
 * Entitlement слой — hook point за монетизацията от Phase 6 (ROADMAP §13).
 * Засега е чист scaffold: getEntitlement() винаги връща 'pro', така че
 * поведението на приложението не се променя. Phase 6 ще върже това към
 * RevenueCat и ще добави paywall UI.
 */
export type Entitlement = 'free' | 'pro';

/** Лимит на безплатния план (Фаза 6): freemium до 2 имота. */
export const FREE_PROPERTY_LIMIT = 2;

/** Засега всички са pro — Фаза 6 ще върже това към RevenueCat. */
export function getEntitlement(): Entitlement {
  return 'pro';
}

/**
 * Дали потребителят може да добави нов имот при текущия си план.
 * `currentPropertyCount` е броят НЕИЗТРИТИ имоти (заявка/списък, филтрирани
 * с isNull(deletedAt)) — soft-изтритите не се броят към лимита.
 */
export function canAddProperty(currentPropertyCount: number): boolean {
  if (getEntitlement() === 'pro') return true;
  return currentPropertyCount < FREE_PROPERTY_LIMIT;
}
