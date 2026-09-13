import { lookup } from '../src/fda.js';
import { classesFor } from '../src/rxclass.js';
import { review } from '../src/analyse.js';

// Every assertion here exists because it caught a real defect. Two of them
// guard against showing the wrong drug's warnings, which for a medication tool
// is worse than showing nothing at all.

let failed = 0;
function check(name, ok, detail) {
  console.log((ok ? '  pass  ' : '  FAIL  ') + name + (ok || !detail ? '' : '  (' + detail + ')'));
  if (!ok) failed++;
}

console.log('drug resolution');
const metformin = await lookup('metformin');
check('metformin resolves to metformin, not a combination product',
  /^METFORMIN/i.test(metformin.genericName) && !/SITAGLIPTIN|GLIPIZIDE/i.test(metformin.genericName),
  metformin.genericName);

const lisinopril = await lookup('lisinopril');
check('lisinopril is not the hydrochlorothiazide combination',
  !/HYDROCHLOROTHIAZIDE/i.test(lisinopril.genericName), lisinopril.genericName);

const ibuprofen = await lookup('ibuprofen');
check('ibuprofen picks a label carrying real risk sections',
  Object.keys(ibuprofen.sections).length >= 4,
  Object.keys(ibuprofen.sections).length + ' sections');

console.log('class terms');
const warfarinClass = await classesFor('warfarin');
check('warfarin carries anticoagulant as a class term',
  warfarinClass.terms.includes('anticoagulant'), warfarinClass.terms.join(', '));

console.log('interaction detection');
const r = await review(['warfarin', 'ibuprofen', 'metformin']);
const pair = (a, b) => r.findings.find(f => f.kind === 'interaction' && f.drug === a && f.against === b);

check('finds warfarin naming ibuprofen', Boolean(pair('warfarin', 'ibuprofen')));
check('finds ibuprofen warning about anticoagulants (plural match)',
  Boolean(pair('ibuprofen', 'warfarin')),
  'a trailing word boundary against "anticoagulants" dropped this');
check('interaction is corroborated from both labels', r.interactions >= 2, r.interactions + ' found');

console.log('citation integrity');
check('every finding carries a quote', r.findings.every(f => f.quote && f.quote.length > 20));
check('every finding carries a source link', r.findings.every(f => /^https:\/\//.test(f.sourceUrl)));
check('every finding names the label section it came from',
  r.findings.every(f => typeof f.section === 'string' && f.section.length > 3));
check('every interaction records the term it matched on',
  r.findings.filter(f => f.kind === 'interaction').every(f => f.matchedTerm));

console.log('safety property');
const profileText = r.profiles.map(p => Object.values(p.sections).join(' ')).join(' ').replace(/\s+/g, ' ').toLowerCase();
const verbatim = f => profileText.includes(f.quote.replace(/…$/, '').trim().slice(0, 60).toLowerCase());
check('every quote appears verbatim in an FDA label that was fetched',
  r.findings.every(verbatim),
  r.findings.filter(f => !verbatim(f)).map(f => f.section).join(', '));

console.log('unknown input');
const bogus = await review(['definitelynotadrug123']);
check('an unrecognised name is reported, never invented',
  bogus.unresolved.length === 1 && bogus.findings.length === 0);

console.log('');
console.log(failed ? `${failed} failed` : 'all checks passed');
process.exit(failed ? 1 : 0);
