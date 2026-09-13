import { review } from './analyse.js';

export const $ = sel => document.querySelector(sel);
const el = (tag, cls) => { const n = document.createElement(tag); if (cls) n.className = cls; return n; };

const state = { meds: [], result: null, filter: null, running: false };

const SEVERITY_NAME = { severe: 'Serious', caution: 'Caution', note: 'Worth knowing' };

export function meds() { return state.meds; }

export function addMed(name) {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (!clean) return false;
  if (state.meds.some(m => m.toLowerCase() === clean.toLowerCase())) return false;
  state.meds.push(clean);
  renderMeds();
  return true;
}

function removeMed(name) {
  state.meds = state.meds.filter(m => m !== name);
  renderMeds();
}

function renderMeds() {
  const host = $('#meds');
  host.innerHTML = '';
  for (const m of state.meds) {
    const chip = el('button', 'med');
    chip.type = 'button';
    chip.innerHTML = `<span>${m}</span><span class="med-x" aria-hidden="true">×</span>`;
    chip.setAttribute('aria-label', `Remove ${m}`);
    chip.addEventListener('click', () => removeMed(m));
    host.appendChild(chip);
  }
  $('#check').disabled = state.meds.length === 0 || state.running;
  $('#med-count').textContent = state.meds.length
    ? `${state.meds.length} ${state.meds.length === 1 ? 'medicine' : 'medicines'}`
    : 'No medicines added yet';
}

function renderSummary() {
  const host = $('#summary');
  host.innerHTML = '';
  for (const sev of ['severe', 'caution', 'note']) {
    const b = el('button', 'tally');
    b.type = 'button';
    b.dataset.sev = sev;
    b.setAttribute('aria-pressed', String(state.filter === sev));
    const n = el('span', 'n');
    n.textContent = state.result.counts[sev];
    const k = el('span', 'k');
    k.textContent = SEVERITY_NAME[sev];
    b.append(n, k);
    b.addEventListener('click', () => {
      state.filter = state.filter === sev ? null : sev;
      renderSummary();
      renderFindings();
    });
    host.appendChild(b);
  }
}

function renderFindings() {
  const host = $('#findings');
  host.innerHTML = '';

  const list = state.filter
    ? state.result.findings.filter(f => f.severity === state.filter)
    : state.result.findings;

  if (!list.length) {
    const e = el('div', 'empty');
    e.textContent = 'Nothing at this level.';
    host.appendChild(e);
    return;
  }

  list.forEach((f, i) => {
    const card = el('article', 'finding');
    card.dataset.sev = f.severity;
    card.style.animationDelay = `${Math.min(i, 12) * 40}ms`;

    const head = el('div', 'finding-head');
    const label = el('span', 'finding-label');
    label.textContent = f.kind === 'interaction' ? f.label : `${f.drug}: ${f.label}`;
    const chip = el('span', 'chip');
    chip.dataset.sev = f.severity;
    chip.textContent = f.kind === 'interaction' ? 'combination' : SEVERITY_NAME[f.severity];
    head.append(label, chip);

    const cite = el('div', 'finding-cite');
    cite.textContent = `FDA label · ${f.section.replace(/_/g, ' ')}` +
      (f.matchedTerm ? ` · names "${f.matchedTerm}"` : '');

    const quote = el('blockquote', 'finding-quote');
    quote.textContent = f.quote;

    const why = el('div', 'finding-why');
    why.textContent = f.why;

    const link = el('a', 'finding-link');
    link.href = f.sourceUrl;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'Read the full label →';

    card.append(head, cite, quote, why, link);
    host.appendChild(card);
  });
}

function renderProfiles() {
  const host = $('#profiles');
  host.innerHTML = '';
  for (const p of state.result.profiles) {
    const row = el('div', 'profile');
    const name = el('span', 'profile-name');
    name.textContent = p.query;
    const detail = el('span', 'profile-detail');
    detail.textContent = [p.genericName, p.classes[0] || p.classTerms?.[0]]
      .filter(Boolean).join(' · ');
    row.append(name, detail);
    host.appendChild(row);
  }
  for (const u of state.result.unresolved) {
    const row = el('div', 'profile');
    row.dataset.unresolved = 'true';
    const name = el('span', 'profile-name');
    name.textContent = u.name;
    const detail = el('span', 'profile-detail');
    detail.textContent = u.reason + ', so nothing is shown for it';
    row.append(name, detail);
    host.appendChild(row);
  }
}

export async function run() {
  if (state.running || !state.meds.length) return;
  state.running = true;
  $('#check').disabled = true;
  $('#check').textContent = 'Reading FDA labels…';

  try {
    state.result = await review(state.meds);
    state.filter = null;
    $('#intake').hidden = true;
    $('#results').hidden = false;
    $('#reset').hidden = false;
    renderSummary();
    renderProfiles();
    renderFindings();
    $('#coverage').textContent =
      `${state.result.profiles.length} of ${state.meds.length} medicines matched to an FDA label · ` +
      `${state.result.findings.length} findings · ${state.result.interactions} about combinations`;
  } catch (err) {
    $('#error').hidden = false;
    $('#error').textContent = `Could not reach the FDA label service: ${err.message}`;
  } finally {
    state.running = false;
    $('#check').textContent = 'Check these medicines';
    $('#check').disabled = false;
  }
}

export function reset() {
  state.result = null;
  $('#intake').hidden = false;
  $('#results').hidden = true;
  $('#reset').hidden = true;
  $('#error').hidden = true;
}
