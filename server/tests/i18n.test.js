import assert from 'node:assert/strict';
import test from 'node:test';
import { translate } from '../../client/src/lib/i18n.js';

test('Spanish translations cover the primary tow workflow', () => {
  const keys = [
    'activeTows',
    'confirmTowDetails',
    'towSummary',
    'manualTow',
    'towHistory',
    'reportIssueTitle',
    'deleteTow'
  ];

  for (const key of keys) {
    assert.notEqual(translate('es', key), translate('en', key), `${key} should be translated`);
    assert.notEqual(translate('es', key), key, `${key} should not fall back to its key`);
  }
});

test('Polish and Egyptian Arabic cover the primary tow workflow', () => {
  const keys = ['activeTows', 'confirmTowDetails', 'towSummary', 'manualTow', 'towHistory', 'reportIssueTitle', 'deleteTow'];
  for (const language of ['pl', 'ar-EG']) {
    for (const key of keys) {
      assert.notEqual(translate(language, key), translate('en', key), `${language}.${key} should be translated`);
      assert.notEqual(translate(language, key), key, `${language}.${key} should not fall back to its key`);
    }
  }
});

test('unknown languages fall back to English', () => {
  assert.equal(translate('unsupported', 'activeTows'), 'Active Tows');
});
