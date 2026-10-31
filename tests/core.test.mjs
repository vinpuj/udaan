import test from 'node:test';
import assert from 'node:assert/strict';
import { applyProgress, applyAssessment, applyApplication, applicationCounts, fitAllWeeks, normalizePlan, totalMinutes, safeUrl } from '../public/core.mjs';

function fixture() {
  return {
    profile: { name: 'Learner', currentWeek: 1, weeklyMinutes: 360 },
    skills: [{ id: 'sql', name: 'SQL joins', status: 'not_assessed', evidence: '', nextAction: '' }],
    attempts: [], history: [], latestChange: null,
    applications: [
      { id: 'harbor', company: 'Harbor', role: 'BI Analyst', group: 'reporting', status: 'interview_invited' },
      { id: 'cedar', company: 'Cedar', role: 'BI Analyst', group: 'reporting', status: 'applied' },
      { id: 'maple', company: 'Maple', role: 'BI Analyst', group: 'reporting', status: 'rejected' },
      { id: 'vector', company: 'Vector', role: 'Data Analyst', group: 'python', status: 'rejected' },
      { id: 'orbit', company: 'Orbit', role: 'Data Analyst', group: 'python', status: 'rejected' },
      { id: 'pine', company: 'Pine', role: 'Data Analyst', group: 'python', status: 'applied' }
    ],
    plan: { version: 1, backlog: [], project: { checks: [] }, weeks: [
      { week: 1, focus: 'Foundations', capacityMinutes: 360, tasks: [
        { id: 'select', title: 'SELECT exercises', minutes: 60, skill: 'SQL', done: false },
        { id: 'group', title: 'GROUP BY exercises', minutes: 60, skill: 'SQL', done: false },
        { id: 'joins', title: 'Join practice', minutes: 240, skill: 'SQL', done: false }
      ] },
      { week: 2, focus: 'Project', capacityMinutes: 360, tasks: [
        { id: 'project', title: 'Dashboard', minutes: 180, skill: 'BI', done: false },
        { id: 'python', title: 'Python introduction', minutes: 180, skill: 'Python', done: false }
      ] },
      { week: 3, focus: 'Portfolio', capacityMinutes: 360, tasks: [
        { id: 'report', title: 'Write the report', minutes: 360, skill: 'Portfolio', done: false }
      ] }
    ] }
  };
}
test('spoken progress preserves completions and changes only the requested week', () => {
  const s = fixture();
  const result = applyProgress(s, {
    completedTaskIds: ['select', 'group'],
    weekUpdates: [{ week: 2, focus: 'Join reasoning', capacityMinutes: 180, tasks: [
      { existingTaskId: '', title: 'LEFT JOIN practice', minutes: 90, skill: 'SQL' },
      { existingTaskId: '', title: 'Customer mini-case', minutes: 60, skill: 'SQL' },
      { existingTaskId: '', title: 'Follow-up interview', minutes: 30, skill: 'SQL' }
    ] }],
    explanation: 'Next week has three hours.', changes: ['Prioritised joins']
  });
  assert.equal(result.plan.weeks[0].capacityMinutes, 360);
  assert.equal(result.plan.weeks[0].tasks.filter(t => t.done).length, 2);
  assert.equal(result.plan.weeks[1].capacityMinutes, 180);
  assert.equal(totalMinutes(result.plan.weeks[1].tasks), 180);
  assert.deepEqual(result.plan.weeks[2], s.plan.weeks[2]);
  assert.deepEqual(result.plan.backlog.map(t => t.id), ['project', 'python']);
  assert.equal(s.plan.weeks[0].tasks[0].done, false, 'Does not mutate the previous version');
});
test('overflow becomes visible backlog, never hidden overbooking', () => {
  const s = fixture(); s.plan.weeks[1].capacityMinutes = 100;
  fitAllWeeks(s.plan);
  assert.equal(totalMinutes(s.plan.weeks[1].tasks), 0);
  assert.equal(s.plan.backlog.length, 2);
});
test('completed work survives a capacity lower than time already spent', () => {
  const s = fixture(); s.plan.weeks[0].tasks[0].done = true;
  const next = applyProgress(s, {
    completedTaskIds: [], weekUpdates: [{ week: 1, focus: 'Rest', capacityMinutes: 30, tasks: [] }],
    explanation: 'Time decreased.', changes: []
  });
  assert.equal(next.plan.weeks[0].tasks[0].id, 'select');
  assert.equal(next.plan.weeks[0].overCapacityCompleted, 30);
});
test('interview evidence updates the related gap and queues targeted practice', () => {
  const s = fixture();
  const result = applyAssessment(s, {
    skillId: 'sql', needsPractice: true, summary: 'Inner join loses customers.',
    evidence: 'inner join keeps everyone', nextPractice: 'Practise LEFT JOIN',
    projectCheck: 'Keep zero-order customers',
    rubric: [{ score: 0 }, { score: 2 }, { score: 0 }]
  }, { skill: 'SQL joins' }, 'inner join keeps everyone');
  assert.equal(result.attempts[0].score, 2);
  assert.equal(result.skills[0].status, 'practice_needed');
  assert.equal(result.plan.weeks[0].tasks[0].title, 'Practise LEFT JOIN');
  assert.ok(totalMinutes(result.plan.weeks[0].tasks) <= 360);
  assert.ok(result.plan.project.checks.includes('Keep zero-order customers'));
});
test('a correct answer is stored as practice evidence without scheduling remedial work', () => {
  const s = fixture();
  const result = applyAssessment(s, {
    skillId: 'sql', needsPractice: false, summary: 'Correct explanation.', evidence: 'LEFT JOIN',
    nextPractice: 'Try a new case', projectCheck: '', rubric: [{ score: 2 }, { score: 2 }, { score: 2 }]
  }, { skill: 'SQL joins' }, 'LEFT JOIN and COALESCE');
  assert.equal(result.skills[0].status, 'practised');
  assert.deepEqual(result.plan, s.plan);
});
test('repeated application updates are idempotent and pending is not rejected', () => {
  const update = { action: 'update', applicationId: 'cedar', status: 'interview_invited', group: 'reporting', explanation: 'Invitation received.' };
  const first = applyApplication(fixture(), update);
  const second = applyApplication(first.state, update);
  assert.equal(first.changed, true); assert.equal(second.changed, false);
  assert.equal(second.state.applications.length, 6);
  assert.equal(second.state.history.length, 1);
  const counts = applicationCounts(second.state.applications);
  assert.deepEqual(counts.reporting, { total: 3, invited: 2, rejected: 1, pending: 0, offers: 0 });
  assert.deepEqual(counts.python, { total: 3, invited: 0, rejected: 2, pending: 1, offers: 0 });
});
test('an unknown application requests clarification without changing records', () => {
  const s = fixture();
  const r = applyApplication(s, { action: 'update', applicationId: 'unknown', status: 'rejected' });
  assert.equal(r.changed, false); assert.deepEqual(r.state.applications, s.applications);
});
test('source normalization drops invented source IDs and enforces capacity', () => {
  const result = normalizePlan({
    profile: { weeklyMinutes: 60 }, summary: 'Plan',
    skills: [{ sourceIds: ['real', 'invented'] }],
    weeks: [{ focus: 'SQL', tasks: [{ title: 'Practice', minutes: 60 }, { title: 'More', minutes: 60 }] }],
    project: {}
  }, [{ id: 'real' }]);
  assert.deepEqual(result.skills[0].sourceIds, ['real']);
  assert.equal(result.plan.weeks[0].tasks.length, 1);
  assert.equal(result.plan.backlog.length, 1);
});
test('source links permit only ordinary web URLs', () => {
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.equal(safeUrl('https://example.com/job'), 'https://example.com/job');
});
