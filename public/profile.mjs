export function initialState() {
  return {
    schemaVersion: 2, planOrigin: null,
    profile: { name: 'You', currentRole: '', targetRole: '', weeklyMinutes: 0, currentWeek: 1 },
    intake: { goal: '', targetRole: '' },
    resume: '', sources: [], skills: [], plan: null, attempts: [],
    applications: [], history: [], latestChange: null, strategy: '', question: null
  };
}

// Old example profiles are never carried into the personal experience.
// The caller keeps the original v1 storage entry untouched for recovery.
export function restoreProfile(serialized) {
  let saved;
  try { saved = JSON.parse(serialized); } catch { return initialState(); }
  if (!saved || ![1, 2].includes(saved.schemaVersion)) return initialState();
  if (saved.demo === true || saved.planOrigin === 'sample') return initialState();
  if (saved.schemaVersion === 1 && !saved.plan && !saved.resume &&
      !saved.sources?.length && !saved.applications?.length && !saved.attempts?.length) return initialState();
  const restored = {
    ...initialState(), ...saved, schemaVersion: 2,
    profile: { ...initialState().profile, ...saved.profile },
    intake: { goal: '', targetRole: saved.profile?.targetRole || saved.sources?.[0]?.title || '', ...saved.intake }
  };
  delete restored.demo;
  const applications = Array.isArray(restored.applications) ? restored.applications : [];
  restored.applications = applications.filter(a => !a.synthetic);
  if (restored.applications.length !== applications.length) restored.strategy = '';
  return restored;
}
