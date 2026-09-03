import { env } from 'cloudflare:workers';

let schemaReady: Promise<void> | undefined;

const statements = [
  `CREATE TABLE IF NOT EXISTS professional_experiences (
    id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, source_document_id TEXT, title TEXT NOT NULL,
    company TEXT, role TEXT, start_date TEXT, end_date TEXT, context TEXT, summary TEXT,
    responsibilities_json TEXT DEFAULT '[]' NOT NULL, technologies_json TEXT DEFAULT '[]' NOT NULL,
    projects_json TEXT DEFAULT '[]' NOT NULL, decisions_json TEXT DEFAULT '[]' NOT NULL,
    challenges_json TEXT DEFAULT '[]' NOT NULL, tradeoffs_json TEXT DEFAULT '[]' NOT NULL,
    outcomes_json TEXT DEFAULT '[]' NOT NULL, metrics_json TEXT DEFAULT '[]' NOT NULL,
    competencies_json TEXT DEFAULT '[]' NOT NULL, leadership_examples_json TEXT DEFAULT '[]' NOT NULL,
    collaboration_examples_json TEXT DEFAULT '[]' NOT NULL, conflict_examples_json TEXT DEFAULT '[]' NOT NULL,
    learning_examples_json TEXT DEFAULT '[]' NOT NULL, verification_status TEXT DEFAULT 'proposed' NOT NULL,
    confidence REAL DEFAULT 0.5 NOT NULL, sensitive INTEGER DEFAULT false NOT NULL,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (source_document_id) REFERENCES documents(id) ON DELETE SET NULL
  )`,
  `CREATE INDEX IF NOT EXISTS professional_experiences_owner_idx ON professional_experiences (user_id, updated_at)`,
  `CREATE INDEX IF NOT EXISTS professional_experiences_source_idx ON professional_experiences (source_document_id)`,
  `CREATE TABLE IF NOT EXISTS professional_claims (
    id TEXT PRIMARY KEY NOT NULL, experience_id TEXT, user_id TEXT NOT NULL, claim_text TEXT NOT NULL,
    claim_type TEXT DEFAULT 'other' NOT NULL, knowledge_class TEXT DEFAULT 'VERIFIED_PERSONAL_FACT' NOT NULL,
    source_type TEXT NOT NULL, source_id TEXT, source_excerpt TEXT, source_location TEXT,
    verification_status TEXT DEFAULT 'proposed' NOT NULL, verified_at INTEGER, user_correction TEXT,
    confidence REAL DEFAULT 0.5 NOT NULL, allowed_as_personal_experience INTEGER DEFAULT false NOT NULL,
    sensitive INTEGER DEFAULT false NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    FOREIGN KEY (experience_id) REFERENCES professional_experiences(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS professional_claims_owner_status_idx ON professional_claims (user_id, verification_status, updated_at)`,
  `CREATE INDEX IF NOT EXISTS professional_claims_experience_idx ON professional_claims (experience_id, updated_at)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS professional_claims_source_text_idx ON professional_claims (user_id, source_type, source_id, claim_text)`,
  `CREATE TABLE IF NOT EXISTS claim_evidence (
    id TEXT PRIMARY KEY NOT NULL, claim_id TEXT NOT NULL, user_id TEXT NOT NULL, source_type TEXT NOT NULL,
    source_id TEXT, excerpt TEXT, location TEXT, confidence REAL DEFAULT 0.5 NOT NULL, created_at INTEGER NOT NULL,
    FOREIGN KEY (claim_id) REFERENCES professional_claims(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS claim_evidence_claim_idx ON claim_evidence (claim_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS claim_evidence_owner_idx ON claim_evidence (user_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS communication_profiles (
    user_id TEXT PRIMARY KEY NOT NULL, preferred_answer_length TEXT DEFAULT 'concise' NOT NULL,
    technical_depth TEXT DEFAULT 'balanced' NOT NULL, tone TEXT DEFAULT 'conversational' NOT NULL,
    first_person_style TEXT DEFAULT 'direct' NOT NULL, bullet_preference TEXT DEFAULT 'progressive' NOT NULL,
    explanation_depth TEXT DEFAULT 'adaptive' NOT NULL, vocabulary_preferences_json TEXT DEFAULT '[]' NOT NULL,
    updated_at INTEGER NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS interview_processes (
    id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, job_target_id TEXT, title TEXT NOT NULL,
    status TEXT DEFAULT 'active' NOT NULL, outcome TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (job_target_id) REFERENCES job_targets(id) ON DELETE SET NULL
  )`,
  `CREATE INDEX IF NOT EXISTS interview_processes_owner_idx ON interview_processes (user_id, updated_at)`,
  `CREATE TABLE IF NOT EXISTS interview_rounds (
    id TEXT PRIMARY KEY NOT NULL, process_id TEXT NOT NULL, user_id TEXT NOT NULL, name TEXT NOT NULL,
    interviewer_json TEXT DEFAULT '[]' NOT NULL, objective TEXT, status TEXT DEFAULT 'planned' NOT NULL,
    scheduled_at INTEGER, completed_at INTEGER, summary TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    FOREIGN KEY (process_id) REFERENCES interview_processes(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS interview_rounds_process_idx ON interview_rounds (process_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS interview_rounds_owner_idx ON interview_rounds (user_id, updated_at)`,
  `CREATE TABLE IF NOT EXISTS round_concerns (
    id TEXT PRIMARY KEY NOT NULL, round_id TEXT NOT NULL, user_id TEXT NOT NULL, category TEXT NOT NULL,
    summary TEXT NOT NULL, evidence TEXT, status TEXT DEFAULT 'proposed' NOT NULL,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    FOREIGN KEY (round_id) REFERENCES interview_rounds(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS round_concerns_round_idx ON round_concerns (round_id, status)`,
  `CREATE INDEX IF NOT EXISTS round_concerns_owner_idx ON round_concerns (user_id, updated_at)`,
  `CREATE TABLE IF NOT EXISTS experience_uses (
    id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, session_id TEXT NOT NULL, round_id TEXT,
    experience_id TEXT NOT NULL, claim_id TEXT, question_fingerprint TEXT NOT NULL, created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (round_id) REFERENCES interview_rounds(id) ON DELETE SET NULL,
    FOREIGN KEY (experience_id) REFERENCES professional_experiences(id) ON DELETE CASCADE,
    FOREIGN KEY (claim_id) REFERENCES professional_claims(id) ON DELETE SET NULL
  )`,
  `CREATE INDEX IF NOT EXISTS experience_uses_session_idx ON experience_uses (session_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS experience_uses_round_idx ON experience_uses (round_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS experience_uses_owner_idx ON experience_uses (user_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS session_brains (
    session_id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, source_version TEXT NOT NULL,
    payload_json TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS session_brains_owner_idx ON session_brains (user_id, expires_at)`,
  `CREATE TABLE IF NOT EXISTS session_captures (
    id TEXT PRIMARY KEY NOT NULL, session_id TEXT NOT NULL, user_id TEXT NOT NULL, kind TEXT NOT NULL,
    text TEXT NOT NULL, owner TEXT, due_at INTEGER, created_at INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS session_captures_timeline_idx ON session_captures (session_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS user_feature_flags (
    user_id TEXT NOT NULL, flag TEXT NOT NULL, enabled INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS user_feature_flags_unique_idx ON user_feature_flags (user_id, flag)`,
  `CREATE INDEX IF NOT EXISTS user_feature_flags_owner_idx ON user_feature_flags (user_id, updated_at)`,
  `CREATE TABLE IF NOT EXISTS desktop_authorizations (
    id TEXT PRIMARY KEY NOT NULL, device_code_hash TEXT NOT NULL UNIQUE, user_code_hash TEXT NOT NULL UNIQUE,
    device_name TEXT NOT NULL, app_version TEXT NOT NULL, status TEXT DEFAULT 'pending' NOT NULL,
    user_id TEXT, device_id TEXT, expires_at INTEGER NOT NULL, approved_at INTEGER, consumed_at INTEGER,
    created_at INTEGER NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE SET NULL
  )`,
  `CREATE INDEX IF NOT EXISTS desktop_authorizations_expiry_idx ON desktop_authorizations (status, expires_at)`,
  `CREATE INDEX IF NOT EXISTS desktop_authorizations_owner_idx ON desktop_authorizations (user_id, created_at)`,
];

const backfills = [
  `INSERT INTO professional_experiences (id,user_id,source_document_id,title,summary,verification_status,confidence,created_at,updated_at)
   SELECT lower(hex(randomblob(16))), d.user_id, d.id, 'Imported resume: ' || d.file_name,
     substr(coalesce(d.extracted_text, ''), 1, 1000), CASE WHEN d.parse_status = 'verified' THEN 'verified' ELSE 'proposed' END,
     CASE WHEN d.parse_status = 'verified' THEN 1.0 ELSE 0.6 END, d.created_at, d.updated_at
   FROM documents d WHERE d.kind = 'resume' AND json_valid(d.verified_facts_json)
     AND json_array_length(d.verified_facts_json) > 0
     AND NOT EXISTS (SELECT 1 FROM professional_experiences e WHERE e.source_document_id = d.id)`,
  `INSERT OR IGNORE INTO professional_claims (id,experience_id,user_id,claim_text,claim_type,knowledge_class,source_type,source_id,source_excerpt,verification_status,verified_at,confidence,allowed_as_personal_experience,sensitive,created_at,updated_at)
   SELECT lower(hex(randomblob(16))), e.id, d.user_id,
     CASE WHEN j.type = 'object' THEN json_extract(j.value, '$.claim') ELSE CAST(j.value AS text) END,
     'other', 'VERIFIED_PERSONAL_FACT', 'resume', d.id,
     CASE WHEN j.type = 'object' THEN json_extract(j.value, '$.evidence') ELSE CAST(j.value AS text) END,
     CASE WHEN d.parse_status = 'verified' THEN 'verified' ELSE 'proposed' END,
     CASE WHEN d.parse_status = 'verified' THEN d.updated_at ELSE NULL END,
     CASE WHEN d.parse_status = 'verified' THEN 1.0 ELSE 0.6 END,
     CASE WHEN d.parse_status = 'verified' THEN true ELSE false END, false, d.created_at, d.updated_at
   FROM documents d JOIN professional_experiences e ON e.source_document_id = d.id
   JOIN json_each(d.verified_facts_json) j WHERE d.kind = 'resume'
     AND trim(CASE WHEN j.type = 'object' THEN json_extract(j.value, '$.claim') ELSE CAST(j.value AS text) END) <> ''`,
  `INSERT INTO claim_evidence (id,claim_id,user_id,source_type,source_id,excerpt,confidence,created_at)
   SELECT lower(hex(randomblob(16))), c.id, c.user_id, c.source_type, c.source_id, c.source_excerpt, c.confidence, c.created_at
   FROM professional_claims c WHERE c.source_excerpt IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM claim_evidence e WHERE e.claim_id = c.id AND coalesce(e.excerpt, '') = coalesce(c.source_excerpt, ''))`,
];

async function ensureColumn(table: string, column: string, definition: string) {
  try {
    await env.DB.prepare(`SELECT ${column} FROM ${table} LIMIT 0`).run();
  } catch {
    try {
      await env.DB.prepare(`ALTER TABLE ${table} ADD ${column} ${definition}`).run();
    } catch {
      // Another isolate may have won the idempotent upgrade race.
      await env.DB.prepare(`SELECT ${column} FROM ${table} LIMIT 0`).run();
    }
  }
}

async function initializeRuntimeSchema() {
  if (!env.DB) throw new Error('Cloudflare D1 binding `DB` is unavailable.');
  await env.DB.batch(statements.map((statement) => env.DB.prepare(statement)));
  await ensureColumn('sessions', 'interview_round_id', 'TEXT REFERENCES interview_rounds(id) ON DELETE SET NULL');
  await ensureColumn('reports', 'notes_json', "TEXT DEFAULT '[]' NOT NULL");
  await ensureColumn('reports', 'action_items_json', "TEXT DEFAULT '[]' NOT NULL");
  await ensureColumn('reports', 'follow_up_email', 'TEXT');
  for (const statement of backfills) await env.DB.prepare(statement).run();
}

export async function ensureRuntimeSchema() {
  schemaReady ??= initializeRuntimeSchema().catch((error) => {
    schemaReady = undefined;
    throw error;
  });
  await schemaReady;
}
