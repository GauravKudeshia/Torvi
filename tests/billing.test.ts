import assert from 'node:assert/strict';
import test from 'node:test';
import { hmacHex } from '@/lib/crypto';
import { ApiError } from '@/lib/http';
import { normalizePaddleEntitlementEvent, verifyPaddleSignature } from '@/lib/paddle';

test('verifies Paddle signatures against the exact raw request body', async () => {
  const previousSecret = process.env.PADDLE_WEBHOOK_SECRET;
  const previousTolerance = process.env.PADDLE_WEBHOOK_TOLERANCE_SECONDS;
  process.env.PADDLE_WEBHOOK_SECRET = 'test-notification-secret';
  process.env.PADDLE_WEBHOOK_TOLERANCE_SECONDS = '300';
  try {
    const raw = '{"event_id":"evt_test","event_type":"subscription.activated"}';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = await hmacHex(process.env.PADDLE_WEBHOOK_SECRET, `${timestamp}:${raw}`);
    await verifyPaddleSignature(raw, `ts=${timestamp};h1=${signature}`);
    await assert.rejects(
      verifyPaddleSignature(`${raw} `, `ts=${timestamp};h1=${signature}`),
      (error: unknown) => error instanceof ApiError && error.code === 'invalid_webhook',
    );
  } finally {
    if (previousSecret === undefined) delete process.env.PADDLE_WEBHOOK_SECRET;
    else process.env.PADDLE_WEBHOOK_SECRET = previousSecret;
    if (previousTolerance === undefined) delete process.env.PADDLE_WEBHOOK_TOLERANCE_SECONDS;
    else process.env.PADDLE_WEBHOOK_TOLERANCE_SECONDS = previousTolerance;
  }
});

test('normalizes active and canceled Paddle subscriptions into one entitlement shape', () => {
  const base = {
    event_id: 'evt_01test',
    occurred_at: '2026-08-22T12:00:00Z',
    data: {
      id: 'sub_01test',
      customer_id: 'ctm_01test',
      custom_data: { user_id: 'user-123' },
      current_billing_period: { ends_at: '2026-09-22T12:00:00Z' },
    },
  };
  const active = normalizePaddleEntitlementEvent({
    ...base,
    event_type: 'subscription.activated',
    data: { ...base.data, status: 'active' },
  });
  const canceled = normalizePaddleEntitlementEvent({
    ...base,
    event_id: 'evt_02test',
    event_type: 'subscription.canceled',
    data: { ...base.data, status: 'canceled' },
  });
  assert.deepEqual(active, {
    eventId: 'evt_01test',
    userId: 'user-123',
    active: true,
    customerId: 'ctm_01test',
    subscriptionId: 'sub_01test',
    periodEnd: Date.parse('2026-09-22T12:00:00Z'),
    eventOccurredAt: Date.parse('2026-08-22T12:00:00Z'),
  });
  assert.equal(canceled?.active, false);
});

test('ignores Paddle events that cannot change a recurring entitlement', () => {
  const normalized = normalizePaddleEntitlementEvent({
    event_id: 'evt_03test',
    event_type: 'transaction.updated',
    occurred_at: '2026-08-22T12:00:00Z',
    data: { id: 'txn_01test', status: 'ready', custom_data: { user_id: 'user-123' } },
  });
  assert.equal(normalized, null);
});
