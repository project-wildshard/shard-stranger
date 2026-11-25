// The shard's identity: the slug upload, the grid and /slug/<slug> use. The stranger is a hand-written shard file,
// so its identity is in src/shard.json (written by fixtures/fixtures.mjs compose).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// J453: a proof shard never holds a player's grid cell; the `proof-` slug keeps it off (api-server MZ5).
test('the shard is proof-stranger, named Stranger', () => {
  const { identity } = JSON.parse(readFileSync(new URL('../src/shard.json', import.meta.url), 'utf8'));
  assert.equal(identity.slug, 'proof-stranger');
  assert.equal(identity.name, 'Stranger');
});
