// A label rarely names the other drug. Ibuprofen's label warns about
// "anticoagulants"; it never says "warfarin". Matching on product names alone
// therefore misses the interaction that matters most, so each drug also carries
// the words its class is actually called in prose.

const RXCLASS = 'https://rxnav.nlm.nih.gov/REST/rxclass/class/byDrugName.json';

// ATC codes are hierarchical, so a prefix identifies a family. This table is
// deliberately small and auditable: it covers the classes that appear in
// interaction warnings, and anything not listed simply contributes no alias
// rather than a guess.
const ATC_TERMS = [
  ['B01', ['anticoagulant', 'antithrombotic', 'blood thinner']],
  ['B01AC', ['antiplatelet', 'platelet aggregation inhibitor']],
  ['M01A', ['nsaid', 'nonsteroidal anti-inflammatory', 'non-steroidal anti-inflammatory']],
  ['N02BA', ['salicylate', 'aspirin']],
  ['N02A', ['opioid', 'narcotic analgesic']],
  ['C09A', ['ace inhibitor', 'angiotensin converting enzyme inhibitor']],
  ['C09C', ['angiotensin receptor blocker', 'angiotensin ii receptor']],
  ['C10AA', ['statin', 'hmg-coa reductase inhibitor']],
  ['C03', ['diuretic']],
  ['C07', ['beta blocker', 'beta-adrenergic blocking']],
  ['C08', ['calcium channel blocker']],
  ['A10B', ['antidiabetic', 'oral hypoglycemic', 'hypoglycemic agent']],
  ['A10A', ['insulin']],
  ['A02BC', ['proton pump inhibitor']],
  ['N06AB', ['ssri', 'selective serotonin reuptake inhibitor', 'antidepressant']],
  ['N06A', ['antidepressant']],
  ['N05A', ['antipsychotic']],
  ['N05B', ['benzodiazepine', 'anxiolytic']],
  ['N03A', ['anticonvulsant', 'antiepileptic']],
  ['J01', ['antibiotic', 'antibacterial']],
  ['H02', ['corticosteroid', 'steroid']],
  ['L04', ['immunosuppressant']],
  ['M04', ['antigout']]
];

const cache = new Map();

export async function classesFor(name) {
  const key = name.trim().toLowerCase();
  if (cache.has(key)) return cache.get(key);

  let codes = [];
  let names = [];
  try {
    const res = await fetch(`${RXCLASS}?drugName=${encodeURIComponent(key)}&relaSource=ATC`,
      { headers: { Accept: 'application/json' } });
    if (res.ok) {
      const body = await res.json();
      const items = body.rxclassDrugInfoList?.rxclassDrugInfo || [];
      codes = [...new Set(items.map(i => i.rxclassMinConceptItem.classId))];
      names = [...new Set(items.map(i => i.rxclassMinConceptItem.className.toLowerCase()))];
    }
  } catch {
    // RxClass being unavailable degrades matching, it does not break the review.
  }

  const terms = new Set(names);
  for (const code of codes) {
    for (const [prefix, words] of ATC_TERMS) {
      if (code.startsWith(prefix)) words.forEach(w => terms.add(w));
    }
  }

  const result = { codes, terms: [...terms] };
  cache.set(key, result);
  return result;
}
