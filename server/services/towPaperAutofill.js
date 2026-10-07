export function autofillChecklist(tow, existing) {
  const state = { text: { ...(existing?.text || {}) }, answers: { ...(existing?.answers || {}) }, risk: { ...(existing?.risk || {}) } };
  const airline = String(tow.airline || '').trim().toUpperCase();
  const type = String(tow.aircraftType || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const noPin = type.startsWith('A220') || (!type && airline === 'MX');
  const exceptions = {
    14: ['undefined_26', 'In Pushback'],
    ...(noPin ? { 5: ['undefined_11', 'N/A'], 23: ['undefined_44', 'N/A - No bypass pin'] } : airline === 'EK' ? { 23: ['undefined_44', 'Bypass pin left in'] } : {})
  };
  for (let index = 0; index < 25; index += 1) {
    if (state.answers[index]) continue;
    state.answers[index] = exceptions[index] ? 'no' : 'yes';
    if (exceptions[index]) {
      const [field, comment] = exceptions[index];
      if (!state.text[field]) state.text[field] = comment;
    }
  }
  for (const field of ['Tow from', 'Tow to', 'Final agreed status']) {
    if (!state.risk[field]) state.risk[field] = 'green';
  }
  return state;
}
