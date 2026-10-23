import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

// reviews.js opens the database on import, so point it at a throwaway data directory first.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sira-reviews-'));
process.env.DATA_DIR = dataDir;
const { parseReview } = await import('../src/reviews.js');
const { db } = await import('../src/db.js');

after(() => {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const refusedFor = (field, kind, match) => (err) => {
  assert.equal(err.status, 400);
  assert.equal(err.code, 'TEXT_REVEALS_LOCATION');
  assert.deepEqual(err.extra, { field, kind, match });
  return true;
};

describe('review comments', () => {
  it('keeps an ordinary comment', () => {
    assert.deepEqual(parseReview({ rating: 5, comment: '  Owner was helpful. Rent was 12000, worth it.  ' }), {
      rating: 5,
      comment: 'Owner was helpful. Rent was 12000, worth it.',
    });
  });

  it('allows a rating without a comment', () => {
    assert.deepEqual(parseReview({ rating: 4 }), { rating: 4, comment: null });
  });

  it("refuses the owner's phone number", () => {
    assert.throws(() => parseReview({ rating: 5, comment: 'Great owner, call him on 98765 43210' }), refusedFor('comment', 'phone', '98765 43210'));
  });

  it("refuses the house's street address", () => {
    assert.throws(() => parseReview({ rating: 3, comment: 'Lovely house at 14, 80 Feet Road' }), refusedFor('comment', 'street', '14, 80 Feet Road'));
  });

  it('refuses a door number and a pincode', () => {
    assert.throws(() => parseReview({ rating: 4, comment: 'Door No 7 is the one' }), refusedFor('comment', 'door', 'Door No 7'));
    assert.throws(() => parseReview({ rating: 4, comment: 'Near Bengaluru 560038' }), refusedFor('comment', 'pincode', '560038'));
  });
});
