// openFDA publishes the drug labels the FDA actually approved. It is free, needs
// no key, and is the source of record, which is why nothing here consults any
// other database: a warning that cannot be traced to a label has no business
// being shown to someone deciding what to take.

const LABEL = 'https://api.fda.gov/drug/label.json';

// The sections that carry risk, in the order a person should meet them. Boxed
// warnings come first because the FDA reserves them for risks that can kill.
export const SECTIONS = [
  { key: 'boxed_warning',        label: 'Boxed warning',     severity: 'severe' },
  { key: 'contraindications',    label: 'Do not take if',    severity: 'severe' },
  { key: 'drug_interactions',    label: 'Drug interactions', severity: 'caution' },
  { key: 'warnings_and_cautions', label: 'Warnings',         severity: 'caution' },
  { key: 'warnings',             label: 'Warnings',          severity: 'caution' },
  { key: 'pregnancy',            label: 'Pregnancy',         severity: 'note' },
  { key: 'geriatric_use',        label: 'Older adults',      severity: 'note' },
  { key: 'adverse_reactions',    label: 'Reported effects',  severity: 'note' }
];

export class NotFound extends Error {}

function quoted(term) {
  return `"${term.replace(/"/g, '')}"`;
}

// Generic name first: a brand search matches one manufacturer's product, while
// the generic matches the substance, which is what a risk actually attaches to.
function queries(name) {
  const t = name.trim().toLowerCase();
  return [
    `openfda.generic_name:${quoted(t)}`,
    `openfda.brand_name:${quoted(t)}`,
    `openfda.substance_name:${quoted(t)}`
  ];
}

async function ask(search, limit = 1) {
  const url = `${LABEL}?search=${encodeURIComponent(search)}&limit=${limit}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`openFDA ${res.status}`);
  const body = await res.json();
  return { results: body.results || [], total: body.meta?.results?.total || 0, url };
}

// Asking for metformin and being shown the label for a sitagliptin-metformin
// combination is not a near miss, it is the wrong drug's warnings. Candidates
// are ranked so the plainest matching product wins, and a label carrying real
// risk sections beats a minimal over-the-counter one.
function scoreCandidate(r, name) {
  const term = name.trim().toLowerCase();
  const generic = ((r.openfda?.generic_name || [])[0] || '').toLowerCase();
  const substances = (r.openfda?.substance_name || []).length || 1;
  const risk = SECTIONS.filter(s => r[s.key]).length;

  let score = 0;
  if (generic === term) score += 100;
  else if (generic.startsWith(term)) score += 40;
  else if (generic.includes(term)) score += 20;

  // Each additional active ingredient is another drug's warnings mixed in.
  score -= (substances - 1) * 25;
  score += risk * 6;
  if (r.boxed_warning) score += 10;
  return score;
}

export async function lookup(name) {
  for (const q of queries(name)) {
    const hit = await ask(q, 25);
    if (hit?.results.length) {
      const ranked = [...hit.results].sort(
        (a, b) => scoreCandidate(b, name) - scoreCandidate(a, name)
      );
      const r = ranked[0];
      return {
        query: name,
        matchedOn: q.split(':')[0].replace('openfda.', ''),
        genericName: (r.openfda?.generic_name || [])[0] || null,
        brandNames: (r.openfda?.brand_name || []).slice(0, 4),
        substances: (r.openfda?.substance_name || []).slice(0, 6),
        classes: (r.openfda?.pharm_class_epc || []).slice(0, 4),
        route: (r.openfda?.route || []).slice(0, 3),
        manufacturer: (r.openfda?.manufacturer_name || [])[0] || null,
        setId: (r.openfda?.spl_set_id || [])[0] || null,
        effectiveDate: r.effective_time || null,
        labelCount: hit.total,
        sourceUrl: hit.url,
        sections: Object.fromEntries(
          SECTIONS.filter(s => r[s.key]).map(s => [s.key, String(r[s.key][0])])
        )
      };
    }
  }
  throw new NotFound(`no FDA label found for "${name}"`);
}

// DailyMed renders the same label a human can read, so a citation can point at
// something checkable rather than at a JSON endpoint.
export function labelUrl(profile) {
  return profile.setId
    ? `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${profile.setId}`
    : profile.sourceUrl;
}

export const pause = (ms = 150) => new Promise(r => setTimeout(r, ms));
