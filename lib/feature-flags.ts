import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { userFeatureFlags } from '@/db/schema';

export const professionalMemoryFlags = [
  'verified_experience_graph',
  'evidence_coverage',
  'adaptive_answers',
  'evidence_gap_mode',
  'followup_predictor',
  'interview_memory',
  'concern_ledger',
  'next_round_brief',
  'precompiled_brain',
  'meeting_mode',
  'meeting_to_career_memory',
] as const;

export type ProfessionalMemoryFlag = (typeof professionalMemoryFlags)[number];

const defaults: Record<ProfessionalMemoryFlag, boolean> = {
  verified_experience_graph: true,
  evidence_coverage: true,
  adaptive_answers: true,
  evidence_gap_mode: true,
  followup_predictor: true,
  interview_memory: true,
  concern_ledger: true,
  next_round_brief: true,
  precompiled_brain: true,
  meeting_mode: true,
  meeting_to_career_memory: true,
};

export async function featureEnabled(userId: string, flag: ProfessionalMemoryFlag) {
  const environmentOverride = process.env[`FEATURE_${flag.toUpperCase()}`];
  if (environmentOverride === '0' || environmentOverride === 'false') return false;
  if (environmentOverride === '1' || environmentOverride === 'true') return true;
  const db = getDb();
  const rows = await db.select({ enabled: userFeatureFlags.enabled }).from(userFeatureFlags)
    .where(and(eq(userFeatureFlags.userId, userId), eq(userFeatureFlags.flag, flag))).limit(1);
  return rows[0]?.enabled ?? defaults[flag];
}

export async function resolvedFeatureFlags(userId: string) {
  const entries = await Promise.all(professionalMemoryFlags.map(async (flag) => [flag, await featureEnabled(userId, flag)] as const));
  return Object.fromEntries(entries) as Record<ProfessionalMemoryFlag, boolean>;
}
