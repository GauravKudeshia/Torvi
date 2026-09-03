import assert from 'node:assert/strict';
import test from 'node:test';
import { listAiProviders, requireAiProvider } from '@/lib/ai/providers';
import { ApiError } from '@/lib/http';

test('exposes one enabled managed provider for the first release', () => {
  const providers = listAiProviders();
  assert.deepEqual(providers.filter((provider) => provider.enabled).map((provider) => provider.id), ['openai']);
  assert.equal(requireAiProvider(undefined).id, 'openai');
  assert.ok(requireAiProvider('openai').capabilities.includes('realtime-transcription'));
});

test('rejects provider choices that are planned but not configured', () => {
  assert.throws(
    () => requireAiProvider('anthropic'),
    (error: unknown) => error instanceof ApiError && error.code === 'provider_unavailable' && error.status === 422,
  );
});
