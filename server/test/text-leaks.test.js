import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';

import { findLocationLeaks } from '../src/text-leaks.js';

// Shared with the app's copy of the detector (sira-stay/src/lib/__tests__/text-leaks.test.ts).
const cases = JSON.parse(fs.readFileSync(new URL('../../shared/location-leak-cases.json', import.meta.url), 'utf8'));

describe('findLocationLeaks', () => {
  for (const c of cases.leaks) {
    it(`finds the ${c.kind} in "${c.text}"`, () => {
      assert.deepEqual(findLocationLeaks(c.text)[0], { kind: c.kind, text: c.match });
    });
  }

  for (const text of cases.clean) {
    it(`leaves "${text}" alone`, () => {
      assert.deepEqual(findLocationLeaks(text), []);
    });
  }

  it('reports every leak in reading order', () => {
    assert.deepEqual(findLocationLeaks('Call 98765 43210. 12, 3rd Street, Chennai 600040'), [
      { kind: 'phone', text: '98765 43210' },
      { kind: 'street', text: '12, 3rd Street' },
      { kind: 'pincode', text: '600040' },
    ]);
  });
});
