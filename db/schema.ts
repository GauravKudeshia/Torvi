import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  authSubject: text('auth_subject').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  locale: text('locale').notNull().default('en'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletionScheduledAt: integer('deletion_scheduled_at'),
}, (table) => [index('users_email_idx').on(table.email)]);

export const profiles = sqliteTable('profiles', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  headline: text('headline'),
  summary: text('summary'),
  verifiedFactsJson: text('verified_facts_json').notNull().default('[]'),
  preferencesJson: text('preferences_json').notNull().default('{}'),
  updatedAt: integer('updated_at').notNull(),
});

export const jobTargets = sqliteTable('job_targets', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  company: text('company'),
  jobDescription: text('job_description'),
  competenciesJson: text('competencies_json').notNull().default('[]'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => [index('job_targets_owner_idx').on(table.userId, table.updatedAt)]);

export const documents = sqliteTable('documents', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  fileName: text('file_name').notNull(),
  contentType: text('content_type').notNull(),
  objectKey: text('object_key').notNull().unique(),
  sizeBytes: integer('size_bytes').notNull(),
  sha256: text('sha256').notNull(),
  parseStatus: text('parse_status').notNull().default('pending'),
  extractedText: text('extracted_text'),
  verifiedFactsJson: text('verified_facts_json').notNull().default('[]'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => [index('documents_owner_idx').on(table.userId, table.createdAt)]);

export const professionalExperiences = sqliteTable('professional_experiences', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  sourceDocumentId: text('source_document_id').references(() => documents.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  company: text('company'),
  role: text('role'),
  startDate: text('start_date'),
  endDate: text('end_date'),
  context: text('context'),
  summary: text('summary'),
  responsibilitiesJson: text('responsibilities_json').notNull().default('[]'),
  technologiesJson: text('technologies_json').notNull().default('[]'),
  projectsJson: text('projects_json').notNull().default('[]'),
  decisionsJson: text('decisions_json').notNull().default('[]'),
  challengesJson: text('challenges_json').notNull().default('[]'),
  tradeoffsJson: text('tradeoffs_json').notNull().default('[]'),
  outcomesJson: text('outcomes_json').notNull().default('[]'),
  metricsJson: text('metrics_json').notNull().default('[]'),
  competenciesJson: text('competencies_json').notNull().default('[]'),
  leadershipExamplesJson: text('leadership_examples_json').notNull().default('[]'),
  collaborationExamplesJson: text('collaboration_examples_json').notNull().default('[]'),
  conflictExamplesJson: text('conflict_examples_json').notNull().default('[]'),
  learningExamplesJson: text('learning_examples_json').notNull().default('[]'),
  verificationStatus: text('verification_status').notNull().default('proposed'),
  confidence: real('confidence').notNull().default(0.5),
  sensitive: integer('sensitive', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => [
  index('professional_experiences_owner_idx').on(table.userId, table.updatedAt),
  index('professional_experiences_source_idx').on(table.sourceDocumentId),
]);

export const professionalClaims = sqliteTable('professional_claims', {
  id: text('id').primaryKey(),
  experienceId: text('experience_id').references(() => professionalExperiences.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  claimText: text('claim_text').notNull(),
  claimType: text('claim_type').notNull().default('other'),
  knowledgeClass: text('knowledge_class').notNull().default('VERIFIED_PERSONAL_FACT'),
  sourceType: text('source_type').notNull(),
  sourceId: text('source_id'),
  sourceExcerpt: text('source_excerpt'),
  sourceLocation: text('source_location'),
  verificationStatus: text('verification_status').notNull().default('proposed'),
  verifiedAt: integer('verified_at'),
  userCorrection: text('user_correction'),
  confidence: real('confidence').notNull().default(0.5),
  allowedAsPersonalExperience: integer('allowed_as_personal_experience', { mode: 'boolean' }).notNull().default(false),
  sensitive: integer('sensitive', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => [
  index('professional_claims_owner_status_idx').on(table.userId, table.verificationStatus, table.updatedAt),
  index('professional_claims_experience_idx').on(table.experienceId, table.updatedAt),
  uniqueIndex('professional_claims_source_text_idx').on(table.userId, table.sourceType, table.sourceId, table.claimText),
]);

export const claimEvidence = sqliteTable('claim_evidence', {
  id: text('id').primaryKey(),
  claimId: text('claim_id').notNull().references(() => professionalClaims.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  sourceType: text('source_type').notNull(),
  sourceId: text('source_id'),
  excerpt: text('excerpt'),
  location: text('location'),
  confidence: real('confidence').notNull().default(0.5),
  createdAt: integer('created_at').notNull(),
}, (table) => [
  index('claim_evidence_claim_idx').on(table.claimId, table.createdAt),
  index('claim_evidence_owner_idx').on(table.userId, table.createdAt),
]);

export const communicationProfiles = sqliteTable('communication_profiles', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  preferredAnswerLength: text('preferred_answer_length').notNull().default('concise'),
  technicalDepth: text('technical_depth').notNull().default('balanced'),
  tone: text('tone').notNull().default('conversational'),
  firstPersonStyle: text('first_person_style').notNull().default('direct'),
  bulletPreference: text('bullet_preference').notNull().default('progressive'),
  explanationDepth: text('explanation_depth').notNull().default('adaptive'),
  vocabularyPreferencesJson: text('vocabulary_preferences_json').notNull().default('[]'),
  updatedAt: integer('updated_at').notNull(),
});

export const interviewProcesses = sqliteTable('interview_processes', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  jobTargetId: text('job_target_id').references(() => jobTargets.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  status: text('status').notNull().default('active'),
  outcome: text('outcome'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => [index('interview_processes_owner_idx').on(table.userId, table.updatedAt)]);

export const interviewRounds = sqliteTable('interview_rounds', {
  id: text('id').primaryKey(),
  processId: text('process_id').notNull().references(() => interviewProcesses.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  interviewerJson: text('interviewer_json').notNull().default('[]'),
  objective: text('objective'),
  status: text('status').notNull().default('planned'),
  scheduledAt: integer('scheduled_at'),
  completedAt: integer('completed_at'),
  summary: text('summary'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => [
  index('interview_rounds_process_idx').on(table.processId, table.createdAt),
  index('interview_rounds_owner_idx').on(table.userId, table.updatedAt),
]);

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  jobTargetId: text('job_target_id').references(() => jobTargets.id, { onDelete: 'set null' }),
  interviewRoundId: text('interview_round_id').references(() => interviewRounds.id, { onDelete: 'set null' }),
  deviceId: text('device_id').notNull(),
  mode: text('mode').notNull(),
  locale: text('locale').notNull(),
  status: text('status').notNull().default('created'),
  retentionChoice: text('retention_choice').notNull(),
  startedAt: integer('started_at').notNull(),
  endedAt: integer('ended_at'),
  discardedAt: integer('discarded_at'),
  savedAt: integer('saved_at'),
  liveSeconds: integer('live_seconds').notNull().default(0),
  reportId: text('report_id'),
}, (table) => [
  index('sessions_owner_idx').on(table.userId, table.startedAt),
  index('sessions_status_idx').on(table.status, table.startedAt),
]);

export const sessionDocuments = sqliteTable('session_documents', {
  sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  documentId: text('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at').notNull(),
}, (table) => [
  uniqueIndex('session_documents_unique_idx').on(table.sessionId, table.documentId),
  index('session_documents_document_idx').on(table.documentId, table.sessionId),
]);

export const transcriptSegments = sqliteTable('transcript_segments', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  speaker: text('speaker').notNull(),
  text: text('text').notNull(),
  startedAtMs: integer('started_at_ms').notNull(),
  endedAtMs: integer('ended_at_ms').notNull(),
  itemId: text('item_id'),
  createdAt: integer('created_at').notNull(),
}, (table) => [index('segments_timeline_idx').on(table.sessionId, table.startedAtMs)]);

export const suggestions = sqliteTable('suggestions', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  question: text('question').notNull(),
  responseJson: text('response_json').notNull(),
  model: text('model').notNull(),
  grounded: integer('grounded', { mode: 'boolean' }).notNull(),
  latencyMs: integer('latency_ms').notNull(),
  createdAt: integer('created_at').notNull(),
}, (table) => [index('suggestions_session_idx').on(table.sessionId, table.createdAt)]);

export const reports = sqliteTable('reports', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }).unique(),
  score: real('score'),
  summary: text('summary').notNull(),
  strengthsJson: text('strengths_json').notNull().default('[]'),
  improvementsJson: text('improvements_json').notNull().default('[]'),
  notesJson: text('notes_json').notNull().default('[]'),
  actionItemsJson: text('action_items_json').notNull().default('[]'),
  followUpEmail: text('follow_up_email'),
  createdAt: integer('created_at').notNull(),
}, (table) => [index('reports_owner_idx').on(table.userId, table.createdAt)]);

export const careerArtifacts = sqliteTable('career_artifacts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  bulletsJson: text('bullets_json').notNull().default('[]'),
  keywordsJson: text('keywords_json').notNull().default('[]'),
  score: real('score'),
  caution: text('caution'),
  contextJson: text('context_json').notNull().default('{}'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => [index('career_artifacts_owner_idx').on(table.userId, table.createdAt)]);

export const jobApplications = sqliteTable('job_applications', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  company: text('company').notNull(),
  jobUrl: text('job_url'),
  jobDescription: text('job_description'),
  status: text('status').notNull().default('saved'),
  matchScore: integer('match_score'),
  notes: text('notes'),
  nextAction: text('next_action'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => [
  index('job_applications_owner_idx').on(table.userId, table.updatedAt),
  index('job_applications_status_idx').on(table.userId, table.status),
]);

export const consentReceipts = sqliteTable('consent_receipts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  sessionId: text('session_id').references(() => sessions.id, { onDelete: 'cascade' }),
  policyVersion: text('policy_version').notNull(),
  recordingAllowed: integer('recording_allowed', { mode: 'boolean' }).notNull(),
  aiAssistanceAllowed: integer('ai_assistance_allowed', { mode: 'boolean' }).notNull(),
  ipHash: text('ip_hash'),
  createdAt: integer('created_at').notNull(),
});

export const roundConcerns = sqliteTable('round_concerns', {
  id: text('id').primaryKey(),
  roundId: text('round_id').notNull().references(() => interviewRounds.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  category: text('category').notNull(),
  summary: text('summary').notNull(),
  evidence: text('evidence'),
  status: text('status').notNull().default('proposed'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => [
  index('round_concerns_round_idx').on(table.roundId, table.status),
  index('round_concerns_owner_idx').on(table.userId, table.updatedAt),
]);

export const experienceUses = sqliteTable('experience_uses', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  roundId: text('round_id').references(() => interviewRounds.id, { onDelete: 'set null' }),
  experienceId: text('experience_id').notNull().references(() => professionalExperiences.id, { onDelete: 'cascade' }),
  claimId: text('claim_id').references(() => professionalClaims.id, { onDelete: 'set null' }),
  questionFingerprint: text('question_fingerprint').notNull(),
  createdAt: integer('created_at').notNull(),
}, (table) => [
  index('experience_uses_session_idx').on(table.sessionId, table.createdAt),
  index('experience_uses_round_idx').on(table.roundId, table.createdAt),
  index('experience_uses_owner_idx').on(table.userId, table.createdAt),
]);

export const sessionBrains = sqliteTable('session_brains', {
  sessionId: text('session_id').primaryKey().references(() => sessions.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  sourceVersion: text('source_version').notNull(),
  payloadJson: text('payload_json').notNull(),
  createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
}, (table) => [index('session_brains_owner_idx').on(table.userId, table.expiresAt)]);

export const sessionCaptures = sqliteTable('session_captures', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  text: text('text').notNull(),
  owner: text('owner'),
  dueAt: integer('due_at'),
  createdAt: integer('created_at').notNull(),
}, (table) => [index('session_captures_timeline_idx').on(table.sessionId, table.createdAt)]);

export const userFeatureFlags = sqliteTable('user_feature_flags', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  flag: text('flag').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => [
  uniqueIndex('user_feature_flags_unique_idx').on(table.userId, table.flag),
  index('user_feature_flags_owner_idx').on(table.userId, table.updatedAt),
]);

export const entitlements = sqliteTable('entitlements', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  plan: text('plan').notNull().default('free'),
  status: text('status').notNull().default('active'),
  source: text('source').notNull().default('system'),
  sourceCustomerId: text('source_customer_id'),
  sourceSubscriptionId: text('source_subscription_id'),
  sourceEventOccurredAt: integer('source_event_occurred_at'),
  currentPeriodEnd: integer('current_period_end'),
  updatedAt: integer('updated_at').notNull(),
});

export const usageLedger = sqliteTable('usage_ledger', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  periodKey: text('period_key').notNull(),
  liveSeconds: integer('live_seconds').notNull().default(0),
  mockSessions: integer('mock_sessions').notNull().default(0),
  reason: text('reason').notNull(),
  externalRef: text('external_ref'),
  createdAt: integer('created_at').notNull(),
}, (table) => [
  index('usage_period_idx').on(table.userId, table.periodKey),
  uniqueIndex('usage_external_ref_idx').on(table.externalRef),
]);

export const devices = sqliteTable('devices', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  platform: text('platform').notNull(),
  name: text('name'),
  appVersion: text('app_version'),
  lastSeenAt: integer('last_seen_at').notNull(),
  revokedAt: integer('revoked_at'),
}, (table) => [index('devices_owner_idx').on(table.userId, table.lastSeenAt)]);

export const desktopHandoffs = sqliteTable('desktop_handoffs', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  codeHash: text('code_hash').notNull().unique(),
  expiresAt: integer('expires_at').notNull(),
  consumedAt: integer('consumed_at'),
  createdAt: integer('created_at').notNull(),
}, (table) => [
  index('desktop_handoffs_owner_idx').on(table.userId, table.createdAt),
  index('desktop_handoffs_expiry_idx').on(table.expiresAt),
]);

export const desktopAuthorizations = sqliteTable('desktop_authorizations', {
  id: text('id').primaryKey(),
  deviceCodeHash: text('device_code_hash').notNull().unique(),
  userCodeHash: text('user_code_hash').notNull().unique(),
  deviceName: text('device_name').notNull(),
  appVersion: text('app_version').notNull(),
  status: text('status').notNull().default('pending'),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  deviceId: text('device_id').references(() => devices.id, { onDelete: 'set null' }),
  expiresAt: integer('expires_at').notNull(),
  approvedAt: integer('approved_at'),
  consumedAt: integer('consumed_at'),
  createdAt: integer('created_at').notNull(),
}, (table) => [
  index('desktop_authorizations_expiry_idx').on(table.status, table.expiresAt),
  index('desktop_authorizations_owner_idx').on(table.userId, table.createdAt),
]);

export const auditEvents = sqliteTable('audit_events', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id'),
  metadataJson: text('metadata_json').notNull().default('{}'),
  createdAt: integer('created_at').notNull(),
}, (table) => [index('audit_owner_idx').on(table.userId, table.createdAt)]);

export const webhookEvents = sqliteTable('webhook_events', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull(),
  eventId: text('event_id').notNull(),
  payloadHash: text('payload_hash').notNull(),
  status: text('status').notNull(),
  processedAt: integer('processed_at').notNull(),
}, (table) => [uniqueIndex('webhook_provider_event_idx').on(table.provider, table.eventId)]);

export const uploadTickets = sqliteTable('upload_tickets', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  documentId: text('document_id').notNull(),
  objectKey: text('object_key').notNull(),
  expiresAt: integer('expires_at').notNull(),
  consumedAt: integer('consumed_at'),
}, (table) => [index('upload_ticket_expiry_idx').on(table.expiresAt)]);

export const deletionRequests = sqliteTable('deletion_requests', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: text('status').notNull(),
  requestedAt: integer('requested_at').notNull(),
  executeAfter: integer('execute_after').notNull(),
  completedAt: integer('completed_at'),
}, (table) => [index('deletion_status_idx').on(table.status, table.executeAfter)]);

export const rateLimitWindows = sqliteTable('rate_limit_windows', {
  key: text('key').primaryKey(),
  windowStartedAt: integer('window_started_at').notNull(),
  count: integer('count').notNull(),
  expiresAt: integer('expires_at').notNull(),
}, (table) => [index('rate_limit_expiry_idx').on(table.expiresAt)]);
