import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { careerToolRequestSchema, interviewModes, jobApplicationCreateSchema, jobApplicationUpdateSchema, responseStyles, suggestionRequestSchema } from '@interview-copilot/contracts';
import { careerToolInstructions } from '../lib/prompts';

test('general copilot modes and live response controls remain contract-backed', () => {
  for (const mode of ['meeting', 'sales', 'presentation', 'study', 'general', 'custom'] as const) {
    assert.equal(interviewModes.includes(mode), true);
  }
  assert.deepEqual(responseStyles, ['adaptive', 'bullets', 'paragraph']);
  assert.equal(suggestionRequestSchema.safeParse({
    question: 'Turn this discussion into next steps.', mode: 'meeting', locale: 'en', transcript: [], verifiedFacts: [], target: {},
    responseStyle: 'bullets', responseMode: 'detailed', action: 'action-items',
  }).success, true);
});

test('career tool inputs are bounded and job applications remain explicit records', () => {
  assert.equal(careerToolRequestSchema.safeParse({ kind: 'cover-letter', role: 'Designer', company: 'Northstar' }).success, true);
  assert.equal(jobApplicationCreateSchema.safeParse({ role: 'Designer', company: 'Northstar', status: 'saved' }).success, true);
  assert.equal(jobApplicationUpdateSchema.safeParse({}).success, false);
  assert.equal(jobApplicationUpdateSchema.safeParse({ status: 'applied' }).success, true);
});

test('career prompts prohibit invented candidate facts', () => {
  const prompt = careerToolInstructions({ kind: 'resume-build', locale: 'en', tone: 'confident' }, ['Led a verified launch']);
  assert.match(prompt, /Never invent candidate experience/);
  assert.match(prompt, /Led a verified launch/);
});

test('expanded migration persists artifacts, job pipeline, notes, and follow-up drafts', async () => {
  const migration = await readFile(new URL('../drizzle/0001_harsh_gargoyle.sql', import.meta.url), 'utf8');
  assert.match(migration, /CREATE TABLE `career_artifacts`/);
  assert.match(migration, /CREATE TABLE `job_applications`/);
  assert.match(migration, /ADD `notes_json`/);
  assert.match(migration, /ADD `follow_up_email`/);
});
