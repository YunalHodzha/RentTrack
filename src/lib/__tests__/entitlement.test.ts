import { getEntitlement, canAddProperty, FREE_PROPERTY_LIMIT } from '../entitlement';

describe('entitlement', () => {
  it('everyone is pro until Phase 6 wires RevenueCat', () => {
    expect(getEntitlement()).toBe('pro');
  });

  it('pro can always add a property, regardless of count', () => {
    expect(canAddProperty(0)).toBe(true);
    expect(canAddProperty(FREE_PROPERTY_LIMIT)).toBe(true);
    expect(canAddProperty(FREE_PROPERTY_LIMIT + 100)).toBe(true);
  });

  // Free пътят (count < FREE_PROPERTY_LIMIT) не може да се тества без mock:
  // canAddProperty вика getEntitlement през локалния binding на модула, който
  // jest.spyOn не прихваща. Phase 6 ще подмени hardcode-а с реален източник
  // (RevenueCat) и тогава free пътят става тестваем с инжектиран entitlement.
});
