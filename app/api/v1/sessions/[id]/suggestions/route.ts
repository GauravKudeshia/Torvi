import { eq } from 'drizzle-orm';
import { suggestionRequestSchema, transcriptFingerprint } from '@interview-copilot/contracts';
import { getDb } from '@/db';
import { communicationProfiles, documents, jobTargets, sessionDocuments, suggestions } from '@/db/schema';
import { requireActor } from '@/lib/auth';
import { streamProviderSuggestion } from '@/lib/ai/providers';
import { handleApiError, noStoreHeaders, parseJson } from '@/lib/http';
import { ownedSession } from '@/lib/session';
import { enforceRateLimit } from '@/lib/rate-limit';
import { selectRelevantSources } from '@/lib/retrieval';
import { markExperienceClaimsUsed, rankedMemoryForSession } from '@/lib/professional-memory';
import { structuredLog } from '@/lib/observability';

function event(type: string, data: unknown): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

function conversationContext(value: string) {
  let notes: string[] = [];
  try {
    notes = JSON.parse(value) as string[];
  } catch {
    return { priorRoundNotes: [] as string[] };
  }
  const extract = (prefix: string) => notes.find((note) => note.startsWith(prefix))?.slice(prefix.length).trim();
  return {
    interviewer: extract('Interviewer:'),
    interviewRound: extract('Interview round:'),
    objective: extract('Session objective:'),
    priorRoundNotes: notes.filter((note) => note.startsWith('Prior round:')).map((note) => note.slice('Prior round:'.length).trim()),
  };
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireActor(request);
    await enforceRateLimit(`suggestion:${actor.userId}`, 30, 60_000);
    const { id } = await context.params;
    const session = await ownedSession(id, actor.userId);
    const clientInput = await parseJson(request, suggestionRequestSchema);
    const db = getDb();
    const [target, attachedDocuments, communicationRows] = await Promise.all([session.jobTargetId
      ? db.select().from(jobTargets).where(eq(jobTargets.id, session.jobTargetId)).limit(1)
      : Promise.resolve([]), db.select({
      id: documents.id,
      fileName: documents.fileName,
      kind: documents.kind,
      extractedText: documents.extractedText,
      verifiedFactsJson: documents.verifiedFactsJson,
    }).from(sessionDocuments)
      .innerJoin(documents, eq(sessionDocuments.documentId, documents.id))
      .where(eq(sessionDocuments.sessionId, id)), db.select().from(communicationProfiles).where(eq(communicationProfiles.userId, actor.userId)).limit(1)]);
    const verifiedFacts = attachedDocuments
      .filter((document) => document.kind === 'resume')
      .flatMap((document) => JSON.parse(document.verifiedFactsJson) as string[])
      .slice(0, 80);
    const referenceSources = selectRelevantSources(clientInput.question, attachedDocuments.map((document) => ({
      id: document.id,
      fileName: document.fileName,
      kind: document.kind as 'resume' | 'job-description' | 'other',
      extractedText: document.extractedText,
    })));
    const targetContext = target[0] ? conversationContext(target[0].competenciesJson) : { priorRoundNotes: [] };
    const retrievalStartedAt = Date.now();
    const rankedMemory = await rankedMemoryForSession({
      userId: actor.userId,
      sessionId: id,
      question: clientInput.question,
      role: target[0]?.role,
      company: target[0]?.company,
      jobDescription: target[0]?.jobDescription,
    });
    const retrievalLatencyMs = Date.now() - retrievalStartedAt;
    const input = {
      ...clientInput,
      // The session keeps its original reporting mode, while the live command
      // bar may switch the assistant's behavior for a particular answer.
      mode: clientInput.mode,
      locale: session.locale as typeof clientInput.locale,
      verifiedFacts,
      verifiedMemory: rankedMemory.map((claim) => ({
        claimId: claim.claimId,
        experienceId: claim.experienceId,
        experienceTitle: claim.experienceTitle,
        company: claim.company,
        role: claim.role,
        claimText: claim.claimText,
        claimType: claim.claimType,
        knowledgeClass: claim.knowledgeClass,
        verificationStatus: claim.verificationStatus,
        sourceType: claim.sourceType,
        sourceId: claim.sourceId,
        evidenceExcerpt: claim.evidenceExcerpt,
        retrievalScore: claim.retrievalScore,
      })),
      communicationProfile: communicationRows[0] ? {
        preferredAnswerLength: communicationRows[0].preferredAnswerLength as 'tiny' | 'concise' | 'standard' | 'detailed',
        technicalDepth: communicationRows[0].technicalDepth as 'brief' | 'balanced' | 'deep',
        tone: communicationRows[0].tone as 'conversational' | 'formal' | 'executive' | 'warm',
        firstPersonStyle: communicationRows[0].firstPersonStyle as 'direct' | 'reflective' | 'team_forward',
        bulletPreference: communicationRows[0].bulletPreference as 'progressive' | 'bullets' | 'narrative',
        explanationDepth: communicationRows[0].explanationDepth as 'adaptive' | 'short' | 'detailed',
        vocabularyPreferences: JSON.parse(communicationRows[0].vocabularyPreferencesJson) as string[],
      } : undefined,
      referenceSources,
      target: target[0] ? {
        role: target[0].role,
        company: target[0].company ?? undefined,
        jobDescription: target[0].jobDescription ?? undefined,
        ...targetContext,
      } : clientInput.target,
    };
    const requestId = crypto.randomUUID();
    const startedAt = Date.now();
    const encoder = new TextEncoder();
    const abortController = new AbortController();
    let closed = false;
    const stream = new ReadableStream({
      start(controller) {
        let firstTokenLatencyMs: number | null = null;
        let finalSent = false;
        const enqueue = (type: string, payload: unknown) => {
          if (closed) return;
          try { controller.enqueue(encoder.encode(event(type, payload))); }
          catch { closed = true; abortController.abort(); }
        };
        enqueue('suggestion.started', { type: 'suggestion.started', requestId, retrievalLatencyMs });
        void (async () => {
          const result = await streamProviderSuggestion(input, actor.subject, (delta) => {
            if (firstTokenLatencyMs == null) firstTokenLatencyMs = Date.now() - startedAt;
            enqueue('suggestion.delta', { type: 'suggestion.delta', requestId, delta });
          }, abortController.signal);
          const latencyMs = Date.now() - startedAt;
          enqueue('suggestion.final', {
            type: 'suggestion.final', requestId, suggestion: result.suggestion, provider: result.provider,
            latencyMs, firstTokenLatencyMs, retrievalLatencyMs,
          });
          finalSent = true;
          await markExperienceClaimsUsed({
            userId: actor.userId,
            sessionId: id,
            roundId: session.interviewRoundId,
            claimIds: result.suggestion.grounding.verifiedClaimIds,
            questionFingerprint: transcriptFingerprint(input.question),
          });
          structuredLog('suggestion.generated', {
            retrievalLatencyMs,
            generationLatencyMs: latencyMs,
            firstTokenLatencyMs,
            verifiedClaimCount: result.suggestion.grounding.verifiedClaimIds.length,
            grounded: result.suggestion.grounded,
            evidenceGap: result.suggestion.recommendation !== 'answer',
            mode: session.mode,
          });
          if (session.retentionChoice === 'save') {
            await db.insert(suggestions).values({
              id: requestId,
              sessionId: id,
              question: input.question,
              responseJson: JSON.stringify(result.suggestion),
              model: result.model,
              grounded: result.suggestion.grounded,
              latencyMs,
              createdAt: Date.now(),
            });
          }
        })().catch((error) => {
          if (abortController.signal.aborted) return;
          console.error(JSON.stringify({ level: 'error', event: 'suggestion_stream_failed', message: error instanceof Error ? error.message : 'unknown' }));
          if (finalSent) return;
          structuredLog('suggestion.failed', { retrievalLatencyMs, mode: session.mode });
          enqueue('suggestion.error', {
            type: 'suggestion.error', requestId, recoverable: true,
            message: 'The coaching service could not complete this answer. Retry keeps the session open.',
          });
        }).finally(() => {
          if (!closed) controller.close();
          closed = true;
        });
      },
      cancel() {
        closed = true;
        abortController.abort();
      },
    });
    return new Response(stream, {
      headers: noStoreHeaders({
        'content-type': 'text/event-stream; charset=utf-8',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      }),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
