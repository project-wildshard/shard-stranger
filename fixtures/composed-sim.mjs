// ONE-FORMAT OF25: the composed stranger shard on the engine's server sim for 60 s: every spawn stands, no decision
// guest refuses or is disabled, and the population and the boss are there to meet.
//
//   node --import <engine>/scripts/sim-node-loader.mjs composed-sim.mjs <sharddev> <engine> <built folder>
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [sdk, engine, built] = process.argv.slice(2, 5).map(path => resolve(path));
const at = (base, file) => import(pathToFileURL(resolve(base, file)).href);
const { validateOutputProduct } = await at(sdk, 'packages/sdk/src/sharddev/outputProduct.ts');
const { createShardfileSim } = await at(engine, 'src/server/game/plugin/simulation.ts');
const { loadRapier } = await at(engine, 'src/shared/engine/physics/rapier.ts');

const { shard, assets, sections } = validateOutputProduct(built);
const sim = createShardfileSim(shard, assets, { rapier: await loadRapier(readFileSync(resolve(engine, 'public/assets/physics/rapier.wasm'))), sections,
  quest: { fact: () => undefined, coins: () => undefined } });
const reasons = [];
const world = sim.decisions?.host.options?.world;
if (world !== undefined) { const failed = world.failed.bind(world); world.failed = (onFail, context, reason) => { reasons.push(reason); failed(onFail, context, reason); }; }
const step = seconds => { for (let tick = 0; tick < seconds * shard.sim.fixedHz; tick++) sim.host.step(); };
/** A probe that beats the dragon leaves it dead for the next: a player in its arena kills it, and 32 s on it stands
 *  again whole and takes wing (its spawn's respawn, its encounter re-armed, its guest climbing anew). */
function revive() {
  const dragon = sim.host.entities.get('fixture.dragon'), player = sim.host.focusedPlayer;
  if (dragon === undefined || player === undefined) return { error: 'no dragon or no player' };
  const hit = () => sim.host.combat.hit({ source: 'env', sourceTags: ['dmg.ranged'], target: dragon.combatActor(), amount: dragon.maxHp, point: dragon.position.clone(), dir: dragon.position.clone().normalize() });
  let blows = 0;
  for (; blows < 20 && dragon.alive; blows++) { player.position.set(dragon.position.x, 0, dragon.position.z + 3); player.health.attributes.health = player.health.attributes.maxHealth; hit(); step(1); }
  if (dragon.alive) return { error: `the dragon did not fall in ${blows} blows (hp ${dragon.hp})` };
  player.position.set(0, 0, 0); step(25);
  if (dragon.alive) return { error: 'the dragon stood again before its 30 s' };
  let waited = 25; for (; waited < 40 && !dragon.alive; waited += 1 / shard.sim.fixedHz) sim.host.step();
  const ground = dragon.position.y;
  if (!dragon.alive || dragon.hp !== dragon.maxHp) return { error: `the dragon did not stand again whole (alive ${dragon.alive}, hp ${dragon.hp})` };
  player.position.set(dragon.position.x, 0, dragon.position.z + 10);
  let high = ground; for (let s = 0; s < 8; s++) { step(1); high = Math.max(high, dragon.position.y); }
  if (high - ground < 2.5) return { error: `the risen dragon did not take wing (${ground} to ${high})` };
  return { blows, revivedAt: Math.round(waited * 10) / 10, ground, high };
}
try {
  const spawns = shard.creatures.spawns.map(row => row.id), missing = spawns.filter(id => !sim.host.entities.has(id));
  for (let tick = 0; tick < 60 * shard.sim.fixedHz; tick++) sim.host.step();
  const metrics = sim.decisions?.host.metrics() ?? [];
  const failed = metrics.filter(row => row.refusals > 0 || row.disabled);
  const report = { spawns: spawns.length, missing, riding: sim.riding !== null, guests: metrics.length,
    failed: failed.map(row => ({ ...row })), reasons, wolves: spawns.filter(id => id.startsWith('stranger.wolf')).length,
    deer: spawns.filter(id => id.startsWith('stranger.deer')).length, encounters: (sections.get('combat/encounters')?.encounters ?? []).map(row => row.id) };
  report.revive = revive();
  console.log(JSON.stringify(report));
  if (missing.length > 0 || failed.length > 0 || !report.riding || report.revive.error !== undefined) process.exitCode = 1;
} finally { sim.dispose(); }
