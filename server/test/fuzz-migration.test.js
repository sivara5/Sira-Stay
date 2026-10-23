import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import { haversineKm } from '../src/geo.js';

// Each "start" is a fresh Node process opening the database the way `npm start` does (src/db.js runs the
// migrations on import), against a throwaway data directory.
const SERVER_DIR = path.resolve(import.meta.dirname, '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sira-fuzz-'));
const env = { ...process.env, DATA_DIR: dataDir };
delete env.APP_SECRET;

const HOUSES = [
  [13.0878, 80.2101],
  [11.0168, 76.9674],
  [9.9252, 78.1198],
];

const runNode = (code) =>
  execFileSync(process.execPath, ['--disable-warning=ExperimentalWarning', '--input-type=module', '-e', code], {
    cwd: SERVER_DIR,
    env,
    encoding: 'utf8',
  });

/** Starts the server's database layer and returns every listing's public point. */
function startServer() {
  const out = runNode(`
    const { all } = await import('./src/db.js');
    console.log(JSON.stringify(all('SELECT id, approx_lat AS lat, approx_lng AS lng, approx_radius_m AS radiusM FROM properties ORDER BY id')));
  `);
  return JSON.parse(out.trim().split('\n').pop());
}

/** A database from before the 400 m change: no approx_radius_m column, points ~670 m north of each house. */
function createOldDatabase() {
  runNode(`
    const { db, run } = await import('./src/db.js');
    const { encryptJson } = await import('./src/util.js');
    run("INSERT INTO users (id, email, created_at) VALUES ('owner', 'owner@test.local', '2026-01-01')");
    for (const [i, [lat, lng]] of ${JSON.stringify(HOUSES)}.entries()) {
      run(
        \`INSERT INTO properties (id, owner_id, category, title, rent, booking_amount, district, area, landmark,
           location_enc, approx_lat, approx_lng, created_at)
         VALUES (?, 'owner', 'house', 'Test home', 10000, 1000, 'Chennai', 'Area', 'Landmark', ?, ?, ?, '2026-01-01')\`,
        'p' + i, encryptJson({ address: 'Test address', lat, lng }), lat + 0.006, lng,
      );
    }
    db.exec('ALTER TABLE properties DROP COLUMN approx_radius_m');
  `);
}

describe('re-randomizing fuzzed locations on startup', () => {
  let first;

  before(() => {
    createOldDatabase();
    first = startServer();
  });

  after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

  it('gives every old listing a new point inside its 400 m circle on the first start', () => {
    assert.equal(first.length, HOUSES.length);
    first.forEach((p, i) => {
      const [lat, lng] = HOUSES[i];
      assert.equal(p.radiusM, 400);
      assert.notEqual(p.lat, lat + 0.006, 'old point was replaced');
      assert.ok(haversineKm({ lat, lng }, p) * 1000 <= 400, `listing ${p.id} is within 400 m of the house`);
    });
  });

  it('leaves the points alone on every later start', () => {
    assert.deepEqual(startServer(), first);
    assert.deepEqual(startServer(), first);
  });
});
