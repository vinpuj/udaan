export const clone = value => structuredClone(value);
export const uid = prefix => prefix + '-' + crypto.randomUUID().slice(0, 8);
export const minutes = value => Math.max(0, Math.min(10080, Math.round(Number(value) || 0)));
export const safeUrl = value => {
  try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) ? u.href : ''; }
  catch { return ''; }
};
export const totalMinutes = tasks => tasks.reduce((n, t) => n + minutes(t.minutes), 0);
export function historyEvent(state, title, detail, kind = 'update') {
  state.history.unshift({ id: uid('event'), title, detail, kind, at: new Date().toISOString() });
  state.history = state.history.slice(0, 40);
}
export function normalizePlan(result, sources) {
  const sourceIds = new Set(sources.map(s => s.id));
  const cap = minutes(result.profile.weeklyMinutes);
  const skills = result.skills.map((s, i) => ({
    ...s, id: 'skill-' + i, sourceIds: s.sourceIds.filter(id => sourceIds.has(id))
  }));
  const plan = {
    summary: result.summary,
    project: result.project,
    weeks: result.weeks.map((w, i) => ({
      week: i + 1, focus: w.focus, capacityMinutes: cap,
      tasks: w.tasks.map(t => ({ ...t, id: uid('task'), minutes: Math.max(5, minutes(t.minutes)), done: false }))
    })),
    backlog: [], version: 1
  };
  fitAllWeeks(plan);
  return {
    profile: { ...result.profile, weeklyMinutes: cap, currentWeek: 1 },
    skills, plan
  };
}
export function fitWeek(plan, week) {
  const completed = week.tasks.filter(t => t.done);
  let used = totalMinutes(completed);
  const kept = [...completed];
  for (const task of week.tasks.filter(t => !t.done)) {
    if (used + task.minutes <= week.capacityMinutes) { kept.push(task); used += task.minutes; }
    else {
      const deferred = { ...task, fromWeek: week.week, reason: 'Moved out of week ' + week.week + ' to respect your time budget.' };
      if (!plan.backlog.some(t => t.id === task.id)) plan.backlog.push(deferred);
    }
  }
  week.tasks = kept;
  week.overCapacityCompleted = Math.max(0, used - week.capacityMinutes);
}
export function fitAllWeeks(plan) {
  for (const week of plan.weeks) fitWeek(plan, week);
}
export function applyAssessment(state, assessment, question, answer) {
  const next = clone(state);
  const attempt = {
    ...assessment, id: uid('attempt'), question: clone(question), answer,
    at: new Date().toISOString(),
    score: assessment.rubric.reduce((n, r) => n + Math.max(0, Math.min(2, Math.round(r.score))), 0),
    maxScore: assessment.rubric.length * 2
  };
  next.attempts.unshift(attempt);
  const related = next.skills.find(s => s.id === assessment.skillId);
  if (related) {
    related.status = assessment.needsPractice ? 'practice_needed' : 'practised';
    related.evidence = assessment.evidence;
    related.nextAction = assessment.nextPractice;
  }
  if (assessment.needsPractice && next.plan) {
    const week = next.plan.weeks.find(w => w.week >= next.profile.currentWeek && w.tasks.some(t => !t.done))
      || next.plan.weeks.find(w => w.week >= next.profile.currentWeek);
    if (week) {
      const task = { id: uid('task'), title: assessment.nextPractice, minutes: 45, skill: question.skill, done: false };
      week.tasks = [...week.tasks.filter(t => t.done), task, ...week.tasks.filter(t => !t.done)];
      fitWeek(next.plan, week);
    }
    if (assessment.projectCheck && !next.plan.project.checks.includes(assessment.projectCheck)) {
      next.plan.project.checks.push(assessment.projectCheck);
    }
    next.plan.version++;
  }
  next.latestChange = { title: assessment.needsPractice ? 'Your practice plan has changed' : 'A stronger answer, saved as evidence', reason: assessment.summary, changes: [assessment.nextPractice] };
  historyEvent(next, 'Interview evidence saved', assessment.summary, 'interview');
  return next;
}
export function applyProgress(state, update) {
  const next = clone(state);
  const before = clone(next.plan);
  const completeIds = new Set(update.completedTaskIds);
  for (const w of next.plan.weeks) for (const t of w.tasks) if (completeIds.has(t.id)) t.done = true;
  for (const t of next.plan.backlog) if (completeIds.has(t.id)) t.done = true;
  const newIds = new Set();
  for (const replacement of update.weekUpdates) {
    const week = next.plan.weeks.find(w => w.week === replacement.week);
    if (!week) continue;
    week.capacityMinutes = minutes(replacement.capacityMinutes);
    week.focus = replacement.focus;
    const completed = week.tasks.filter(t => t.done);
    const oldPending = week.tasks.filter(t => !t.done);
    const replacementIds = new Set(replacement.tasks.map(t => t.existingTaskId).filter(Boolean));
    for (const t of oldPending) {
      if (!replacementIds.has(t.id) && !next.plan.backlog.some(b => b.id === t.id)) {
        next.plan.backlog.push({ ...t, fromWeek: week.week, reason: 'Deferred after your spoken update.' });
      }
    }
    const completedIds = new Set(completed.map(t => t.id));
    const pending = replacement.tasks.filter(t => !completedIds.has(t.existingTaskId)).map(t => {
      const known = oldPending.find(p => p.id === t.existingTaskId);
      const id = known?.id || uid('task');
      if (newIds.has(id)) return null;
      newIds.add(id);
      return { id, title: t.title, minutes: Math.max(5, minutes(t.minutes)), skill: t.skill, done: false };
    }).filter(Boolean);
    next.plan.backlog = next.plan.backlog.filter(t => !newIds.has(t.id));
    week.tasks = [...completed, ...pending];
    fitWeek(next.plan, week);
  }
  next.plan.version++;
  const over = next.plan.weeks.filter(w => w.overCapacityCompleted > 0);
  next.latestChange = {
    title: 'A plan that fits your week',
    reason: update.explanation + (over.length ? ' Completed work already exceeds the new limit; it has been preserved and no further work is scheduled there.' : ''),
    changes: update.changes, before, after: clone(next.plan)
  };
  historyEvent(next, 'Learning plan updated', update.explanation, 'progress');
  return next;
}
export function applicationCounts(applications) {
  const result = {};
  for (const app of applications) {
    const g = app.group || 'Other roles';
    result[g] ||= { total: 0, invited: 0, rejected: 0, pending: 0, offers: 0 };
    result[g].total++;
    if (app.status === 'interview_invited') result[g].invited++;
    else if (app.status === 'rejected') result[g].rejected++;
    else if (app.status === 'offer') { result[g].offers++; result[g].invited++; }
    else result[g].pending++;
  }
  return result;
}
export function applyApplication(state, parsed) {
  const next = clone(state);
  if (parsed.action === 'clarify') return { state: next, changed: false, message: parsed.explanation };
  let app = next.applications.find(a => a.id === parsed.applicationId);
  if (!app && parsed.action === 'update') return { state: next, changed: false, message: 'I could not identify that application. Choose its row or include the employer and role.' };
  if (!app && parsed.action === 'add') {
    app = next.applications.find(a => a.company.toLowerCase() === parsed.company.toLowerCase() && a.role.toLowerCase() === parsed.role.toLowerCase());
    if (!app) {
      app = { id: uid('application'), company: parsed.company, role: parsed.role, group: parsed.group, status: parsed.status };
      next.applications.unshift(app);
    }
  }
  const changed = app.status !== parsed.status || parsed.action === 'add';
  app.status = parsed.status;
  if (parsed.group) app.group = parsed.group;
  if (changed) historyEvent(next, 'Application updated', app.company + ' · ' + parsed.status.replaceAll('_', ' '), 'application');
  next.strategy = strategyFromCounts(next.applications);
  return { state: next, changed, message: changed ? parsed.explanation : 'That status is already saved. Your counts have stayed the same.' };
}
export function strategyFromCounts(applications) {
  const counts = applicationCounts(applications);
  const ranked = Object.entries(counts).sort((a, b) => b[1].invited - a[1].invited);
  if (!ranked.length) return 'Add applications and their outcomes to see which kinds of roles respond.';
  if (!ranked[0][1].invited) return 'No interview invitations recorded yet. Keep pending applications separate and review this after more outcomes arrive.';
  if (ranked.length > 1 && ranked[0][1].invited === ranked[1][1].invited) return 'These role groups have the same invitation count so far. Keep testing your options; this sample does not identify a clear direction.';
  const [group, c] = ranked[0];
  return 'Test more ' + group.replaceAll('_', ' ') + ' roles in your next search. This group has ' + c.invited + ' invitation' + (c.invited === 1 ? '' : 's') + ' from ' + c.total + ' recorded applications. Early signal only: continue developing your skills and gathering outcomes.';
}
