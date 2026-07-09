import { describe, expect, it } from 'vitest';
import { fetchVelaBillingSummary, parseBillingSummary } from '../src/integrations/vela-billing.js';

// A representative `vela billing summary --format json` payload.
const SAMPLE = JSON.stringify({
  balanceUsd: '1.2500',
  creditsPerUsd: 10000,
  balances: { subscriptionCredits: '5000', rechargeCredits: '7500', totalAvailableCredits: '12500' },
  membershipTier: 'team',
  billingInterval: 'monthly',
  subscriptionStatus: 'active',
  availableActions: ['subscription_checkout', 'billing_portal'],
});

describe('vela billing 收口', () => {
  it('maps the vela billing summary JSON into the client summary', () => {
    expect(parseBillingSummary(SAMPLE)).toEqual({
      membershipTier: 'team',
      totalAvailableCredits: 12500,
      balanceUsd: '1.2500',
      subscriptionStatus: 'active',
      availableActions: ['subscription_checkout', 'billing_portal'],
    });
  });

  it('returns null on empty or malformed output (clean "no summary")', () => {
    expect(parseBillingSummary('')).toBeNull();
    expect(parseBillingSummary('not json')).toBeNull();
  });

  it('degrades to null when the CLI throws — no billing session', async () => {
    const out = await fetchVelaBillingSummary({
      run: async () => {
        throw new Error('no vela session');
      },
    });
    expect(out).toBeNull();
  });

  it('drives the injected runner and maps its output', async () => {
    const out = await fetchVelaBillingSummary({ run: async () => SAMPLE });
    expect(out?.membershipTier).toBe('team');
    expect(out?.totalAvailableCredits).toBe(12500);
    expect(out?.availableActions).toContain('billing_portal');
  });
});
