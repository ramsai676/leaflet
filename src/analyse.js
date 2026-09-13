import { lookup, labelUrl, SECTIONS, pause, NotFound } from './fda.js';
import { classesFor } from './rxclass.js';

// Nothing in this file writes a sentence about a medicine. It finds sentences
// the FDA already published and says where each one came from. That is the
// safety property, and it is what makes the output checkable by a pharmacist
// in the time it takes to click a link.

const SENTENCE = /[^.!?]+[.!?]+/g;

function sentences(text) {
  return String(text).replace(/\s+/g, ' ').match(SENTENCE) || [String(text)];
}

function trim(s, max = 300) {
  const clean = s.replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max).replace(/\s+\S*$/, '') + '…' : clean;
}

// Whitespace is normalised, nothing else. The result is a contiguous run of the
// label's own words, cut at a sentence end where one falls nearby so it reads
// as a complete thought rather than stopping mid-clause.
function opening(body, max) {
  const clean = String(body).replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;

  const window = clean.slice(0, max);
  const lastStop = Math.max(window.lastIndexOf('. '), window.lastIndexOf('? '), window.lastIndexOf('! '));
  if (lastStop > max * 0.5) return window.slice(0, lastStop + 1);
  return window.replace(/\s+\S*$/, '') + '…';
}

// A boxed warning is the FDA's most serious designation and is usually the only
// thing a person has time to read, so it is surfaced whole rather than sampled.
function ownRisks(profile) {
  const out = [];
  const link = labelUrl(profile);

  for (const section of SECTIONS) {
    const body = profile.sections[section.key];
    if (!body) continue;
    if (section.key === 'adverse_reactions' || section.key === 'geriatric_use') continue;

    // Rejoining split sentences with a space corrupts the text: "8.1 Pregnancy"
    // splits at the decimal point and comes back as "8. 1 Pregnancy", which is
    // not what the label says. A contiguous slice of the original cannot.
    const first = opening(body, section.key === 'boxed_warning' ? 460 : 320);

    out.push({
      kind: 'label',
      drug: profile.query,
      label: section.label,
      severity: section.severity,
      quote: first,
      section: section.key,
      sourceUrl: link,
      why: section.key === 'boxed_warning'
        ? 'A boxed warning is the strongest warning the FDA issues, reserved for risks that can be fatal or permanently disabling.'
        : `Quoted from the ${section.label.toLowerCase()} section of the approved FDA label.`
    });
  }
  return out;
}

// Names a label might use for another drug in the list: its generic name, its
// brand names, its active substances, and its drug class. A label often names
// the class rather than the product, and missing that would miss the warning.
function aliases(profile) {
  const names = new Set();
  const add = v => { if (v && String(v).length > 3) names.add(String(v).toLowerCase()); };
  add(profile.query);
  add(profile.genericName);
  for (const b of profile.brandNames) add(b);
  for (const s of profile.substances) add(s);
  for (const c of profile.classes) add(c.replace(/\s*\[EPC\]\s*$/i, ''));
  // Class words matter more than product names here: a label warns about
  // "anticoagulants", not about warfarin by name.
  for (const t of profile.classTerms || []) add(t);
  return [...names];
}

// Labels write classes in the plural: "anticoagulants", not "anticoagulant".
// A trailing word boundary fails against that, which silently dropped the
// ibuprofen and warfarin bleeding interaction, so an optional plural is allowed.
function mentions(text, alias) {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}(?:s|es)?\\b`, 'i').test(text);
}

function crossRisks(a, b) {
  const found = [];
  const bAliases = aliases(b);
  const link = labelUrl(a);

  for (const section of ['drug_interactions', 'contraindications', 'boxed_warning', 'warnings_and_cautions', 'warnings']) {
    const body = a.sections[section];
    if (!body) continue;

    for (const sentence of sentences(body)) {
      const hit = bAliases.find(alias => mentions(sentence, alias));
      if (!hit) continue;
      if (sentence.trim().length < 30) continue;

      found.push({
        kind: 'interaction',
        drug: a.query,
        against: b.query,
        matchedTerm: hit,
        label: `${a.query} + ${b.query}`,
        severity: section === 'contraindications' || section === 'boxed_warning' ? 'severe' : 'caution',
        quote: trim(sentence, 330),
        section,
        sourceUrl: link,
        why: `The FDA label for ${a.query} names ${hit} in its ${section.replace(/_/g, ' ')} section. ` +
             `That is the label itself describing the combination, not an inference drawn from it.`
      });
      break; // one clear citation per section reads better than five near-duplicates
    }
  }
  return found;
}

const ORDER = { severe: 0, caution: 1, note: 2 };

export async function review(names) {
  const profiles = [];
  const unresolved = [];

  for (const name of names) {
    try {
      const profile = await lookup(name);
      const { codes, terms } = await classesFor(name);
      profile.atcCodes = codes;
      profile.classTerms = terms;
      profiles.push(profile);
    } catch (err) {
      unresolved.push({ name, reason: err instanceof NotFound ? 'no FDA label found' : err.message });
    }
    await pause();
  }

  const findings = [];
  for (const p of profiles) findings.push(...ownRisks(p));

  // Interactions are directional: A's label may name B while B's names nothing.
  for (const a of profiles) {
    for (const b of profiles) {
      if (a === b) continue;
      findings.push(...crossRisks(a, b));
    }
  }

  findings.sort((x, y) => {
    const s = ORDER[x.severity] - ORDER[y.severity];
    if (s !== 0) return s;
    return (x.kind === 'interaction' ? 0 : 1) - (y.kind === 'interaction' ? 0 : 1);
  });

  const counts = { severe: 0, caution: 0, note: 0 };
  for (const f of findings) counts[f.severity]++;

  return {
    profiles,
    unresolved,
    findings,
    counts,
    interactions: findings.filter(f => f.kind === 'interaction').length,
    checkedAt: new Date().toISOString()
  };
}
