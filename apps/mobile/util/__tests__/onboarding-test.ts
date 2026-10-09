import { describe, expect, it } from '@jest/globals';
import { getDreamPlan, recallSnapshot, validAnswers } from '../onboarding';
import { discountedOffering, periodLabel } from '../onboarding-offer';
import type { PurchasesOffering } from 'react-native-purchases';

function offering(identifier: string, price: number, currency = 'GBP', period: string | null = 'P1Y', discountId?: string): PurchasesOffering {
  return { identifier, metadata: discountId ? { onboarding_discount_offering_id: discountId } : {}, availablePackages: [{ identifier: 'annual', product: { price, currencyCode: currency, subscriptionPeriod: period } }] } as unknown as PurchasesOffering;
}

describe('personal dream routine', () => {
  it('validates saved answers and discards unknown values', () => {
    expect(validAnswers({ goal: 'themes', recall: 'invented', capture: 'voice', unexpected: true })).toEqual({ goal: 'themes', capture: 'voice' });
    expect(validAnswers(null)).toEqual({});
  });
  it('uses cadence, input preference, and recurring themes in the plan', () => {
    const plan = getDreamPlan({ goal: 'themes', capture: 'voice', pace: 'few', dreams: 'recurring' });
    expect(plan.rhythm).toBe('Three mornings this week');
    expect(plan.voice).toBe(true);
    expect(plan.captureDetail).toContain('Recording is free.');
    expect(plan.captureDetail).toContain('AI transcription may require Premium after free previews.');
    expect(plan.reflect).toBe('Review recurring themes');
  });
  it('preserves a schedule-free choice and writing as a fallback', () => {
    const plan = getDreamPlan({ pace: 'when', capture: 'write', goal: 'reflect' });
    expect(plan.rhythm).toBe('When you remember a dream');
    expect(plan.voice).toBe(false);
    expect(plan.goal).toBe('Reflect on dreams');
  });
  it('maps self-reported recall without invented population statistics', () => {
    expect(recallSnapshot({ recall: 'rarely' }).level).toBe(1);
    expect(recallSnapshot({ recall: 'vivid' }).level).toBe(4);
  });
});

describe('real discounted store offers', () => {
  it('requires explicit metadata and a genuinely cheaper matching period/currency', () => {
    const current = offering('main', 40, 'GBP', 'P1Y', 'special');
    const special = offering('special', 30);
    expect(discountedOffering(current, [current, special])).toBe(special);
    expect(discountedOffering(offering('main', 40), [special])).toBeUndefined();
  });
  it.each([
    [45, 'GBP', 'P1Y'], [40, 'GBP', 'P1Y'], [20, 'USD', 'P1Y'], [5, 'GBP', 'P1M'], [0, 'GBP', 'P1Y'], [20, 'GBP', null],
  ])('rejects misleading comparisons (%s, %s, %s)', (price, currency, period) => {
    const current = offering('main', 40, 'GBP', 'P1Y', 'special');
    expect(discountedOffering(current, [offering('special', price as number, currency as string, period)])).toBeUndefined();
  });
  it('rejects an offering with a mixture of cheaper and more expensive packages', () => {
    const current = offering('main', 40, 'GBP', 'P1Y', 'special');
    const special = offering('special', 30);
    const mixed = { ...special, availablePackages: [...special.availablePackages, ...offering('higher', 50).availablePackages] };
    expect(discountedOffering(current, [mixed])).toBeUndefined();
  });
  it('renders renewal periods without assuming an annual package', () => {
    expect(periodLabel('P1Y')).toBe('per year');
    expect(periodLabel('P3M')).toBe('every 3 months');
    expect(periodLabel(null)).toBe('per billing period');
  });
});
