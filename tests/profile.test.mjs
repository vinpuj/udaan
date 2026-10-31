import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, restoreProfile } from '../public/profile.mjs';

test('a new user starts without an assumed role, resume, history or question', () => {
  const user = initialState();
  assert.equal(user.profile.name, 'You');
  assert.equal(user.profile.targetRole, '');
  assert.equal(user.profile.weeklyMinutes, 0);
  assert.equal(user.resume, '');
  assert.equal(user.plan, null);
  assert.equal(user.question, null);
  for (const key of ['sources', 'skills', 'applications', 'attempts', 'history']) assert.deepEqual(user[key], []);
  user.sources.push({ id: 'personal-source' });
  assert.deepEqual(initialState().sources, [], 'Profiles must not share mutable collections');
});

test('a saved example is excluded even if AI generated a new plan from it', () => {
  const example = {
    schemaVersion: 1, demo: true, planOrigin: 'ai',
    profile: { name: 'Legacy example' }, resume: 'Example background',
    plan: { weeks: [{ tasks: [{ done: true }] }] },
    applications: [{ company: 'Seed employer', synthetic: true }],
    attempts: [{ summary: 'Example feedback' }]
  };
  assert.deepEqual(restoreProfile(JSON.stringify(example)), initialState());
  assert.deepEqual(restoreProfile(JSON.stringify({ ...example, demo: false, planOrigin: 'sample' })), initialState());
});

test('migration preserves a personal plan, completed work, practice and real applications', () => {
  const personal = {
    ...initialState(), schemaVersion: 1, demo: false,
    profile: { name: 'Learner', currentRole: 'Designer', targetRole: 'Product designer', weeklyMinutes: 120, currentWeek: 2 },
    resume: 'My own experience',
    sources: [{ id: 'my-source', text: 'User supplied role requirements' }],
    planOrigin: 'ai',
    plan: { version: 3, weeks: [{ week: 1, tasks: [{ id: 'portfolio', done: true }] }] },
    attempts: [{ id: 'answer-1', score: 4 }],
    applications: [{ id: 'application-1', company: 'My employer', status: 'interview_invited' }]
  };
  const restored = restoreProfile(JSON.stringify(personal));
  for (const key of ['profile', 'resume', 'sources', 'plan', 'attempts', 'applications']) {
    assert.deepEqual(restored[key], personal[key]);
  }
  assert.equal(restored.schemaVersion, 2);
  assert.equal(Object.hasOwn(restored, 'demo'), false);
  assert.deepEqual(restoreProfile(JSON.stringify(restored)), restored);
});

test('old empty profiles lose the old default career and study budget', () => {
  const oldEmpty = { ...initialState(), schemaVersion: 1, profile: { targetRole: 'Data analyst', weeklyMinutes: 360 } };
  assert.deepEqual(restoreProfile(JSON.stringify(oldEmpty)), initialState());
});

test('synthetic application rows do not contaminate a personal tracker', () => {
  const personal = { ...initialState(), applications: [
    { id: 'real', company: 'User added employer' },
    { id: 'old-seed', company: 'Seed employer', synthetic: true }
  ], strategy: 'Suggestion from outdated counts' };
  const restored = restoreProfile(JSON.stringify(personal));
  assert.deepEqual(restored.applications, [personal.applications[0]]);
  assert.equal(restored.strategy, '');
});

test('missing or unreadable storage opens a fresh personal profile', () => {
  for (const value of [null, '', '{broken', 'null', '{"schemaVersion":99}']) {
    assert.deepEqual(restoreProfile(value), initialState());
  }
});
