import { bypassPinCompletionReasonForAirline, towPaperDetails, towPrepStep6ReasonForAirline } from '../server/services/towPermit.js';

export default function preserveLegacyTowPapers(db) {
  const insert = db.prepare('INSERT INTO towPaperDrafts (towId, state, revision) VALUES (?, ?, 1)');
  const tows = db.prepare('SELECT * FROM tows WHERE NOT EXISTS (SELECT 1 FROM towPaperDrafts WHERE towId = tows.id)').all();
  for (const tow of tows) {
    const prepReason = towPrepStep6ReasonForAirline(tow.airline);
    const pinReason = bypassPinCompletionReasonForAirline(tow.airline);
    const text = { ...towPaperDetails(tow), undefined_26: 'In Pushback' };
    if (prepReason) text.undefined_11 = prepReason;
    if (pinReason) text.undefined_44 = pinReason;
    // Preserve the old generator's airline rules, not the new aircraft-based defaults.
    const answers = Object.fromEntries(Array.from({ length: 25 }, (_, index) => [index,
      index === 14 || (index === 5 && prepReason) || (index === 23 && pinReason) ? 'no' : 'yes'
    ]));
    insert.run(tow.id, JSON.stringify({ text, answers, risk: {
      'Tow from': 'green', 'Tow to': 'green', 'Final agreed status': 'green'
    } }));
  }
}
