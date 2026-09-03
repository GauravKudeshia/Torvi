'use client';

import { useState } from 'react';

type CheckoutPayload = {
  transactionId?: string;
  clientToken?: string;
  environment?: 'sandbox' | 'production';
  customerEmail?: string;
  successUrl?: string;
  error?: { message?: string };
};

type PaddleClient = {
  Environment: { set(environment: 'sandbox'): void };
  Initialize(input: { token: string }): void;
  Checkout: {
    open(input: {
      transactionId: string;
      customer?: { email: string };
      settings: { displayMode: 'overlay'; theme: 'light'; successUrl?: string };
    }): void;
  };
};

declare global {
  interface Window { Paddle?: PaddleClient }
}

let paddlePromise: Promise<PaddleClient> | null = null;

function loadPaddle(token: string, environment: 'sandbox' | 'production'): Promise<PaddleClient> {
  if (paddlePromise) return paddlePromise;
  const loading = new Promise<PaddleClient>((resolve, reject) => {
    const initialize = () => {
      if (!window.Paddle) {
        reject(new Error('Paddle Checkout did not load.'));
        return;
      }
      if (environment === 'sandbox') window.Paddle.Environment.set('sandbox');
      window.Paddle.Initialize({ token });
      resolve(window.Paddle);
    };
    if (window.Paddle) {
      initialize();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>('script[data-paddle-checkout]');
    if (existing) {
      existing.addEventListener('load', initialize, { once: true });
      existing.addEventListener('error', () => reject(new Error('Paddle Checkout could not be loaded.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
    script.async = true;
    script.dataset.paddleCheckout = 'true';
    script.addEventListener('load', initialize, { once: true });
    script.addEventListener('error', () => reject(new Error('Paddle Checkout could not be loaded.')), { once: true });
    document.head.appendChild(script);
  });
  const result = loading.catch((error) => {
    paddlePromise = null;
    throw error;
  });
  paddlePromise = result;
  return result;
}

export function PricingActions() {
  const [busy, setBusy] = useState('');

  async function checkout(interval: 'month' | 'year') {
    try {
      setBusy(interval);
      const response = await fetch('/api/v1/billing/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ interval }) });
      const payload = await response.json() as CheckoutPayload;
      if (!response.ok || !payload.transactionId || !payload.clientToken || !payload.environment) {
        throw new Error(payload.error?.message ?? 'Checkout is not configured yet.');
      }
      const paddle = await loadPaddle(payload.clientToken, payload.environment);
      paddle.Checkout.open({
        transactionId: payload.transactionId,
        customer: payload.customerEmail ? { email: payload.customerEmail } : undefined,
        settings: { displayMode: 'overlay', theme: 'light', successUrl: payload.successUrl },
      });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Checkout could not be opened.');
    } finally {
      setBusy('');
    }
  }

  async function openPortal() {
    try {
      setBusy('portal');
      const response = await fetch('/api/v1/billing/portal', { method: 'POST' });
      const payload = await response.json() as { url?: string; error?: { message?: string } };
      if (!response.ok || !payload.url) throw new Error(payload.error?.message ?? 'Billing management is unavailable.');
      window.location.href = payload.url;
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Billing management is unavailable.');
    } finally {
      setBusy('');
    }
  }

  return <div className="pricing-actions"><button onClick={() => checkout('month')} disabled={Boolean(busy)}>{busy === 'month' ? 'Opening…' : 'Choose monthly'}</button><button onClick={() => checkout('year')} disabled={Boolean(busy)}>{busy === 'year' ? 'Opening…' : '$149.99 yearly'}</button><button onClick={openPortal} disabled={Boolean(busy)}>{busy === 'portal' ? 'Opening…' : 'Manage web billing'}</button></div>;
}
