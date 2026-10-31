import { clone, uid, safeUrl, normalizePlan, applyAssessment, applyProgress, applicationCounts, applyApplication, strategyFromCounts, historyEvent, totalMinutes } from './core.mjs';
import { restoreProfile } from './profile.mjs';
import { readResume } from './resume.mjs';

const $ = selector => document.querySelector(selector);
const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const paths = {
  spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  mic: '<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  plan: '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8m-8 4h8m-8 4h5"/>',
  briefcase: '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V3h8v4M3 12a22 22 0 0 0 18 0M10 13h4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4Z"/>',
  external: '<path d="M14 3h7v7m0-7L10 14M10 4H4v16h16v-6"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>',
  refresh: '<path d="M20 7a9 9 0 1 0 0 10M20 3v5h-5"/>',
  leaf: '<path d="M5 18C0 9 8 3 21 3c0 13-6 21-15 16M5 20 16 9"/>',
  book: '<path d="M12 5C7 2 3 3 3 3v17s5-1 9 2c4-3 9-2 9-2V3s-4-1-9 2Zm0 0v17"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="3" fill="currentColor"/><circle cx="16" cy="17" r="3" fill="currentColor"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Zm-4 9 3 3 5-6"/>'
};
const icon = name => '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[name] || paths.spark) + '</svg>';
const badge = (text, cls = '') => '<span class="badge ' + cls + '">' + esc(text) + '</span>';
const button = (text, action, cls = 'secondary', ico = '') => '<button class="btn ' + cls + '" data-action="' + action + '"' + (busy ? ' disabled' : '') + '>' + (ico ? icon(ico) : '') + text + '</button>';
const duration = n => n >= 60 ? (Math.round(n / 6) / 10) + 'h' : n + ' min';
const statusLabels = { reported: 'Experience reported', not_assessed: 'Not assessed', practice_needed: 'Needs practice', practised: 'Practised' };
const appLabels = { applied: 'Awaiting response', interview_invited: 'Interview invited', rejected: 'Not selected', offer: 'Offer received' };
const STORAGE_PREFIX = new URLSearchParams(location.search).has('qa') ? 'udaan-qa-state' : 'udaan-state';
const STORAGE = STORAGE_PREFIX + '-v2';
let state, tab = 'plan', showPlan = false, weekTab = 1, busy = '', error = '';
let drafts = { goal: '', targetRole: '', progress: '', answer: '', application: '' };
let toastTimer;
let resumeImport = { busy: false, error: '', notice: '' };


function persist() {
  try { localStorage.setItem(STORAGE, JSON.stringify(state)); }
  catch { error = 'Your browser could not save this profile. Export your progress before closing the page.'; }
}
function toast(message) {
  clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').classList.add('show');
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 5500);
}
async function api(action, payload) {
  const res = await fetch('/api/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'That did not work. Please try again.');
  return json.result;
}
async function run(label, fn) {
  if (busy) return;
  busy = label; error = ''; render();
  try { await fn(); persist(); }
  catch (e) { error = e.message || 'Something went wrong. Your input is preserved.'; }
  finally { busy = ''; render(); }
}
function art() {
  return '<svg class="hero-art" viewBox="0 0 180 145" fill="none" aria-hidden="true"><circle cx="101" cy="74" r="60" fill="#f1ede0"/><circle cx="101" cy="74" r="46" stroke="#dedfcf" stroke-dasharray="3 5"/><path d="M12 119c38 12 68-5 70-30" stroke="#bdc6af" stroke-width="1.5" stroke-dasharray="4 5"/><path d="m58 65 91-37-35 84-19-32Z" fill="#df633b"/><path d="m95 80 54-52-40 59-14 25Z" fill="#efab7e"/><path d="m58 65 37 15 54-52" stroke="#f6d8bd" stroke-width="1.3"/><path d="m32 50 2 6 6 2-6 2-2 6-2-6-6-2 6-2Z" fill="#c7d2b3"/><circle cx="157" cy="106" r="3" fill="#ddb98c"/><circle cx="77" cy="14" r="2.5" fill="#b9c6a3"/></svg>';
}
function header() {
  return '<header class="topbar"><button class="brand" data-action="nav-plan" aria-label="Udaan home"><img src="/mark.svg" alt=""><span class="brand-text">udaan<small>A NEW DIRECTION</small></span></button>' +
    '<nav class="nav" aria-label="Main navigation">' +
    [['plan', 'plan', 'Plan'], ['practice', 'mic', 'Practice'], ['applications', 'briefcase', 'Applications']].map(([id, ico, text]) => '<button data-action="nav-' + id + '" class="' + (tab === id ? 'active' : '') + '" aria-current="' + (tab === id ? 'page' : 'false') + '">' + text + '</button>').join('') +
    '</nav><div class="top-actions" aria-hidden="true"></div></header>';
}
function hero(eyebrow, title, subtitle) {
  return '<section class="hero"><div><div class="eyebrow"><span class="line"></span>' + eyebrow + '</div><h1>' + title.replaceAll('<br>', '<br> ') + '</h1><p>' + subtitle + '</p></div>' + art() + '</section>';
}
function sourceCard(s, compact = false) {
  const url = safeUrl(s.url);
  const name = s.company || s.title;
  return '<div class="source"><div class="source-top"><div class="source-name"><span class="company-icon">' + esc(name.slice(0, 2).toUpperCase()) + '</span><div><h3>' + esc(name) + '</h3>' + (s.company ? '<span class="tiny muted">' + esc(s.title) + '</span>' : '') + '</div></div>' + (!compact ? '<button class="icon-btn" data-action="edit-source" data-id="' + esc(s.id) + '" aria-label="Edit ' + esc(name) + '">' + icon('plan') + '</button>' : '') + '</div>' +
    (!compact && s.text ? '<p>' + esc(s.text) + '</p>' : '') +
    (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">View employer source ' + icon('external') + '</a>' : '') +
    '<div class="tiny muted" style="margin-top:5px">' + esc(s.kind || 'Provided job description') + '</div></div>';
}
function voiceInput(id, placeholder, value, rows = 4) {
  return '<div class="voicebox"><textarea id="' + id + '" rows="' + rows + '" placeholder="' + esc(placeholder) + '" aria-label="' + esc(placeholder) + '">' + esc(value) + '</textarea><div class="voice-hint">' + icon('mic') + 'Click here, then use Wispr Flow to speak. Review your words before submitting.</div></div>';
}
function flightMark() {
  return '<svg class="flight-line" viewBox="0 0 300 80" fill="none" aria-hidden="true"><path class="flight-trail" d="M9 61h163c38 0 67-10 86-31"/><path class="flight-glint" pathLength="100" d="M9 61h163c38 0 67-10 86-31"/><circle cx="9" cy="61" r="2.5" fill="currentColor"/><path class="flight-plane" d="m254 23 24-10-10 25-4-10-10-5Zm10 5 14-15"/><path class="flight-spark" d="m298 14 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z"/><path class="flight-spark flight-spark-small" d="m285 45 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z"/><path class="flight-spark flight-spark-far" d="m315 43 1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5Z"/></svg>';
}
function directionInput(update = false) {
  const id = update ? 'progress' : 'goal';
  const ready = update ? drafts.progress.trim() : drafts.targetRole.trim();
  return '<div class="direction-input' + (ready ? ' has-words' : '') + '">' +
    (update ? '<label class="sr-only" for="progress">Tell Udaan what changed</label>' : '<label class="intake-label" for="goal">Tell me about yourself <span>(optional)</span></label>') +
    '<textarea id="' + id + '" class="direction-text" rows="2" maxlength="12000" aria-describedby="direction-hint" placeholder="' +
    (update ? 'Finished something? Have less time this week? Just say it…' : 'Your education, experience, interests, or time to learn. Just say it…') + '">' + esc(drafts[id]) + '</textarea>' +
    (!update ? '<div class="intake-role"><label class="intake-label" for="targetRole">Target role</label><input id="targetRole" type="text" required pattern=".*\\S.*" maxlength="200" placeholder="What role would you like to work towards?" value="' + esc(drafts.targetRole) + '"></div>' : '') +
    '<div class="direction-controls"><span class="direction-voice" id="direction-hint">' + icon('mic') + 'Speak with Wispr Flow, or type</span>' +
    '<button class="direction-submit" data-action="' + (update ? 'progress' : 'generate-plan') + '"' + (!ready || busy ? ' disabled' : '') + '>' +
    (update ? 'Adjust my plan' : 'Find my direction') + icon('arrow') + '</button></div></div>';
}
function contextLabel() {
  const parts = [];
  if (state.resume.trim()) parts.push('Resume');
  if (state.sources.length) parts.push(state.sources.length + ' job ' + (state.sources.length === 1 ? 'reference' : 'references'));
  return parts.length ? parts.join(' + ') : 'Add resume or job details (optional)';
}
function setup() {
  return '<section class="launch" aria-label="Find your direction"><div class="launch-center">' +
    '<div class="launch-signature"><h1>udaan<span class="sr-only"> — your next chapter</span></h1>' + flightMark() + '</div>' +
    '<p class="launch-question">Where do you want to go next?</p>' +
    '<div class="launch-demo"><button class="demo-action" data-action="watch-demo" aria-haspopup="dialog">' + icon('play') + 'Watch demo</button></div>' +
    directionInput() +
    '<div class="direction-extras"><button class="quiet-action" data-action="edit-profile">' + icon('plus') + esc(contextLabel()) + '</button>' +
    (state.plan ? '<button class="quiet-action saved-plan-action" data-action="view-plan">View saved plan ' + icon('arrow') + '</button>' : '') + '</div>' +
    '<p class="intake-privacy">Your details are sent to Google Gemini when you ask for coaching.</p></div><p class="launch-bottom">You don’t need to have it all figured out.</p></section>';
}
function profileCard() {
  return '<section class="card"><div class="profile"><div class="avatar">' + esc(state.profile.name.slice(0, 1)) + '</div><div><strong>' + esc(state.profile.name) + '</strong><span>' + esc(state.profile.currentRole || 'Your next chapter') + '</span></div></div>' +
    '<div class="mini-info"><span>Working towards</span><strong>' + esc(state.profile.targetRole) + '</strong></div><div class="mini-info"><span>Usual study time</span><strong>' + duration(state.profile.weeklyMinutes) + ' / week</strong></div>' +
    '<div class="mini-info"><label for="current-week">Current week</label><select id="current-week" aria-label="Current learning week">' + state.plan.weeks.map(w => '<option value="' + w.week + '"' + (w.week === state.profile.currentWeek ? ' selected' : '') + '>Week ' + w.week + '</option>').join('') + '</select></div>' +
    '<div style="margin-top:16px">' + badge('Saved on this browser', 'green') + '</div></section>';
}
function historyCard() {
  return '<section class="card"><div class="card-head"><div><h2>Growing with you</h2><p>What changed, and why.</p></div>' + icon('leaf') + '</div>' +
    (state.history.length ? state.history.slice(0, 5).map(e => '<div class="history-item"><strong>' + esc(e.title) + '</strong><p>' + esc(e.detail) + '</p><time>' + new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '</time></div>').join('') : '<p class="small-text muted">Your interview insights and progress updates will appear here.</p>') + '</section>';
}
function skillCard() {
  return '<section class="card"><div class="card-head"><div><h2>Your skills, with evidence</h2><p>A useful starting point, not a readiness score.</p></div>' + badge(state.sources.length + ' job sources') + '</div>' +
    '<table class="skill-table"><thead><tr><th>Skill</th><th>Where you are</th><th>Your next move</th></tr></thead><tbody>' +
    state.skills.map(s => '<tr><td>' + esc(s.name) + '<div>' + s.sourceIds.map(id => { const source = state.sources.find(x => x.id === id); const u = safeUrl(source?.url); return source ? (u ? '<a class="source-ref" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(source.company || source.title) + icon('external') + '</a>' : '<span class="source-ref">' + esc(source.company || source.title) + '</span>') : ''; }).join('') + '</div></td><td>' + badge(statusLabels[s.status] || s.status, s.status === 'practice_needed' ? 'orange' : s.status === 'practised' ? 'green' : '') + '<div class="evidence">' + esc(s.evidence) + '</div></td><td><span class="small-text">' + esc(s.nextAction) + '</span></td></tr>').join('') +
    '</tbody></table></section>';
}
function weekCard() {
  const w = state.plan.weeks.find(x => x.week === weekTab) || state.plan.weeks[0];
  const used = totalMinutes(w.tasks);
  return '<section class="card"><div class="card-head"><div><h2>Your learning path</h2><p>Small steps. Space for real life.</p></div>' + badge('Plan v' + state.plan.version) + '</div><div class="week-tabs">' +
    state.plan.weeks.map(x => '<button class="week-tab ' + (x.week === w.week ? 'active' : '') + '" data-action="week" data-id="' + x.week + '">Week ' + x.week + '<small>' + duration(x.capacityMinutes) + ' available</small></button>').join('') +
    '</div><div class="week-title"><h3>' + esc(w.focus) + '</h3><span class="capacity">' + duration(used) + ' / ' + duration(w.capacityMinutes) + '</span></div>' +
    w.tasks.map(t => '<div class="task ' + (t.done ? 'done' : '') + '"><button class="task-check ' + (t.done ? 'done' : '') + '" data-action="task" data-id="' + esc(t.id) + '" aria-label="' + (t.done ? 'Mark incomplete: ' : 'Complete: ') + esc(t.title) + '" aria-pressed="' + t.done + '">' + (t.done ? icon('check') : '') + '</button><div class="task-copy"><strong>' + esc(t.title) + '</strong><small>' + esc(t.skill) + '</small></div><span class="task-time">' + duration(t.minutes) + '</span></div>').join('') +
    (!w.tasks.length ? '<p class="empty-small">Space to breathe. Add a progress update to plan your next step.</p>' : '') +
    '<div class="progress-track"><i style="width:' + Math.min(100, used / Math.max(1, w.capacityMinutes) * 100) + '%"></i></div>' +
    (w.overCapacityCompleted ? '<p class="tiny muted" style="margin-top:8px">Completed work already exceeds the new capacity. Your completed record is preserved.</p>' : '') +
    (state.plan.backlog.length ? '<details class="backlog"><summary>' + state.plan.backlog.length + ' deferred tasks · milestones may move</summary>' + state.plan.backlog.map(t => '<p>' + esc(t.title) + ' · ' + duration(t.minutes) + '<br><span class="tiny">' + esc(t.reason) + '</span></p>').join('') + '</details>' : '') + '</section>';
}
function projectCard() {
  const p = state.plan.project;
  return '<section class="project-card"><span class="section-label">YOUR PORTFOLIO PROJECT</span><h3>' + esc(p.title) + '</h3><p>' + esc(p.description) + '</p><div class="chips">' + p.skills.map(s => '<span class="chip">' + esc(s) + '</span>').join('') + '</div>' +
    p.deliverables.map(d => '<div class="deliverable">' + icon('check') + '<span>' + esc(d) + '</span></div>').join('') +
    '<details style="margin-top:16px"><summary class="tiny muted" style="cursor:pointer">What good work looks like</summary>' + p.checks.map(c => '<div class="deliverable">' + icon('shield') + '<span>' + esc(c) + '</span></div>').join('') + '</details></section>';
}
function changeCard() {
  const c = state.latestChange;
  if (!c) return '';
  return '<section class="change-card"><h3>' + icon('spark') + esc(c.title) + '</h3><p>' + esc(c.reason) + '</p>' + (c.changes || []).map(s => '<span class="change-chip">' + esc(s) + '</span>').join('') +
    (c.before && c.after ? '<details style="margin-top:12px"><summary class="small-text" style="color:#64835a;cursor:pointer">See the time budget change</summary>' + c.after.weeks.filter(w => c.before.weeks.find(b => b.week === w.week)?.capacityMinutes !== w.capacityMinutes).map(w => { const prev = c.before.weeks.find(b => b.week === w.week); return '<p>Week ' + w.week + ': ' + duration(prev.capacityMinutes) + ' available → ' + duration(w.capacityMinutes) + ' available. Scheduled: ' + duration(totalMinutes(w.tasks)) + '.</p>'; }).join('') + '</details>' : '') + '</section>';
}
function planPage() {
  if (!state.plan || !showPlan) return setup();
  const tasks = state.plan.weeks.flatMap(w => w.tasks);
  const next = state.plan.weeks.filter(w => w.week >= state.profile.currentWeek).flatMap(w => w.tasks).find(t => !t.done);
  return '<section class="quiet-plan"><div class="plan-heading"><span class="direction-label">YOUR DIRECTION</span>' +
    '<h1>' + esc(state.profile.targetRole) + '<span class="heading-dot">.</span></h1><p>' + state.plan.weeks.length + ' weeks · ' + duration(state.profile.weeklyMinutes) + ' a week · One step at a time</p>' +
    '</div>' +
    '<section class="one-step" aria-labelledby="next-step-title"><div class="one-step-label"><span class="step-origin"></span>YOUR NEXT STEP<span>' + (next ? duration(next.minutes) : 'Well done') + '</span></div>' +
    '<div class="one-step-body"><h2 id="next-step-title">' + esc(next?.title || 'You’ve completed your scheduled tasks.') + '</h2>' +
    (next ? '<button class="step-complete" data-action="task" data-id="' + esc(next.id) + '" aria-label="Complete: ' + esc(next.title) + '">' + icon('check') + '<span>Done</span></button>' : '') + '</div>' +
    '<div class="one-step-foot"><span>' + tasks.filter(t => t.done).length + ' of ' + tasks.length + ' steps completed</span><button class="quiet-action" data-action="nav-practice">Practise out loud ' + icon('arrow') + '</button></div></section>' +
    '<div class="plan-conversation"><label class="update-label" for="progress">Life changed? Your plan can too.</label>' + directionInput(true) +
    '</div>' +
    (state.latestChange ? '<div class="quiet-change" role="status">' + icon('check') + '<div><strong>' + esc(state.latestChange.title) + '</strong><p>' + esc(state.latestChange.reason) + '</p></div></div>' : '') +
    (!state.sources.length ? '<p class="source-note">This is a starting plan. <button data-action="edit-profile">Add a real job description</button> to connect it to employer requirements.</p>' : '') +
    '<div class="plan-folds">' +
    planFold('weeks', 'Your ' + state.plan.weeks.length + '-week path', 'One week at a time', weekCard()) +
    planFold('skills', 'Skills & evidence', state.skills.length + ' skills to explore', skillCard()) +
    planFold('project', 'Your portfolio project', state.plan.project.title, projectCard()) +
    planFold('story', 'Your saved story', 'Profile, sources & progress', '<div class="plan-note"><h3>Why this plan?</h3><p>' + esc(state.plan.summary) + '</p></div><div class="story-columns">' + profileCard() + historyCard() + '</div>' +
      state.sources.map(s => sourceCard(s, true)).join('') + button('Edit resume & sources', 'edit-profile', 'secondary small', 'plus') +
      (state.latestChange ? changeCard() : '')) +
    '</div></section>';
}
function planFold(id, title, detail, content) {
  return '<details class="plan-fold" data-plan-section="' + id + '"><summary><span>' + esc(title) + '<small>' + esc(detail) + '</small></span>' + icon('plus') + '</summary><div class="fold-content">' + content + '</div></details>';
}
function feedbackCard() {
  const a = state.attempts[0];
  if (!a) return '<section class="feedback-empty"><div><div class="empty-icon">' + icon('leaf') + '</div><h3>Every answer is a starting point.</h3><p>Your feedback will show what worked, what needs practice, and how your plan changes.</p></div></section>';
  return '<section class="card"><div class="card-head"><div><h2>Your practice feedback</h2><p>Based on this answer, with evidence.</p></div>' + badge('AI assessed', 'green') + '</div><div class="score-row"><div class="score-circle">' + a.score + '<span>/' + a.maxScore + '</span></div><div><h3>' + (a.needsPractice ? 'A useful gap to work on' : 'A stronger explanation') + '</h3><p>' + esc(a.summary) + '</p></div></div>' +
    a.rubric.map(r => '<div class="rubric-row"><div><strong>' + esc(r.criterion) + '</strong><p>' + esc(r.feedback) + '</p></div><span class="points">' + r.score + '/2</span></div>').join('') +
    '<div class="quote">“' + esc(a.evidence) + '”</div><p class="small-text muted">' + esc(a.correction) + '</p><div class="coach-note"><strong>' + (a.needsPractice ? 'Added to your practice path' : 'Your next practice') + '</strong>' + esc(a.nextPractice) + '</div>' +
    '<div style="margin-top:16px">' + button('See my updated plan', 'view-plan', 'secondary full', 'arrow') + '</div><p class="tiny muted" style="margin-top:12px">This score describes one answer. It is not an overall readiness or hiring prediction.</p></section>';
}
function practicePage() {
  if (!state.plan) return hero('PRACTICE WITH PURPOSE', 'Find your voice.<br><em>Build your confidence.</em>', 'Create your plan first so your questions match your target role and skill gaps.') + '<section class="card">' + button('Start my plan', 'nav-plan', 'primary', 'arrow') + '</section>';
  const q = state.question;
  return hero('A LITTLE PRACTICE GOES A LONG WAY', 'Say what you know.<br><em>Discover what’s next.</em>', 'Speak your reasoning. Get specific feedback, and let your next practice follow the evidence.') +
    '<div class="practice-grid"><div class="stack"><section class="card"><div class="card-head"><div><h2>Your practice room</h2><p>One question. A clearer next step.</p></div>' + badge(q?.skill || 'Personalised practice', 'orange') + '</div>' +
    (q ? '<div class="question-card"><span class="section-label">YOUR QUESTION</span><h2>' + esc(q.question) + '</h2><div class="question-criteria">' + q.criteria.map(c => '<span>' + esc(c) + '</span>').join('') + '</div></div>' : '<p class="small-text muted" style="margin-bottom:20px">Get a question based on your current gaps.</p>') +
    (q ? '<label class="field-label" for="answer">Talk us through your approach</label>' + voiceInput('answer', 'Explain your answer in your own words…', drafts.answer, 5) +
    '<div class="field-foot">' + button('Get my feedback', 'assess', 'primary', 'spark') + '</div>' : '') +
    '<div style="margin-top:18px">' + button(q ? 'Try a different question' : 'Get my first question', 'new-question', 'secondary full', 'refresh') + '</div><p class="tiny muted" style="margin-top:12px">Feedback evaluates your reasoning and answer content.</p></section>' +
    (state.attempts.length > 1 ? '<section class="card"><div class="card-head"><h2>Your previous practice</h2></div>' + state.attempts.slice(1, 5).map(a => '<div class="past-attempt"><span>' + esc(a.question.skill) + '<br>' + esc(a.summary) + '</span><strong>' + a.score + '/' + a.maxScore + '</strong></div>').join('') + '</section>' : '') +
    '</div><div>' + feedbackCard() + '</div></div>';
}
function applicationsPage() {
  const counts = applicationCounts(state.applications);
  const invites = state.applications.filter(a => ['interview_invited', 'offer'].includes(a.status)).length;
  const pending = state.applications.filter(a => a.status === 'applied').length;
  const strategy = state.strategy || strategyFromCounts(state.applications);
  return hero('YOUR SEARCH, WITH A LITTLE MORE CLARITY', 'Every application<br><em>can teach you something.</em>', 'Keep your applications in one place. Notice which kinds of roles respond, and use that signal thoughtfully.') +
    '<div class="application-stats"><div class="application-stat"><strong>' + state.applications.length + '</strong><span>Applications tracked</span></div><div class="application-stat highlight"><strong>' + invites + '</strong><span>Interview invitations</span></div><div class="application-stat"><strong>' + pending + '</strong><span>Awaiting a response</span></div><div class="application-stat"><strong>' + Object.keys(counts).length + '</strong><span>Role groups explored</span></div></div>' +
    '<div class="main-grid"><div class="stack"><section class="card"><div class="card-head"><div><h2>Your applications</h2><p>Each outcome helps you see the picture.</p></div>' + button('Add application', 'add-application', 'secondary small', 'plus') + '</div><div class="application-table-wrap"><table class="applications-table"><thead><tr><th>Company & role</th><th>Role focus</th><th>Status</th></tr></thead><tbody>' +
    state.applications.map(a => '<tr><td><strong>' + esc(a.company) + '</strong><small>' + esc(a.role) + '</small></td><td><span class="tiny muted">' + esc(a.group.replaceAll('_', ' ')) + '</span></td><td><select class="status-select" data-app-status="' + esc(a.id) + '" aria-label="Application status for ' + esc(a.company) + '">' + Object.entries(appLabels).map(([v, label]) => '<option value="' + v + '"' + (a.status === v ? ' selected' : '') + '>' + label + '</option>').join('') + '</select></td></tr>').join('') +
    '</tbody></table></div>' + (!state.applications.length ? '<p class="empty-small">Your next opportunity starts with one application.</p>' : '') + '</section><section class="card"><div class="card-head"><div><h2>Good news? A new application?</h2><p>Tell us what happened. We’ll update your tracker.</p></div><div class="card-icon">' + icon('mic') + '</div></div>' +
    voiceInput('application', 'Tell me the company, role, and what happened with your application…', drafts.application) +
    '<div class="field-foot">' + button('Update my tracker', 'application', 'primary', 'arrow') + '</div></section></div><aside class="stack"><section class="insight"><span class="section-label" style="color:#a6b99b">WHAT YOUR OUTCOMES SUGGEST</span><h3>A direction to explore.</h3><p>' + esc(strategy) + '</p>' +
    Object.entries(counts).map(([group, c]) => '<div class="group-signal"><div>' + esc(group.replaceAll('_', ' ')) + '<small>' + c.rejected + ' not selected · ' + c.pending + ' pending</small></div><strong>' + c.invited + ' / ' + c.total + ' invited</strong></div>').join('') +
    '<div style="margin-top:17px">' + badge('Small sample · early signal') + '</div></section><section class="card"><div class="title-row"><div class="card-icon">' + icon('leaf') + '</div><h3 style="font-size:13px">Keep the whole picture</h3></div><p class="small-text muted" style="margin-top:14px">A pending application is still pending. These patterns help you choose what to test next; they don’t tell us why an employer responded.</p></section></aside></div>';
}
function render() {
  if (!state) return;
  const expanded = [...document.querySelectorAll('[data-plan-section][open]')].map(el => el.dataset.planSection);
  document.body.dataset.page = tab;
  document.body.classList.toggle('is-start', tab === 'plan' && (!state.plan || !showPlan));
  const warning = error ? '<div class="banner error" role="alert"><span>' + esc(error) + '</span>' + '</div>' : '';
  $('#app').innerHTML = '<div class="shell">' + header() + '<main>' + warning +
    (tab === 'practice' ? practicePage() : tab === 'applications' ? applicationsPage() : planPage()) +
    '</main><footer class="footer"><span>A little clarity. A new direction.</span><div><button data-action="help">How to use voice</button>' + (state.plan ? '<button data-action="export">Export progress</button>' : '') + '</div></footer></div>' +
    (busy ? '<div class="busybar" role="status"><span class="spinner"></span>' + esc(busy) + '</div>' : '');
  for (const id of expanded) document.querySelector('[data-plan-section="' + id + '"]')?.setAttribute('open', '');
  document.querySelectorAll('.direction-text').forEach(growInput);
  if (busy) document.querySelectorAll('#app button,#app select,#app textarea,#app input').forEach(el => el.disabled = true);
}
function growInput(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(190, Math.max(86, el.scrollHeight)) + 'px';
}
function openDialog(title, content) {
  const d = $('#dialog');
  d.dataset.view = '';
  d.innerHTML = '<div class="dialog-head"><h2 id="dialog-title">' + title + '</h2><button class="icon-btn" data-action="close-dialog" aria-label="Close">' + icon('x') + '</button></div>' + content;
  if (!d.open) d.showModal();
}
function demoDialog() {
  openDialog('Watch demo', '<div class="demo-video"><iframe title="Udaan demo video" src="https://www.youtube-nocookie.com/embed/Tu0UiCLBAsw?autoplay=1&amp;playsinline=1&amp;rel=0" referrerpolicy="strict-origin-when-cross-origin" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div><p class="demo-caption">See how Udaan turns your words into your next career step. <a href="https://youtu.be/Tu0UiCLBAsw" target="_blank" rel="noopener noreferrer">Open on YouTube ' + icon('external') + '</a></p>');
  $('#dialog').dataset.view = 'demo';
}
function contextDialog() {
  openDialog('A little more context', '<p>Optional. Add your resume or a real job description to make your plan more specific.</p>' +
    '<div class="field"><label class="field-label" for="resume">Your resume or experience</label><textarea id="resume" rows="5"' + (resumeImport.busy ? ' disabled' : '') + ' placeholder="Paste your resume, or tell us about your education, work and skills…">' + esc(state.resume) + '</textarea>' +
    '<div class="field-foot"><label class="preview-link" for="resume-file">' + (resumeImport.busy ? 'Reading your resume…' : 'Upload PDF, TXT or Markdown') + '</label><input type="file" id="resume-file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"' + (resumeImport.busy ? ' disabled' : '') + ' hidden><span class="tiny muted">Saved as you type</span></div>' +
    '<p class="tiny muted" style="margin:9px 0 0">PDF up to 10 MB · 20 pages. Text is extracted on your device; review it here.</p>' +
    (resumeImport.error ? '<div class="dialog-error" role="alert">' + esc(resumeImport.error) + '</div>' : '') +
    (resumeImport.busy || resumeImport.notice ? '<p role="status" class="tiny" style="margin:10px 0 0">' + esc(resumeImport.busy ? 'Reading your resume…' : resumeImport.notice) + '</p>' : '') + '</div>' +
    '<div class="context-sources"><h3>Job descriptions</h3><p>Paste requirements from roles you want to work towards.</p>' + state.sources.map(s => sourceCard(s)).join('') +
    button('Add a job description', 'add-source', 'secondary small', 'plus') + '</div>' +
    '<div class="dialog-actions">' + button('Done', 'context-done', 'primary') + '</div>');
  $('#dialog').dataset.view = 'context';
}
function sourceDialog(id) {
  const s = state.sources.find(x => x.id === id);
  openDialog(s ? 'Edit role reference' : 'Add a role reference', '<p>Only your target role is required. Add any other details you have to make your plan more specific.</p><form id="source-form" data-id="' + esc(id || '') + '"><div class="field"><label class="field-label" for="source-company">Employer <span class="muted">(optional)</span></label><input id="source-company" value="' + esc(s?.company || '') + '"></div><div class="field"><label class="field-label" for="source-title">Target role</label><input id="source-title" required pattern=".*\\S.*" title="Enter your target role" value="' + esc(s?.title || '') + '"></div><div class="field"><label class="field-label" for="source-url">Source URL <span class="muted">(optional)</span></label><input id="source-url" type="url" value="' + esc(s?.url || '') + '"></div><div class="field"><label class="field-label" for="source-text">Job requirements <span class="muted">(optional)</span></label><textarea id="source-text" rows="6">' + esc(s?.text || '') + '</textarea></div><div class="dialog-actions"><button class="btn primary" type="submit">Save reference</button></div></form>');
}
document.addEventListener('input', e => {
  if (Object.hasOwn(drafts, e.target.id)) drafts[e.target.id] = e.target.value;
  if (e.target.id === 'goal' || e.target.id === 'targetRole') {
    state.intake = { goal: drafts.goal, targetRole: drafts.targetRole }; persist();
    const composer = e.target.closest('.direction-input');
    composer.classList.toggle('has-words', Boolean(drafts.targetRole.trim()));
    composer.querySelector('.direction-submit').disabled = !drafts.targetRole.trim() || Boolean(busy);
  }
  if (e.target.id === 'resume') { state.resume = e.target.value; persist(); }
  if (e.target.classList.contains('direction-text')) {
    growInput(e.target);
    const composer = e.target.closest('.direction-input');
    if (e.target.id === 'progress') {
      composer.classList.toggle('has-words', Boolean(e.target.value.trim()));
      composer.querySelector('.direction-submit').disabled = !e.target.value.trim() || Boolean(busy);
    }
  }
});
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && e.target.classList.contains('direction-text')) {
    e.preventDefault();
    e.target.closest('.direction-input').querySelector('.direction-submit').click();
  }
});
document.addEventListener('change', async e => {
  if (e.target.id === 'resume-file') {
    const f = e.target.files[0]; if (!f) return;
    resumeImport = { busy: true, error: '', notice: '' }; contextDialog();
    try {
      const result = await readResume(f);
      state.resume = result.text; persist(); render();
      resumeImport.notice = 'Resume loaded' + (result.pages ? ' from ' + result.pages + (result.pages === 1 ? ' page' : ' pages') : '') + '. Review the text before continuing.';
      toast('Resume loaded. Review the extracted text.');
    } catch (err) { resumeImport.error = err.message || 'The file could not be read. Your previous resume is unchanged.'; }
    finally {
      resumeImport.busy = false;
      if ($('#dialog').open && $('#dialog').dataset.view === 'context') contextDialog();
      else if (resumeImport.error) toast(resumeImport.error);
    }
  }
  if (e.target.id === 'current-week') { state.profile.currentWeek = Number(e.target.value); weekTab = Number(e.target.value); persist(); render(); }
  if (e.target.dataset.appStatus) {
    const a = state.applications.find(x => x.id === e.target.dataset.appStatus);
    const result = applyApplication(state, { action: 'update', applicationId: a.id, status: e.target.value, group: a.group, explanation: a.company + ' updated.' });
    state = result.state; persist(); render(); toast(result.message);
  }
});
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-action]'); if (!el) return;
  const action = el.dataset.action;
  if (action === 'close-dialog') { $('#dialog').close(); return; }

  if (action.startsWith('nav-')) { tab = action.slice(4); if (tab === 'plan') showPlan = false; error = ''; render(); window.scrollTo(0, 0); return; }
  if (busy) return;
  if (action === 'watch-demo') { demoDialog(); return; }
  if (action === 'view-plan') { tab = 'plan'; showPlan = true; error = ''; render(); window.scrollTo(0, 0); return; }
  if (action === 'context-done') { $('#dialog').close(); render(); return; }
  if (action === 'help') {
    openDialog('Your next step, by voice', '<p>1. Click a text box in Udaan.<br><br>2. Start Wispr Flow using your configured shortcut, then speak naturally.<br><br>3. Review the text and click the action button.<br><br>Tell us about yourself, enter your target role and add a resume if you have one. Then practise an interview answer, report progress, or update an application.</p><div class="intro-note">' + icon('mic') + '<span>Udaan receives the text inserted by Flow. It evaluates answer content and does not record your microphone itself.</span></div><div class="dialog-actions">' + button('Got it', 'close-dialog', 'primary') + '</div>'); return;
  }
  if (action === 'add-source' || action === 'edit-source') { sourceDialog(el.dataset.id); return; }
  if (action === 'edit-profile') { contextDialog(); return; }
  if (action === 'week') { weekTab = Number(el.dataset.id); render(); return; }
  if (action === 'task') {
    const t = state.plan.weeks.flatMap(w => w.tasks).find(x => x.id === el.dataset.id);
    t.done = !t.done; historyEvent(state, t.done ? 'A step completed' : 'Task reopened', t.title, 'progress'); persist(); render(); return;
  }
  if (action === 'generate-plan') {
    if (!drafts.targetRole.trim() || !$('#targetRole').reportValidity()) { $('#targetRole')?.focus(); return; }
    await run('Finding a clear next step for you…', async () => {
      const result = await api('plan', { resume: state.resume, goal: drafts.goal.trim(), targetRole: drafts.targetRole.trim(), sources: state.sources });
      if (!result.weeks?.length || !result.skills?.length) throw new Error('The plan was incomplete. Please try again.');
      const normalized = normalizePlan(result, state.sources);
      state.profile = normalized.profile; state.skills = normalized.skills; state.plan = normalized.plan;
      state.planOrigin = 'ai'; state.latestChange = null; showPlan = true;
      state.question = null;
      historyEvent(state, 'Your first plan is ready', result.summary, 'plan'); weekTab = 1;
    }); return;
  }
  if (action === 'assess') {
    if (!drafts.answer.trim()) { toast('Speak or type your answer first.'); return; }
    const answer = drafts.answer, q = clone(state.question);
    await run('Listening to your reasoning and finding your next practice…', async () => {
      const result = await api('interview', { question: q, answer, profile: state.profile, skills: state.skills, project: state.plan.project });
      state = applyAssessment(state, result, q, answer);
    }); return;
  }
  if (action === 'new-question') {
    await run('Choosing a question for your current gaps…', async () => {
      state.question = await api('question', { profile: state.profile, skills: state.skills, sources: state.sources, latestQuestion: state.question });
      drafts.answer = '';
    }); return;
  }
  if (action === 'progress') {
    if (!drafts.progress.trim()) { toast('Tell us what changed first.'); return; }
    await run('Making room for your progress and your schedule…', async () => {
      const result = await api('progress', { update: drafts.progress, profile: state.profile, plan: state.plan, latestInterview: state.attempts[0] || null });
      state = applyProgress(state, result); if (result.weekUpdates[0]) weekTab = result.weekUpdates[0].week;
      drafts.progress = '';
    }); return;
  }
  if (action === 'application') {
    if (!drafts.application.trim()) { toast('Tell us about an application first.'); return; }
    await run('Updating your application story…', async () => {
      const result = await api('application', { update: drafts.application, applications: state.applications, profile: state.profile });
      const applied = applyApplication(state, result); state = applied.state; toast(applied.message);
      if (applied.changed) drafts.application = '';
    }); return;
  }
  if (action === 'add-application') {
    openDialog('Track an application', '<p>Record an application you have already submitted. Udaan keeps the status here.</p><form id="application-form"><div class="field"><label class="field-label" for="app-company">Company</label><input id="app-company" required></div><div class="field"><label class="field-label" for="app-role">Role</label><input id="app-role" required></div><div class="field"><label class="field-label" for="app-group">Role focus</label><input id="app-group" required placeholder="e.g. Reporting focused"></div><div class="field"><label class="field-label" for="app-status">Status</label><select id="app-status">' + Object.entries(appLabels).map(([v, t]) => '<option value="' + v + '">' + t + '</option>').join('') + '</select></div><div class="dialog-actions"><button class="btn primary" type="submit">Save application</button></div></form>'); return;
  }
  if (action === 'export') {
    const u = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = u; a.download = 'udaan-progress.json'; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); toast('Your progress has been exported.'); return;
  }
});
document.addEventListener('submit', async e => {
  e.preventDefault();
  if (e.target.id === 'source-form') {
    if (!e.target.reportValidity()) return;
    const text = $('#source-text').value.trim();
    const source = { id: e.target.dataset.id || uid('source'), company: $('#source-company').value.trim(), title: $('#source-title').value.trim(), url: safeUrl($('#source-url').value), text, kind: text ? 'Provided job requirements' : 'Target role reference' };
    const old = state.sources.findIndex(s => s.id === source.id);
    if (old >= 0) state.sources[old] = source; else state.sources.push(source);
    if (!drafts.targetRole.trim()) { drafts.targetRole = source.title; state.intake.targetRole = source.title; }
    persist(); render(); contextDialog(); toast('Role reference saved.');
  }
  if (e.target.id === 'application-form') {
    const result = applyApplication(state, { action: 'add', applicationId: '', company: $('#app-company').value.trim(), role: $('#app-role').value.trim(), group: $('#app-group').value.trim().toLowerCase().replaceAll(' ', '_'), status: $('#app-status').value, explanation: 'Application saved.' });
    state = result.state; persist(); $('#dialog').close(); render(); toast(result.message);
  }
});
$('#dialog').addEventListener('close', () => {
  if ($('#dialog').dataset.view === 'demo') {
    $('#dialog').replaceChildren();
    $('#dialog').dataset.view = '';
    return;
  }
  if (state) render();
});
try {
  const saved = localStorage.getItem(STORAGE) ?? localStorage.getItem(STORAGE_PREFIX + '-v1');
  state = restoreProfile(saved);
  persist();
  drafts.goal = state.intake.goal; drafts.targetRole = state.intake.targetRole;
  render();
} catch { $('#app').innerHTML = '<div class="shell"><section class="hero"><div><h1>Let’s reconnect.</h1><p>Udaan could not load. Please refresh the page to try again.</p></div></section></div>'; }
