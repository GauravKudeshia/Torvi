import type {
  AiProviderDescriptor,
  AiProviderId,
  SuggestionRequest,
} from '@interview-copilot/contracts';
import { ApiError } from '@/lib/http';
import { createSuggestion as createOpenAiSuggestion } from '@/lib/openai';
import { streamSuggestion as streamOpenAiSuggestion } from '@/lib/openai';
import type { ReferenceSource } from '@/lib/retrieval';

const providers: readonly AiProviderDescriptor[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    enabled: true,
    capabilities: ['suggestions', 'reports', 'vision', 'realtime-transcription'],
    configuration: 'managed',
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    enabled: false,
    capabilities: ['suggestions', 'reports', 'vision'],
    configuration: 'managed',
  },
  {
    id: 'google',
    label: 'Google',
    enabled: false,
    capabilities: ['suggestions', 'reports', 'vision'],
    configuration: 'managed',
  },
  {
    id: 'openai-compatible',
    label: 'OpenAI-compatible',
    enabled: false,
    capabilities: ['suggestions', 'reports'],
    configuration: 'bring-your-own-key',
  },
  {
    id: 'local',
    label: 'Local model',
    enabled: false,
    capabilities: ['suggestions', 'reports'],
    configuration: 'local',
  },
] as const;

export function listAiProviders(): AiProviderDescriptor[] {
  return providers.map((provider) => ({ ...provider, capabilities: [...provider.capabilities] }));
}

export function requireAiProvider(requested: AiProviderId | undefined): AiProviderDescriptor {
  const id = requested ?? 'openai';
  const provider = providers.find((candidate) => candidate.id === id);
  if (!provider || !provider.enabled) {
    throw new ApiError(422, 'provider_unavailable', `${provider?.label ?? id} is not enabled for this release.`);
  }
  return { ...provider, capabilities: [...provider.capabilities] };
}

export async function createProviderSuggestion(
  input: SuggestionRequest & { referenceSources: ReferenceSource[] },
  subject: string,
) {
  const provider = requireAiProvider(input.provider);
  if (provider.id !== 'openai') {
    throw new ApiError(422, 'provider_unsupported', 'The selected provider cannot create suggestions yet.');
  }
  const result = await createOpenAiSuggestion(input, subject);
  return {
    ...result,
    provider: provider.id,
    suggestion: { ...result.suggestion, provider: provider.id },
  };
}

export async function streamProviderSuggestion(
  input: SuggestionRequest & { referenceSources: ReferenceSource[] },
  subject: string,
  onDirectAnswerDelta: (delta: string) => void,
  signal?: AbortSignal,
) {
  const provider = requireAiProvider(input.provider);
  if (provider.id !== 'openai') {
    throw new ApiError(422, 'provider_unsupported', 'The selected provider cannot create suggestions yet.');
  }
  const result = await streamOpenAiSuggestion(input, subject, onDirectAnswerDelta, signal);
  return {
    ...result,
    provider: provider.id,
    suggestion: { ...result.suggestion, provider: provider.id },
  };
}
