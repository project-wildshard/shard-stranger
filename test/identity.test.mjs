// The shard's identity: the slug upload, the grid and /slug/<slug> use.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

test("the shard is stranger, named Stranger", () => {
  // sdk 0.4 keeps it at src/data/identity.json; an older sdk at src/identity.json
  const file = [new URL('../src/data/identity.json', import.meta.url), new URL('../src/identity.json', import.meta.url)].find((url) => existsSync(url));
  assert.ok(file, 'no src/data/identity.json or src/identity.json');
  const identity = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(identity.slug, "stranger");
  assert.equal(identity.name, "Stranger");
});
