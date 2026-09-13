import { addMed, run, reset, meds, $ } from './ui.js';

// A real list, because a demo with one drug proves nothing. Warfarin with
// ibuprofen is a documented bleeding risk that both labels warn about
// independently, which is the case this tool exists to surface.
const SAMPLE = ['warfarin', 'ibuprofen', 'metformin', 'lisinopril'];

function wire() {
  const input = $('#med-input');

  const commit = () => {
    const raw = input.value;
    if (!raw.trim()) return;
    // People paste lists, so commas and newlines are separators, not names.
    for (const part of raw.split(/[,\n;]+/)) addMed(part);
    input.value = '';
    input.focus();
  };

  $('#add').addEventListener('click', commit);

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
  });

  $('#sample').addEventListener('click', () => {
    for (const m of SAMPLE) addMed(m);
    run();
  });

  $('#check').addEventListener('click', run);
  $('#reset').addEventListener('click', reset);

  if (location.hash === '#demo') {
    for (const m of SAMPLE) addMed(m);
    run();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', wire);
} else {
  wire();
}
