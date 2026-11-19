import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [engine, sdk, output] = process.argv.slice(2, 5).map(path => resolve(path));
const fixture = process.argv[5];
const move = `fixture.${fixture}.${fixture === 'rabbit' ? 'bite' : 'dive'}`;
const moduleAt = (root, file) => import(pathToFileURL(resolve(root, file)).href);
const { validateOutputProduct } = await moduleAt(sdk, 'packages/sdk/src/sharddev/outputProduct.ts');
const { createShardfileSim } = await moduleAt(engine, 'src/server/game/plugin/simulation.ts');
const { loadRapier } = await moduleAt(engine, 'src/shared/engine/physics/rapier.ts');
const { shard, assets, sections } = validateOutputProduct(output);
const rapier = await loadRapier(readFileSync(resolve(engine, 'public/assets/physics/rapier.wasm')));
const facts = new Map();
const coins = new Map();
const sim = createShardfileSim(shard, assets, {
  rapier, sections, quest: { fact: (name, actor) => facts.set(name, actor),
    coins: (amount, actor) => coins.set(actor, (coins.get(actor) ?? 0) + amount) },
});
try {
  const player = sim.host.players.get('actor.player');
  if (player === undefined) throw new Error('Missing fixture target player');
  const actor = sim.host.entities.get(`fixture.${fixture}`);
  if (actor === undefined) throw new Error('Missing authored fixture actor');
  const before = player.health.attributes.health;
  let minY = actor.position.y, maxY = actor.position.y;
  let hits = 0;
  sim.host.events.on('damage.dealt', event => {
    if (event.req.moveId === move && event.dealt > 0) hits++;
  }, sim.host.scope);
  const ticks = 60 * shard.sim.fixedHz;
  for (let tick = 0; tick < ticks; tick++) {
    sim.host.step();
    minY = Math.min(minY, actor.position.y);
    maxY = Math.max(maxY, actor.position.y);
  }
  const health = player.health.attributes.health;
  if (!hits || health >= before) throw new Error(`${fixture} dealt no player damage in 60 seconds`);
  if (fixture === 'dragonfly' && (maxY < 4 || maxY - minY < 2)) throw new Error('Dragonfly did not dive');
  console.log(JSON.stringify({ fixture, ticks, hits, healthBefore: before, healthAfter: health, minY, maxY }));
} finally {
  sim.dispose();
}
