// ONE-FORMAT OF25: the composed stranger shard on the engine's server sim for 60 s: every spawn stands, no decision
// guest refuses or is disabled, and the population and the boss are there to meet.
//
//   node --experimental-transform-types --import <engine>/scripts/sim-node-loader.mjs composed-sim.mjs <sharddev> <engine> <built folder>
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
try {
  const spawns = shard.creatures.spawns.map(row => row.id), missing = spawns.filter(id => !sim.host.entities.has(id));
  for (let tick = 0; tick < 60 * shard.sim.fixedHz; tick++) sim.host.step();
  const metrics = sim.decisions?.host.metrics() ?? [];
  const failed = metrics.filter(row => row.refusals > 0 || row.disabled);
  const report = { spawns: spawns.length, missing, riding: sim.riding !== null, guests: metrics.length,
    failed: failed.map(row => ({ ...row })), reasons, wolves: spawns.filter(id => id.startsWith('stranger.wolf')).length,
    deer: spawns.filter(id => id.startsWith('stranger.deer')).length, encounters: (sections.get('combat/encounters')?.encounters ?? []).map(row => row.id) };
  console.log(JSON.stringify(report));
  if (missing.length > 0 || failed.length > 0 || !report.riding) process.exitCode = 1;
} finally { sim.dispose(); }
