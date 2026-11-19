// ONE-FORMAT AC5/AC6: the stranger's creature fixtures. Each is written into a copy of the plain hand-written seed
// (sections JSON plus ABI-1 decision guests compiled by sharddev's own compiler), checked by the ordinary
// `wildshard check`, then run on the engine's server sim for 60 s against its behaviour.
//
//   node --experimental-transform-types --import <engine>/scripts/sim-node-loader.mjs fixtures.mjs <sharddev> <engine> <fixture>
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [sdk, engine] = process.argv.slice(2, 4).map(path => resolve(path));
const name = process.argv[4];
const root = import.meta.dirname, scratch = resolve(root, 'tmp');
const at = (base, file) => import(pathToFileURL(resolve(base, file)).href);
const { writeHandwrittenSource } = await at(sdk, 'packages/sdk/src/sharddev/handwritten.ts');
const { compileScript } = await at(sdk, 'packages/sdk/src/sharddev/bake/compileScript.ts');
const { validateOutputProduct } = await at(sdk, 'packages/sdk/src/sharddev/outputProduct.ts');
const { scriptV1Layout, SCRIPT_V1_COMMANDS: DO, SCRIPT_V1_EVENTS: ON, SCRIPT_V1_READS: READ } = await at(engine, 'node_modules/@wildshard/format/src/format/scriptAbiV1.ts');
const { createShardfileSim, createNativeTargetQueries } = await at(engine, 'src/server/game/plugin/simulation.ts');
const { prepareGlbCost, parseGlbData } = await at(engine, 'node_modules/@wildshard/format/src/format/glbCost.ts');
const { loadRapier } = await at(engine, 'src/shared/engine/physics/rapier.ts');
const { actRoutes } = await at(engine, 'src/shared/engine/sim/actRoutes.ts');
const { Vector3 } = await at(engine, 'node_modules/three/build/three.module.js');

await prepareGlbCost();
const IO = 16384;
/** An ABI-1 guest: `body` runs on every decision call, with the decision harness's helpers. */
function guest(body, states = 1) {
  const io = scriptV1Layout(states, 0), scratchAt = IO + 4096;
  return `@external("env","ws_read") declare function read(op:i32,a:f64,b:f64):f64;
function self():i32{return i32(load<f64>(${IO + 24}));}
function events():i32{return i32(load<f64>(${IO + 32}));}
function ev(i:i32,slot:i32):f64{return load<f64>(${IO + io.inbox * 8}+usize(i*48+slot*8));}
function state(i:i32):f64{return load<f64>(${IO + io.state * 8}+usize(i*8));}
function setState(i:i32,value:f64):void{store<f64>(${IO + io.state * 8}+usize(i*8),value);}
function emit(op:i32,target:f64,a:f64,b:f64,c:f64):void{const n=i32(load<f64>(${scratchAt}));const at=${IO + io.outbox * 8}+usize(n*40);
store<f64>(at,f64(op));store<f64>(at+8,target);store<f64>(at+16,a);store<f64>(at+24,b);store<f64>(at+32,c);store<f64>(${scratchAt},f64(n+1));}
export function ws_abi():i32{return 1;} export function ws_init(lo:i32,hi:i32):void{} export function ws_io():i32{return ${IO};}
export function ws_handle():i32{store<f64>(${scratchAt},0);${body}
return i32(load<f64>(${scratchAt}));}`;
}

/** OF25: decision handles are the shard's own catalogues (every spawn, strike and move sorted by id, format
 *  `buildDecisionRegistries`). Alone, a fixture's handles are its own; composed into the stranger shard, `compose` sets
 *  CATALOGUE from the whole shard so each guest names the same rows. */
let CATALOGUE = null;
const A = (id, alone) => CATALOGUE?.actors.get(id) ?? alone, S = (id, alone) => CATALOGUE?.strikes.get(id) ?? alone,
  M = (id, alone) => CATALOGUE?.moves.get(id) ?? alone;
const DIMS = { bodyY: 1, bodyHalfLen: 0.6, bodyRadius: 0.5, headRadius: 0.35, legLen: 0.6, feet: [], halfWidth: 0.5 };
const MODS = { speed: 1, chargeDist: 1, chargeDamage: 0, damageTaken: 1, relentless: false };
function species(id, label, hp, extra = {}) {
  return { id, kind: id, label, aggressive: true, lockable: true, capExempt: false, dims: DIMS,
    variants: [{ id: 'plain', label, rarity: 'common', weight: 1, scale: [1, 1], hp, mods: MODS }],
    body: { size: 'medium', scale: 1, look: `${id}.look` },
    temperament: { brain: 'pursue', reaction: 'aggressive', leash: 30, assist: 0, home: { speed: 2, stop: 1 },
      tuning: { speed: 2, turnRate: 6, thinkDivisor: 1, attackCooldownTicks: 90, wanderRadius: 0, wanderEveryTicks: 120 } },
    senses: { notice: 20 }, abilities: [{ use: `${id}.claw`, range: 1.8, cooldown: 2, weight: 1 }], ...extra };
}
const strike = (id, extra = {}) => ({ id, shape: { kind: 'sphere', radius: 1.8 }, windup: 0.2, active: 0.12, recover: 0.4, cooldown: 2,
  range: 1.8, damage: 1, tags: ['dmg.melee'], weight: 1, speed: 0, ...extra });
const look = (id, colour) => ({ id: `${id}.look`, species: id, recipe: 'engine.sphere', material: null,
  parameters: { colour, radius: 0.5, heightSegments: 6, widthSegments: 10 }, animation: { recipe: 'engine.scale-wave', parameters: {} } });
function script(id, actor, wasm, row) {
  return { id, abi: '1.0', side: 'sim', module: `blobs/wasm/${hash(wasm)}.wasm`, source: `behaviour/${id}.as`, binding: { brain: actor }, onFail: 'hold',
    reads: [], stateVersion: 1, params: {}, actors: { self: actor }, ...row };
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

/** A placeholder GLB: one triangle, skinned to `joints` ([name, parent index, local translation], root first) with an
 *  `idle` clip when given, else a plain mesh an attachment hangs. */
function glb(joints) {
  const chunks = [], views = [], accessors = [];
  let at = 0;
  const add = (data, type, count, componentType = 5126) => {
    const bytes = Buffer.from(data.buffer, data.byteOffset, data.byteLength), pad = (4 - bytes.length % 4) % 4;
    views.push({ buffer: 0, byteOffset: at, byteLength: bytes.length }); chunks.push(bytes, Buffer.alloc(pad)); at += bytes.length + pad;
    accessors.push({ bufferView: views.length - 1, type, count, componentType }); return accessors.length - 1;
  };
  const POSITION = add(new Float32Array([0, 0, 0, .1, 0, 0, 0, .1, 0]), 'VEC3', 3), NORMAL = add(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 'VEC3', 3);
  const indices = add(new Uint16Array([0, 1, 2]), 'SCALAR', 3, 5123);
  const doc = { asset: { version: '2.0' }, scene: 0, materials: [{ name: 'Body' }], accessors, bufferViews: views };
  if (joints === undefined) {
    Object.assign(doc, { scenes: [{ nodes: [0] }], nodes: [{ name: 'part', mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION, NORMAL }, indices, material: 0 }] }] });
  } else {
    const world = [];
    for (const [, parent, t] of joints) { const p = world[parent] ?? [0, 0, 0]; world.push([p[0] + t[0], p[1] + t[1], p[2] + t[2]]); }
    const JOINTS_0 = add(new Uint8Array(12), 'VEC4', 3, 5121), WEIGHTS_0 = add(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), 'VEC4', 3);
    const binds = add(new Float32Array(world.flatMap(([x, y, z]) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -x, -y, -z, 1])), 'MAT4', joints.length);
    const times = add(new Float32Array([0, 1]), 'SCALAR', 2), still = add(new Float32Array([...joints[0][2], ...joints[0][2]]), 'VEC3', 2);
    const nodes = [{ name: 'body.mesh', mesh: 0, skin: 0 }, ...joints.map(([name, , translation], i) => {
      const children = joints.flatMap(([, parent], j) => parent === i ? [j + 1] : []);
      return { name, translation, ...(children.length === 0 ? {} : { children }) };
    })];
    Object.assign(doc, { scenes: [{ nodes: [0, 1] }], nodes, skins: [{ joints: joints.map((_, i) => i + 1), inverseBindMatrices: binds }],
      meshes: [{ primitives: [{ attributes: { POSITION, NORMAL, JOINTS_0, WEIGHTS_0 }, indices, material: 0 }] }],
      animations: [{ name: 'idle', channels: [{ sampler: 0, target: { node: 1, path: 'translation' } }], samplers: [{ input: times, output: still, interpolation: 'LINEAR' }] }] });
  }
  doc.buffers = [{ byteLength: at }];
  const json = Buffer.from(JSON.stringify(doc)), text = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 0x20)]), bin = Buffer.concat(chunks);
  const header = Buffer.alloc(20); header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + text.length + bin.length, 8);
  header.writeUInt32LE(text.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const binary = Buffer.alloc(8); binary.writeUInt32LE(bin.length); binary.writeUInt32LE(0x004e4942, 4);
  return Uint8Array.from(Buffer.concat([header, text, binary, bin]));
}
/** The biped and quadruped contracts' bones (format `creature-skeletons.ts`), and the hydra's own rig. */
const BIPED = [['body', -1, [0, 0, 0]], ['hips', 0, [0, 0.95, 0]], ['spine', 1, [0, 0.2, 0]], ['chest', 2, [0, 0.3, 0]], ['neck', 3, [0, 0.3, 0]],
  ['head', 4, [0, 0.15, 0]], ['upperArm.L', 3, [0.25, 0.2, 0]], ['forearm.L', 6, [0.3, 0, 0]], ['hand.L', 7, [0.25, 0, 0]],
  ['upperArm.R', 3, [-0.25, 0.2, 0]], ['forearm.R', 9, [-0.3, 0, 0]], ['hand.R', 10, [-0.25, 0, 0]], ['thigh.L', 1, [0.12, 0, 0]],
  ['shin.L', 12, [0, -0.45, 0]], ['foot.L', 13, [0, -0.45, 0]], ['thigh.R', 1, [-0.12, 0, 0]], ['shin.R', 15, [0, -0.45, 0]], ['foot.R', 16, [0, -0.45, 0]]];
const QUADRUPED = (() => {
  const rows = [['body', -1, [0, 0.9, 0]], ['neck1', 0, [0, 0.2, 0.5]], ['neck2', 1, [0, 0.2, 0.2]], ['head', 2, [0, 0.1, 0.2]], ['tail', 0, [0, 0, -0.7]]];
  for (const [bones, side, z] of [[['FL_shoulder', 'FL_carpus', 'FL_fetlock'], 0.25, 0.5], [['FR_shoulder', 'FR_carpus', 'FR_fetlock'], -0.25, 0.5],
    [['BL_hip', 'BL_stifle', 'BL_hock'], 0.25, -0.5], [['BR_hip', 'BR_stifle', 'BR_hock'], -0.25, -0.5]]) {
    const top = rows.length; rows.push([bones[0], 0, [side, -0.1, z]], [bones[1], top, [0, -0.4, 0]], [bones[2], top + 1, [0, -0.35, 0]]);
  }
  return rows;
})();
const HYDRA = [['body', -1, [0, 0.9, 0]], ['neck1', 0, [-0.8, 0.6, 0.5]], ['head1', 1, [0, 0.6, 0.3]], ['neck2', 0, [0, 0.7, 0.6]], ['head', 3, [0, 0.6, 0.3]],
  ['neck3', 0, [0.8, 0.6, 0.5]], ['head3', 5, [0, 0.6, 0.3]]];
/** A creature skin: its GLB, the export's metadata (rig row and binding) and its `platform.skin` look. */
function skin(id, joints) {
  const bytes = glb(joints), file = hash(bytes), names = joints.map(([joint]) => joint);
  const metadata = new TextEncoder().encode(JSON.stringify({ row: { id: `${id}.skin`, file, family: 'toon',
    rig: { skeleton: `${id}.rig`, joints: [names], clips: ['idle'], sockets: names }, cost: parseGlbData(bytes) },
    binding: { skin: `${id}.skin`, material: { family: 'pbr', vertexColours: false }, loops: ['idle'] } }));
  return { look: { id: `${id}.look`, species: id, recipe: 'platform.skin', material: null, parameters: { skin: hash(metadata) },
    animation: { recipe: 'platform.clips', parameters: { attackSpan: 1 } } },
    files: [{ bytes, kind: 'glb' }, { bytes: metadata, kind: 'json', dependencies: [file], library: true }] };
}
/** A plain mesh an attachment hangs, in the library. */
function part() { const bytes = glb(); return { geometry: hash(bytes), file: { bytes, kind: 'glb', library: true } }; }
/** A volume row on `bone`; `extra` adds `at`, `hp`, `channel`. */
const ball = (partName, bone, radius, multiplier, extra = {}) => ({ part: partName, bone, shape: 'sphere', radius, halfLength: 0, axis: 'y', multiplier, ...extra });
/** The world centre of a creature's hit volume `partName` (its segment's midpoint). */
function centre(actor, partName) {
  const pose = actor.hitVolumes, index = pose.volumes.findIndex(row => row.part === partName);
  if (index === -1) throw new Error(`No volume ${partName}`);
  const rear = new Vector3(), front = new Vector3(); pose.segment(index, rear, front); return rear.add(front).multiplyScalar(0.5);
}
/** A weapon's ray into `actor` from `from` toward `to`: the part it meets, and the blow on it. */
const queries = createNativeTargetQueries();
function shoot(sim, actor, from, to, amount) {
  const dir = to.clone().sub(from).normalize(), hit = queries.ray([actor], from, dir, 50);
  if (hit === null) return { part: null };
  const at = { part: hit.part, multiplier: hit.multiplier };
  sim.host.combat.hit({ source: 'env', sourceTags: ['dmg.melee'], target: actor.combatActor(), amount, point: hit.point.clone(), dir,
    ...(hit.part === undefined ? {} : { part: hit.part }), ...(hit.multiplier === undefined ? {} : { partMultiplier: hit.multiplier }) });
  return at;
}

/** AC6: the mech's four armour plates around its pilot (the biped's `body` volume on the chest, here x2), each hung as an attachment. */
const PLATES = [['plateFront', [0, 0, 0.55]], ['plateBack', [0, 0, -0.55]], ['plateLeft', [0.55, 0, 0]], ['plateRight', [-0.55, 0, 0]]];
const HEADS = ['head1', 'head2', 'head3'];
/** CC40c: the skeleton horse's gaits (m/s). */
const HORSE_GAITS = { walk: 2, gallop: 10 };
/** A script-driven creature's controller (format: exactly one): a one-phase encounter owning it. */
const fight = (entity, name, at) => ({ id: `${entity}.fight`, entity, kind: 'boss', panel: null, name, title: 'Stranger', retry: 'Again',
  arena: { at, radius: 40 }, intro: 0, introShort: 0, respawn: { at, yaw: 0 }, phases: [{ at: 1, name, caption: name, speed: 0, stopDistance: 0, turnRate: 2 }] });
/** The hydra's head bones: a rig names its middle one `head`. */
const HEAD_BONES = { head1: 'head1', head2: 'head', head3: 'head3' };
/** Every strike that lands, by its strike id. */
function count(sim) {
  const strikes = new Map();
  sim.host.events.on('damage.dealt', event => { if (event.req.moveId !== undefined) strikes.set(event.req.moveId, (strikes.get(event.req.moveId) ?? 0) + 1); }, sim.host.scope);
  return strikes;
}
/** `n` mechs on the kit biped: four plated attachments with part hp, a x2 pilot, laser and rockets from range; once a
 *  plate breaks (`part.broken`) it jets in on the player (a leap) and stomps (knockback). Handles sort by id: mechs 1..n;
 *  strikes laser 1, rockets 2, stomp 3; moves jets 1, walk 2. State 0 plates broken, 1 calls, 2 the jets (0, 1 aloft, 2 down). */
async function mechRows(home, n) {
  const body = skin('fixture.mech', BIPED), armour = part(), row = species('fixture.mech', 'Mech', 300);
  row.dims = { bodyY: 1.4, bodyHalfLen: 0.4, bodyRadius: 0.5, headRadius: 0.3, legLen: 0.9, feet: [], halfWidth: 0.6 };
  row.body = { skeleton: 'biped', size: 'medium', scale: 1, look: 'fixture.mech.look', channels: PLATES.map(([plate]) => ({ name: plate })),
    volumes: [ball('body', 'chest', 0.3, 2), ...PLATES.map(([plate, offset]) => ball(plate, 'chest', 0.3, 0, { at: offset, hp: 40, channel: plate }))],
    attachments: PLATES.map(([plate, offset]) => ({ id: `armour.${plate}`, socket: 'chest', meshes: [{ id: `armour.${plate}.mesh`, geometry: armour.geometry, material: 'toon' }], at: offset, part: plate })) };
  row.temperament = { brain: 'none', reaction: 'aggressive', leash: 40, assist: 0, home: { speed: 2, stop: 1 } };
  row.abilities = [{ use: 'fixture.mech.rockets', range: [4, 20], cooldown: 2, weight: 1, projectile: { speed: 14, gravity: 0, radius: 0.3 } },
    { use: 'fixture.mech.stomp', range: 3, cooldown: 2, weight: 1, effect: 'knockback', strength: 4 }];
  const mechs = [...Array(n).keys()].map(i => `fixture.mech.${i + 1}`), scripts = [], blobs = [];
  for (const [i, id] of mechs.entries()) {
    const self = A(id, i + 1), [laser, rockets, stomp] = ['laser', 'rockets', 'stomp'].map((k, n) => S(`fixture.mech.${k}`, n + 1)),
      [jets, walk] = ['jets', 'walk'].map((k, n) => M(`fixture.mech.${k}`, n + 1)), wasm = await compileScript(guest(`const p=read(${READ.nearestPlayer},${self},0);
for(let i=0;i<events();i++){const k=i32(ev(i,0));if(k==${ON['part.broken']}&&ev(i,1)==${self})setState(0,state(0)+1);
if(k==${ON['move.done']}&&state(2)==1){setState(2,2);if(p!=0)emit(${DO.move},${self},${walk},p,0);}}
setState(1,state(1)+1);const n=i32(state(1));
if(p!=0){if(state(0)==0){if(n%10==0)emit(${DO.strike},${self},n%20==0?${laser}:${rockets},p,0);}
else if(state(2)==0){setState(2,1);emit(${DO.move},${self},${jets},p,0);}
else if(state(2)==2&&n%10==0)emit(${DO.strike},${self},${stomp},p,0);}`, 3), { abi: 1 });
    if (!blobs.some(blob => hash(blob) === hash(wasm))) blobs.push(wasm);
    scripts.push({ ...script(`mech${self}`, id, wasm, { on: ['start', 'tick', 'part.broken', 'move.done'], tick: 10, commands: ['move', 'strike'], reads: ['nearestPlayer'],
      state: [{ name: 'broken', type: 'f64', default: 0, scope: 'binding' }, { name: 'calls', type: 'f64', default: 0, scope: 'binding' }, { name: 'jets', type: 'f64', default: 0, scope: 'binding' }],
      actors: { mech: id }, strikes: { laser: 'fixture.mech.laser', rockets: 'fixture.mech.rockets', stomp: 'fixture.mech.stomp' },
      moves: { jets: 'fixture.mech.jets', walk: 'fixture.mech.walk' } }), binding: { shard: true } });
  }
  return {
    species: [row], spawns: mechs.map((id, i) => ({ id, species: 'fixture.mech', at: [home.x + (i % 4) * 4 - (n > 1 ? 6 : 0), 0, home.z + 6 + Math.floor(i / 4) * 4] })),
    strikes: [strike('fixture.mech.laser', { shape: { kind: 'lane', length: 14, width: 1.2 }, range: 14, tags: ['dmg.fire'] }),
      strike('fixture.mech.rockets', { shape: { kind: 'sphere', radius: 1.5 }, range: 20 }), strike('fixture.mech.stomp', { shape: { kind: 'sphere', radius: 3 }, range: 3 })],
    looks: [body.look],
    moves: [{ id: 'fixture.mech.jets', kind: 'leap', to: { kind: 'target' }, height: 4 },
      { id: 'fixture.mech.walk', kind: 'stalk', speed: 3, turn: 3, ground: true, standOff: 2, above: 0, ready: { kind: 'band', tolerance: 0.5 } }],
    scripts, files: [...body.files, armour.file], blobs, encounters: mechs.map(id => fight(id, 'Mech', [home.x, 0, home.z + 6])),
  };
}

/** ST1: the kit humanoid (the biped contract's bones) at `scale`, with the kit's swing and slam as plain JSON. */
function humanoid(id, label, hp, size, scale, names = ['swing', 'slam']) {
  const body = skin(id, BIPED), row = species(id, label, hp);
  const kit = file => JSON.parse(readFileSync(resolve(sdk, 'packages/kit/content/abilities', `${file}.json`), 'utf8'));
  const moves = names.map(file => { const { ability, strike: kitStrike } = kit(file), use = `${id}.${file}`;
    return { ability: { ...ability, use }, strike: { ...kitStrike, id: use, damage: 1, tags: [`creature.${file}`] } }; });
  row.dims = { bodyY: 1 * scale, bodyHalfLen: 0.3 * scale, bodyRadius: 0.4 * scale, headRadius: 0.25 * scale, legLen: 0.9 * scale, feet: [], halfWidth: 0.45 * scale };
  row.body = { skeleton: 'biped', size, scale, look: `${id}.look` };
  row.abilities = moves.map(move => move.ability);
  return { species: [row], strikes: moves.map(move => move.strike), looks: [body.look], scripts: [], blobs: [], files: body.files };
}
/** CC18d's witness: every kit ranged template lands on the player inside 60 s. */
function allLand(id, names) {
  return (sim, actor, step) => {
    const strikes = count(sim);
    step(60);
    const landed = Object.fromEntries(names.map(file => [file, strikes.get(`${id}.${file}`) ?? 0]));
    if (names.some(file => landed[file] === 0)) throw new Error(`${id} landed ${JSON.stringify(landed)} in 60 s`);
    return landed;
  };
}
/** ST1's witness: both the swing and the slam land on the player inside 60 s. */
function bothLand(id) {
  return (sim, actor, step) => {
    const strikes = count(sim);
    step(60);
    const swing = strikes.get(`${id}.swing`) ?? 0, slam = strikes.get(`${id}.slam`) ?? 0;
    if (swing === 0 || slam === 0) throw new Error(`${id} landed swing ${swing}, slam ${slam} in 60 s`);
    return { swing, slam };
  };
}

/** Each fixture: its rows, its guests, and its 60 s witness. */
const FIXTURES = {
  orc: { rows: () => humanoid('fixture.orc', 'Orc', 120, 'medium', 1), witness: bothLand('fixture.orc') },
  ogre: { rows: () => humanoid('fixture.ogre', 'Ogre', 300, 'large', 2), witness: bothLand('fixture.ogre') },
  ranged: { rows: () => humanoid('fixture.ranged', 'Kit ranged', 300, 'medium', 1, ['breath', 'shoot', 'spit', 'throw']), witness: allLand('fixture.ranged', ['breath', 'shoot', 'spit', 'throw']) },
  troll: {
    async rows() {
      // state 0: the last hit's tags said fire (bit 0 of the hit's tag mask, the row's first tag alias)
      const wasm = await compileScript(guest(`for(let i=0;i<events();i++){if(ev(i,0)==${ON.hit})setState(0,(i32(ev(i,5))&1)!=0?1:0);}
if(state(0)==0)emit(${DO.heal},self(),3,0,0);`), { abi: 1 });
      return {
        species: [species('fixture.troll', 'Troll', 200)], strikes: [strike('fixture.troll.claw')], looks: [look('fixture.troll', [0.35, 0.5, 0.3])],
        scripts: [script('troll', 'fixture.troll', wasm, { on: ['tick', 'hit'], tick: 10, commands: ['heal'], tags: { fire: 'dmg.fire' },
          state: [{ name: 'burnt', type: 'f64', default: 0, scope: 'binding' }] })],
        blobs: [wasm],
      };
    },
    witness(sim, actor, step) {
      const hit = (tags, amount) => { sim.host.combat.hit({ source: 'env', sourceTags: tags, target: actor.combatActor(), amount, point: actor.position.clone(), dir: new Vector3(0, 0, 1) }); };
      step(5); hit(['dmg.melee'], 80); const cut = actor.hp;
      step(15); const healed = actor.hp;
      hit(['dmg.fire'], 80); step(1); const burnt = actor.hp; // a heal already in flight commits once
      step(39); const after = actor.hp;
      if (!(healed > cut + 20)) throw new Error(`troll did not regenerate after a melee hit (${cut} -> ${healed})`);
      if (after !== burnt) throw new Error(`troll healed after a fire hit (${burnt} -> ${after})`);
      return { cut, healed, burnt, after };
    },
  },
  chameleon: {
    async rows() {
      // hidden (fade 0.1, unlockable) until the nearest player is inside its 4 m reveal radius; then shown, lockable,
      // and its tongue pulls that player 6 m, once (state 0)
      const wasm = await compileScript(guest(`const p=read(${READ.nearestPlayer},self(),0);const d=p==0?1e9:read(${READ.distance},self(),p);
if(d<=4){emit(${DO.actorChannel},self(),0,1,0);emit(${DO.lockable},self(),1,0,0);if(state(0)==0){emit(${DO.pull},p,6,self(),0);setState(0,1);}}
else{emit(${DO.actorChannel},self(),0,0.1,0);emit(${DO.lockable},self(),0,0,0);}`), { abi: 1 });
      const row = species('fixture.chameleon', 'Chameleon', 60, { senses: { notice: 4, reveal: 4 } });
      row.body = { ...row.body, channels: [{ name: 'fade', initial: 0.1 }], bind: { opacity: 'fade' } };
      row.temperament.tuning.speed = 0;
      return {
        species: [row], strikes: [strike('fixture.chameleon.claw')], looks: [look('fixture.chameleon', [0.3, 0.7, 0.3])],
        scripts: [script('chameleon', 'fixture.chameleon', wasm, { on: ['tick'], tick: 10, commands: ['actorChannel', 'lockable', 'pull'],
          reads: ['nearestPlayer', 'distance'], state: [{ name: 'tongue', type: 'f64', default: 0, scope: 'binding' }] })],
        blobs: [wasm],
      };
    },
    witness(sim, actor, step) {
      const player = sim.host.focusedPlayer, gap = () => Math.hypot(player.position.x - actor.position.x, player.position.z - actor.position.z);
      step(2); const far = { gap: gap(), fade: actor.channels[0], lockable: actor.lockable };
      if (far.gap <= 4 || far.fade !== 0.1 || far.lockable) throw new Error(`chameleon not hidden at range: ${JSON.stringify(far)}`);
      player.resetPose({ x: actor.position.x, y: actor.position.y, z: actor.position.z - 3.5 }, 0);
      const before = { x: player.position.x, z: player.position.z };
      step(1); const moved = Math.hypot(player.position.x - before.x, player.position.z - before.z);
      const near = { gap: gap(), fade: actor.channels[0], lockable: actor.lockable, pulled: moved };
      if (near.fade !== 1 || !near.lockable) throw new Error(`chameleon not revealed inside 4 m: ${JSON.stringify(near)}`);
      // a 6 m tongue from 3.5 m away: the player lands at its mouth
      if (moved < 2 || near.gap > 1.5) throw new Error(`tongue did not pull: ${JSON.stringify(near)}`);
      step(57);
      return { far, near };
    },
  },
  dragon: {
    async rows(home) {
      // Handles are each catalogue sorted by id: actor 1; strikes breath 1, claw 2, fireball 3, tail 4; moves climb 1,
      // land 2, orbit 3, walk 4. state 0: the phase (0 air, 1 landed); state 1: decision calls. The air phase climbs,
      // then orbits the player breathing and spitting fireballs; the encounter's hp gate (half) lands it, and it walks
      // in to fight on with claws and tail.
      const me = A('fixture.dragon', 1), [breath, claw, fireball, tail] = ['breath', 'claw', 'fireball', 'tail'].map((k, n) => S(`fixture.dragon.${k}`, n + 1));
      const [climb, land, orbit, walk] = ['climb', 'land', 'orbit', 'walk'].map((k, n) => M(`fixture.dragon.${k}`, n + 1));
      const wasm = await compileScript(guest(`const p=read(${READ.nearestPlayer},${me},0);const hp=read(${READ.hpShare},${me},0);
for(let i=0;i<events();i++){const k=i32(ev(i,0));if(k==${ON.start})emit(${DO.move},${me},${climb},0,0);
if(k==${ON["move.done"]})emit(${DO.move},${me},state(0)==0?${orbit}:${walk},state(0)==0?0:p,0);}
if(state(0)==0&&hp<=0.5){setState(0,1);emit(${DO.move},${me},${land},0,0);}
setState(1,state(1)+1);const n=i32(state(1));
if(p!=0&&n%6==0){if(state(0)==0)emit(${DO.strike},${me},n%12==0?${breath}:${fireball},p,0);else emit(${DO.strike},${me},n%12==0?${claw}:${tail},p,0);}`, 2), { abi: 1 });
      const row = species('fixture.dragon', 'Dragon', 400, { flight: { altitude: 6, above: 'world', climbRate: 6, diveRate: 8 } });
      row.dims = { bodyY: 1.2, bodyHalfLen: 1.6, bodyRadius: 0.8, headRadius: 0.5, legLen: 0.6, feet: [], halfWidth: 1.2 };
      row.body = { ...row.body, size: 'large' };
      row.temperament = { brain: 'none', reaction: 'aggressive', leash: 40, assist: 0, home: { speed: 2, stop: 1 } };
      row.abilities = [];
      const near = { shape: { kind: 'sphere', radius: 3 }, range: 3 };
      return {
        species: [row],
        strikes: [strike('fixture.dragon.claw', near), strike('fixture.dragon.breath', { shape: { kind: 'wedge', length: 14, halfAngle: 0.6 }, range: 14, tags: ['dmg.fire'] }),
          strike('fixture.dragon.fireball', { shape: { kind: 'point', radius: 1.5 }, range: 16, speed: 14, tags: ['dmg.fire'] }), strike('fixture.dragon.tail', near)],
        looks: [look('fixture.dragon', [0.6, 0.15, 0.1])],
        moves: [{ id: 'fixture.dragon.climb', kind: 'climb', speed: 4, turn: 2, seconds: 2, altitude: 6 },
          { id: 'fixture.dragon.orbit', kind: 'orbit', speed: 5, turn: 3, center: [home.x, home.z], r: 8, y: 6 },
          { id: 'fixture.dragon.land', kind: 'lie', speed: 0, turn: 2, from: 6, to: 0, rate: 3, yawLead: 0 },
          { id: 'fixture.dragon.walk', kind: 'stalk', speed: 3, turn: 3, ground: true, standOff: 2, above: 0, ready: { kind: 'band', tolerance: 0.5 } }],
        scripts: [{ ...script('dragon', 'fixture.dragon', wasm, { on: ['start', 'tick', 'move.done'], tick: 10, commands: ['move', 'strike'],
          reads: ['nearestPlayer', 'hpShare'], state: [{ name: 'phase', type: 'f64', default: 0, scope: 'binding' }, { name: 'calls', type: 'f64', default: 0, scope: 'binding' }],
          actors: { dragon: 'fixture.dragon' }, strikes: { claw: 'fixture.dragon.claw', breath: 'fixture.dragon.breath', fireball: 'fixture.dragon.fireball', tail: 'fixture.dragon.tail' },
          moves: { climb: 'fixture.dragon.climb', orbit: 'fixture.dragon.orbit', land: 'fixture.dragon.land', walk: 'fixture.dragon.walk' } }), binding: { shard: true } }],
        // an encounter owns the dragon (its controller); its two phases name the hp gate the script lands at
        encounters: [{ id: 'fixture.dragon.fight', entity: 'fixture.dragon', kind: 'boss', panel: null, name: 'Dragon', title: 'Stranger', retry: 'Again',
          arena: { at: [0, 0, 0], radius: 40 }, intro: 0, introShort: 0, respawn: { at: [0, 0, 0], yaw: 0 },
          phases: [{ at: 1, name: 'Air', caption: 'It takes wing', speed: 0, stopDistance: 0, turnRate: 2 }, { at: 0.5, name: 'Ground', caption: 'It lands', speed: 0, stopDistance: 0, turnRate: 2 }] }],
        blobs: [wasm],
      };
    },
    witness(sim, actor, step) {
      const strikes = new Map();
      sim.host.events.on('damage.dealt', event => { if (event.req.moveId !== undefined) strikes.set(event.req.moveId, (strikes.get(event.req.moveId) ?? 0) + 1); }, sim.host.scope);
      const ground = actor.position.y;
      let high = 0; for (let s = 0; s < 20; s++) { step(1); high = Math.max(high, actor.position.y); }
      const air = actor.position.y;
      if (air - ground < 2.5) throw new Error(`dragon is not in the air (${ground} -> ${air}, high ${high})`);
      sim.host.combat.hit({ source: 'env', sourceTags: ['dmg.melee'], target: actor.combatActor(), amount: actor.maxHp * 0.6, point: actor.position.clone(), dir: new Vector3(0, 0, 1) });
      step(5); const landed = actor.position.y;
      // a flyer stands on its legs (legLen 0.6) once down
      if (landed - ground > 0.7) throw new Error(`dragon did not land at its hp gate (${ground} -> ${landed}, hp ${actor.hp}/${actor.maxHp}, refusals ${JSON.stringify(sim.decisions?.host.metrics())})`);
      step(35);
      const fire = strikes.get('fixture.dragon.breath') ?? 0, melee = (strikes.get('fixture.dragon.claw') ?? 0) + (strikes.get('fixture.dragon.tail') ?? 0);
      if (fire === 0 || melee === 0) throw new Error(`dragon did not breathe aloft and claw landed: ${JSON.stringify(Object.fromEntries(strikes))}`);
      return { ground, high, air, landed, after: actor.position.y, strikes: Object.fromEntries(strikes) };
    },
  },
  mech: {
    rows: home => mechRows(home, 1),
    witness(sim, actor, step) {
      const strikes = count(sim), broken = [];
      sim.host.events.on('creature.part-broken', ({ part: plate }) => { broken.push(plate); }, sim.host.scope);
      step(6);
      const armoured = Object.fromEntries(strikes);
      if (!(armoured['fixture.mech.laser'] > 0 && armoured['fixture.mech.rockets'] > 0) || armoured['fixture.mech.stomp'] !== undefined)
        throw new Error(`an armoured mech does not fire laser and rockets from range: ${JSON.stringify(armoured)}`);
      // a weapon's ray from each side meets that side's plate (x0: the hull takes nothing) until it breaks at 40 hp
      const chest = centre(actor, 'body'), whole = actor.hp, sides = PLATES.map(([plate]) => {
        const out = centre(actor, plate).sub(chest).normalize(); return { plate, from: out.multiplyScalar(6).add(chest) };
      });
      for (const { plate, from } of sides) for (let n = 0; n < 2; n++) {
        const met = shoot(sim, actor, from, chest, 20).part; if (met !== plate) throw new Error(`the ray at ${plate} met ${met}`);
      }
      step(0.1);
      if (actor.hp !== whole || broken.length !== 4 || [...actor.channels].some(value => value !== 1))
        throw new Error(`four plates did not break clean: hp ${whole} to ${actor.hp}, broken ${broken}, channels ${[...actor.channels]}`);
      // four broken plates expose the pilot: every side's ray now meets its body volume at x2
      for (const { from } of sides) {
        const met = shoot(sim, actor, from, centre(actor, 'body'), 10); if (met.part !== 'body' || met.multiplier !== 2) throw new Error(`the pilot is not exposed: ${JSON.stringify(met)}`);
      }
      const exposed = actor.hp;
      if (whole - exposed !== 80) throw new Error(`the pilot did not take x2: ${whole} to ${exposed}`);
      // the tactic changes on part.broken: jets in on the player and stomps
      strikes.clear();
      const ground = actor.position.y, player = sim.host.focusedPlayer;
      let high = ground; for (let s = 0; s < 60 * 6; s++) { step(1 / 60); high = Math.max(high, actor.position.y); }
      const closing = Object.fromEntries(strikes);
      if (high - ground < 2) throw new Error(`the mech did not jet in (${ground} to ${high})`);
      if (!(closing['fixture.mech.stomp'] > 0)) throw new Error(`the mech did not stomp once its plates broke: ${JSON.stringify(closing)}`);
      // the stomp's knockback throws the player off the mech that jetted onto it
      const gap = Math.hypot(player.position.x - actor.position.x, player.position.z - actor.position.z);
      if (gap < 3) throw new Error(`the stomp did not knock the player back (${gap} m)`);
      step(47.9);
      return { armoured, broken, whole, exposed, jets: high - ground, closing, gap };
    },
  },
  mech8: {
    rows: home => mechRows(home, 8),
    witness(sim, actor, step, shard) {
      // 8 mechs and 8 players in one cell, armoured then with every plate broken, against the shard's tick budget
      const budget = shard.serverBudget.tickMicros, mechs = [...Array(8).keys()].map(i => sim.host.entities.get(`fixture.mech.${i + 1}`));
      for (let i = 1; i < 8; i++) sim.host.addPlayer(`player.${i}`, { x: actor.position.x + i * 2 - 7, y: actor.position.y, z: actor.position.z - 6 }, 0);
      step(2);
      const ticks = [], timed = seconds => { for (let tick = 0; tick < seconds * 60; tick++) { const t = process.hrtime.bigint(); sim.host.step(); ticks.push(Number(process.hrtime.bigint() - t) / 1000); } };
      timed(5);
      for (const mech of mechs) for (const [plate] of PLATES) sim.host.combat.hit({ source: 'env', sourceTags: ['dmg.melee'], target: mech.combatActor(), amount: 40,
        point: mech.position.clone(), dir: new Vector3(0, 0, 1), part: plate, partMultiplier: 0 });
      timed(53);
      ticks.sort((x, y) => x - y);
      const mean = ticks.reduce((sum, value) => sum + value, 0) / ticks.length, p95 = ticks[Math.floor(ticks.length * 0.95)];
      if (!(mean < budget && p95 < budget)) throw new Error(`8 mechs and 8 players over ${budget} us a tick: mean ${mean}, p95 ${p95}`);
      if (mechs.some(mech => [...mech.channels].some(value => value !== 1))) throw new Error('a mech kept a plate');
      return { budget, players: sim.host.players.size, mechs: mechs.length, mean: Math.round(mean), p95: Math.round(p95), max: Math.round(ticks.at(-1)) };
    },
  },
  hydra: {
    rows() {
      const body = skin('fixture.hydra', HYDRA), mesh = part();
      const row = species('fixture.hydra', 'Hydra', 300);
      row.dims = { bodyY: 0.9, bodyHalfLen: 0.8, bodyRadius: 0.8, headRadius: 0.35, legLen: 0.5, feet: [], halfWidth: 1 };
      row.body = { size: 'large', scale: 1, look: 'fixture.hydra.look', channels: HEADS.map(head => ({ name: head })),
        volumes: [{ part: 'body', bone: 'body', shape: 'capsule', radius: 0.8, halfLength: 0.6, axis: 'z', multiplier: 1 }, ...HEADS.map(head => ball(head, HEAD_BONES[head], 0.35, 1.5, { hp: 50, channel: head }))],
        attachments: HEADS.map(head => ({ id: `hydra.${head}`, socket: HEAD_BONES[head], meshes: [{ id: `hydra.${head}.mesh`, geometry: mesh.geometry, material: 'toon' }], part: head })) };
      row.temperament.tuning.speed = 0;
      return { species: [row], strikes: [strike('fixture.hydra.claw')], looks: [body.look], scripts: [], files: [...body.files, mesh.file], blobs: [] };
    },
    witness(sim, actor, step) {
      const broken = [], hp = actor.hp;
      sim.host.events.on('creature.part-broken', ({ part: head }) => { broken.push(head); }, sim.host.scope);
      step(1);
      // each head, struck from above, breaks alone at 50 hp: only its channel rises and the others still take blows
      const heads = [];
      for (const [n, head] of HEADS.entries()) {
        const at = centre(actor, head), from = at.clone().add(new Vector3(0, 5, 0));
        for (let blow = 0; blow < 2; blow++) { const met = shoot(sim, actor, from, at, 25).part; if (met !== head) throw new Error(`the blow at ${head} met ${met}`); }
        step(0.1);
        const channels = [...actor.channels].slice(0, 3);
        if (broken.join() !== HEADS.slice(0, n + 1).join() || channels.some((value, i) => value !== (i <= n ? 1 : 0))) throw new Error(`${head} did not break alone: ${broken}, ${channels}`);
        const after = shoot(sim, actor, from, at, 0).part;
        if (after === head) throw new Error(`a broken ${head} still takes blows`);
        heads.push({ head, channels, after });
      }
      step(58);
      if (!actor.alive || actor.hp !== hp - 2 * 3 * 25 * 1.5) throw new Error(`the hydra's body took ${hp - actor.hp}, not its heads' x1.5 blows`);
      return { heads, hp: actor.hp };
    },
  },
  shifter: {
    async rows() {
      // actor 1 the man (a biped), 2 the beast (a quadruped: the skeleton changes). Path a: at 75% the man's `beast` channel
      // swaps its look on one body; path b: at 50% it despawns and the beast spawns in its place at its hp %.
      const manH = A('fixture.shifter', 1), beastH = A('fixture.shifter.beast', 2);
      const wasm = await compileScript(guest(`for(let i=0;i<events();i++){if(ev(i,0)==${ON.start})emit(${DO.despawn},${beastH},0,0,0);}
const hp=read(${READ.hpShare},${manH},0);
if(state(0)==0&&hp<=0.75){emit(${DO.actorChannel},${manH},0,1,0);setState(0,1);}
else if(state(0)==1&&hp<=0.5){emit(${DO.despawn},${manH},${beastH},0,0);setState(0,2);}`), { abi: 1 });
      const man = skin('fixture.shifter', BIPED), beast = skin('fixture.shifter.beast', QUADRUPED);
      const form = species('fixture.shifter', 'Shifter', 200), other = species('fixture.shifter.beast', 'Shifter beast', 300);
      form.body = { skeleton: 'biped', size: 'medium', scale: 1, look: 'fixture.shifter.look', channels: [{ name: 'beast' }], swap: { channel: 'beast', look: 'fixture.shifter.wolf' } };
      other.body = { skeleton: 'quadruped', size: 'medium', scale: 1, look: 'fixture.shifter.beast.look' };
      for (const row of [form, other]) { row.temperament = { brain: 'none', reaction: 'aggressive', leash: 40, assist: 0, home: { speed: 2, stop: 1 } }; row.abilities = []; }
      return {
        species: [form, other], strikes: [strike('fixture.shifter.claw')],
        looks: [man.look, beast.look, { ...look('fixture.shifter', [0.5, 0.4, 0.3]), id: 'fixture.shifter.wolf' }],
        scripts: [{ ...script('shifter', 'fixture.shifter', wasm, { on: ['start', 'tick'], tick: 10, commands: ['actorChannel', 'despawn'], reads: ['hpShare'],
          state: [{ name: 'form', type: 'f64', default: 0, scope: 'binding' }], actors: { man: 'fixture.shifter', beast: 'fixture.shifter.beast' } }), binding: { shard: true } }],
        files: [...man.files, ...beast.files], blobs: [wasm],
        encounters: [fight('fixture.shifter', 'Shifter', [0, 0, 0]), fight('fixture.shifter.beast', 'Beast', [0, 0, 0])],
      };
    },
    witness(sim, actor, step) {
      const beast = sim.host.entities.get('fixture.shifter.beast'), hit = amount => { sim.host.combat.hit({ source: 'env', sourceTags: ['dmg.melee'], target: actor.combatActor(), amount,
        point: actor.position.clone(), dir: new Vector3(0, 0, 1) }); };
      step(1);
      if (beast.alive || beast.position.y > -1000) throw new Error('the beast form is in the world before its shift');
      hit(60); step(1);
      const a = { channel: actor.channels[0], share: actor.hp / actor.maxHp };
      if (a.channel !== 1 || a.share !== 0.7) throw new Error(`path a did not swap the look keeping hp %: ${JSON.stringify(a)}`);
      hit(50); const at = actor.position.clone(), share = actor.hp / actor.maxHp; step(1);
      const b = { share: beast.hp / beast.maxHp, moved: Math.hypot(beast.position.x - at.x, beast.position.z - at.z), manAbsent: !actor.alive && actor.position.y < -1000 };
      if (!beast.alive || Math.abs(b.share - share) > 1 / beast.maxHp || b.moved > 0.5 || !b.manAbsent) throw new Error(`path b did not respawn the beast keeping hp %: ${JSON.stringify(b)}`);
      step(57);
      if (actor.alive || !beast.alive) throw new Error(`the shift did not hold: man ${actor.alive}, beast ${beast.alive}`);
      return { a, b: { ...b, was: share } };
    },
  },
  horse: {
    rows() {
      // ONE-FORMAT CC40c: the skeleton horse, a plain-JSON `mount` row on the kit quadruped (a placeholder body)
      const body = skin('fixture.bonehorse', QUADRUPED), row = species('fixture.bonehorse', 'Skeleton horse', 60);
      row.aggressive = false; row.abilities = [];
      row.dims = { bodyY: 1.4, bodyHalfLen: 1, bodyRadius: 0.4, headRadius: 0.25, legLen: 0.9, feet: [], halfWidth: 0.4 };
      row.body = { skeleton: 'quadruped', size: 'large', scale: 1, look: 'fixture.bonehorse.look' };
      row.temperament = { brain: 'pursue', reaction: 'passive', leash: 35, assist: 0, home: { speed: 2, stop: 1 },
        tuning: { speed: 1.2, turnRate: 4, thinkDivisor: 3, attackCooldownTicks: 60, wanderRadius: 0, wanderEveryTicks: 420 } };
      row.senses = { notice: 4 };
      row.mount = { gaits: HORSE_GAITS };
      return { species: [row], strikes: [strike('fixture.bonehorse.claw')], looks: [body.look], scripts: [], files: body.files, blobs: [],
        spawns: [{ id: 'fixture.bonehorse', species: 'fixture.bonehorse', yaw: Math.PI, at: [-100, 0, 100] }] }; // open ground, clear of the seed's hall
    },
    witness(sim, horse, step) {
      const riding = sim.riding, player = sim.host.focusedPlayer, routes = actRoutes(sim.host);
      if (riding === null) throw new Error('a mount row installed no riding primitive');
      player.resetPose({ x: horse.position.x - 1.5, y: horse.position.y, z: horse.position.z }, 0);
      step(0.1);
      if (routes.mountable?.(horse.entityId) !== true) throw new Error('the skeleton horse is not mountable');
      routes.ride?.(player.id, 'mount');
      if (riding.ridden(player.id) !== horse) throw new Error('the player did not mount the skeleton horse');
      // the reins: a walk is the stick pushed a little, a gallop is the stick held with sprint; metres in the last second
      const reins = (stick, sprint) => ({ commandVersion: 1, steer: { keyX: 0, keyY: 0, stickX: 0, stickY: stick }, sprint, moveX: 0, moveZ: 0, yaw: Math.PI });
      const ride = (seconds, command) => {
        const commands = new Map([[player.id, command]]), steps = Math.round(seconds * 60);
        let last = 0;
        for (let i = 0; i < steps; i++) { const { x, z } = horse.position; sim.host.step(commands); if (i >= steps - 60) last += Math.hypot(horse.position.x - x, horse.position.z - z); }
        return last;
      };
      const walk = ride(3, reins(0.3, false)), gallop = ride(6, reins(1, true));
      ride(4, reins(0, false));
      if (Math.abs(walk - HORSE_GAITS.walk) > 0.5 || Math.abs(gallop - HORSE_GAITS.gallop) / HORSE_GAITS.gallop > 0.05) throw new Error(`the gaits are off: walk ${walk}, gallop ${gallop}`);
      routes.ride?.(player.id, 'dismount');
      const off = Math.hypot(player.position.x - horse.position.x, player.position.z - horse.position.z);
      if (riding.ridden(player.id) !== null || off > 3) throw new Error(`the player did not dismount beside it (${off} m)`);
      step(46);
      return { walk, gallop, off };
    },
  },
};

// ONE-FORMAT OF25: `compose <src>` writes the stranger shard itself: the plain hand-written seed with every fixture in its
// own corner of the world, the kit wolf pack and deer herd (the population), the skeleton horse (riding) and the dragon
// (the boss). Each fixture keeps its own rows and guests; only where it stands changes.
const LAYOUT = {
  horse: [-14, 22], dragon: [0, -85], orc: [55, -15], ogre: [64, 8], troll: [55, 30], chameleon: [-55, -15],
  mech: [-64, 8], hydra: [-55, 32], shifter: [32, -55],
};
const PYTHON = { rabbit: [-28, -50], dragonfly: [-8, -60] };
const POPULATION = { wolf: { group: 'stranger.wolves', at: [[30, 52], [33, 55], [27, 56]] }, deer: { group: 'stranger.deer', at: [[-30, 52], [-33, 56], [-27, 57]] } };
async function compose(src) {
  const kit = resolve(sdk, 'packages/kit/content');
  writeHandwrittenSource(src, 'stranger');
  const read = section => JSON.parse(readFileSync(resolve(src, 'sections', `${section}.json`), 'utf8'));
  const write = (section, value) => { mkdirSync(resolve(src, 'sections', section, '..'), { recursive: true }); writeFileSync(resolve(src, 'sections', `${section}.json`), `${JSON.stringify(value)}\n`); };
  // pass 1 reads every fixture's ids for the shard's catalogues; pass 2 compiles each guest against them
  CATALOGUE = null;
  const first = await gather(kit, src);
  const sorted = names => new Map([...names].sort().map((name, index) => [name, index + 1]));
  CATALOGUE = { actors: sorted(first.spawns.map(row => row.id)), strikes: sorted(first.strikes.map(row => row.id)), moves: sorted(first.moves.map(row => row.id)) };
  const all = await gather(kit, src);
  for (const key of ['species', 'strikes', 'looks', 'scripts', 'moves', 'encounters', 'brains', 'spawns']) {
    const ids = all[key].map(row => row.id), twice = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (twice.length > 0) throw new Error(`compose: ${key} ids twice: ${twice.join(', ')}`);
  }
  // the kit's harvest items the wolf and the deer drop (kit `content/harvest-items.json`), in the item catalogue
  const drops = new Set(all.species.flatMap(row => (row.harvest ?? []).map(entry => entry.item)));
  const items = read('combat/items'), catalogue = JSON.parse(readFileSync(resolve(kit, 'harvest-items.json'), 'utf8'));
  items.items.catalogue = [...(items.items.catalogue ?? []), ...catalogue.filter(row => drops.has(row.id))];
  write('combat/items', items);
  const spawns = writeRows(src, all, read, write);
  await card(src, read, write);
  return spawns;
}
/** The stranger's name, words and curated hero (fixtures/hero.py), on its manifest and its discovery card. */
async function card(src, read, write) {
  const { assetCost } = await at(engine, 'node_modules/@wildshard/format/src/format/shardfile-assets.ts');
  const edition = process.argv[6] ?? 'edition 1', heroes = resolve(scratch, 'hero');
  const made = spawnSync('python3', [resolve(root, 'hero.py'), heroes, edition], { encoding: 'utf8' });
  if (made.status !== 0) throw new Error(`hero.py: ${made.stderr}`);
  const index = JSON.parse(readFileSync(resolve(src, 'shard.json'), 'utf8')), urls = {};
  for (const slot of ['thumb', 'portrait', 'landscape']) {
    const bytes = readFileSync(resolve(heroes, `${slot}.jpg`)), id = hash(bytes), path = `blobs/image/${id}.jpg`;
    writeFileSync(resolve(src, path), bytes);
    const cost = assetCost('image', new Uint8Array(bytes));
    index.files.push({ compressed: bytes.length, critical: false, ...cost, dependencies: [], hash: id, kind: 'image', name: `ui/images/hero-${slot}`, path });
    index.admission.library.push(id); index.admission.budgets.library.compressed += bytes.length; index.admission.budgets.library.resident += cost.decoded + cost.gpu;
    urls[slot] = `/shardfiles/stranger/${path}`;
  }
  rmSync(heroes, { recursive: true, force: true });
  index.identity = { ...index.identity, name: 'Stranger', author: 'Wildshard' };
  writeFileSync(resolve(src, 'shard.json'), `${JSON.stringify(index)}\n`);
  const words = { biome: 'Stranger fixtures', blurb: 'A skeleton horse to ride, a dragon to fight, a wolf pack and a deer herd, and every fixture of the one format.' };
  const look = read('look/look'), hashes = Object.fromEntries(Object.entries(urls).map(([slot, url]) => [slot, url.replace(/^.*\/(\w{64})\.jpg$/u, '$1')]));
  look.presentation = { ...look.presentation, ...words, card: { ...look.presentation.card, ...hashes } };
  // The mech's plates and the hydra's heads hang meshes in material `toon`; the client compiles attachment materials from
  // this registry and refuses an absent one (engine clientAttachments.ts), though the server sims never draw them.
  look.look.materials.toon ??= { ...look.look.materials.door, colour: [0.55, 0.57, 0.6], metalness: 0.6, roughness: 0.5, vertexColours: false };
  write('look/look', look);
  const level = read('ui/level');
  level.manifest = { ...level.manifest, ...words, card: urls };
  write('ui/level', level);
  const discoveryPath = resolve(src, 'mounts/shardfiles/stranger/discovery.json'), discovery = JSON.parse(readFileSync(discoveryPath, 'utf8'));
  discovery.data = { ...discovery.data, ...words, name: 'Stranger', card: urls };
  const bytes = Buffer.from(JSON.stringify(discovery)); writeFileSync(discoveryPath, bytes);
  // cook.json states each mount's size and hash
  const cook = JSON.parse(readFileSync(resolve(src, 'cook.json'), 'utf8'));
  for (const mount of cook.mounts) if (mount.path === 'mounts/shardfiles/stranger/discovery.json') Object.assign(mount, { bytes: bytes.length, hash: hash(bytes) });
  const cookBytes = Buffer.from(`${JSON.stringify(cook)}\n`); writeFileSync(resolve(src, 'cook.json'), cookBytes);
  const settled = JSON.parse(readFileSync(resolve(src, 'shard.json'), 'utf8'));
  settled.cook = { ...settled.cook, bytes: cookBytes.length, hash: hash(cookBytes) };
  writeFileSync(resolve(src, 'shard.json'), `${JSON.stringify(settled)}\n`);
}
/** Every fixture's rows at its place in the world, the Python pair and the kit population, merged. */
async function gather(kit, src) {
  const all = { species: [], strikes: [], looks: [], scripts: [], blobs: [], files: [], moves: [], encounters: [], brains: [], spawns: [] };
  const take = (rows, spawns) => {
    for (const key of ['species', 'strikes', 'looks', 'scripts', 'blobs', 'files', 'moves', 'encounters', 'brains']) all[key].push(...(rows[key] ?? []));
    all.spawns.push(...spawns);
  };
  for (const [id, [x, z]] of Object.entries(LAYOUT)) {
    const home = { x, y: 0, z: z - 6 }, rows = await FIXTURES[id].rows(home);
    const spawns = (rows.spawns ?? rows.species.map(row => ({ id: row.id, species: row.id })))
      .map((row, i) => ({ ...row, at: id === 'horse' ? [x, 0, z] : row.at ?? [x + i * 3, 0, z] }));
    for (const fight of rows.encounters ?? []) { fight.arena.at = [x, 0, z]; fight.respawn.at = [x, 0, z + 20]; }
    take(rows, spawns);
  }
  // the rabbit and the dragonfly are Python's (write-fixture.py), written into a seed of their own and carried over
  for (const [id, [x, z]] of Object.entries(PYTHON)) {
    mkdirSync(scratch, { recursive: true }); const seed = resolve(scratch, `python-${id}`); rmSync(seed, { recursive: true, force: true });
    writeHandwrittenSource(seed, 'stranger');
    const made = spawnSync('python3', [resolve(root, 'write-fixture.py'), seed, id], { encoding: 'utf8' });
    if (made.status !== 0) throw new Error(`write-fixture.py ${id}: ${made.stderr}`);
    const at = section => JSON.parse(readFileSync(resolve(seed, 'sections', `${section}.json`), 'utf8'));
    const { brains, spawns } = at('actors/creatures').creatures;
    take({ species: at('actors/species').rows.species, strikes: at('combat/strikes').rows.strikes, looks: at('look/materials').rows.looks, brains },
      spawns.map(row => ({ ...row, at: [x, row.at[1], z] })));
    rmSync(seed, { recursive: true, force: true });
  }
  // the population: the kit's own wolf and deer rows and bodies, read as plain files (kit GUIDE "Deer and wolf bodies")
  for (const [name, { group, at }] of Object.entries(POPULATION)) {
    const { species: row, strikes } = JSON.parse(readFileSync(resolve(kit, 'creatures', `${name}.json`), 'utf8'));
    const glbBytes = readFileSync(resolve(kit, 'wildlife', `${name}.glb`)), metadata = readFileSync(resolve(kit, 'wildlife', `${name}.skin.json`));
    take({ species: [row], strikes, looks: [{ id: row.body.look, species: row.id, recipe: 'platform.skin', material: null, parameters: { skin: hash(metadata) },
      animation: { recipe: 'platform.clips', parameters: { attackSpan: 1 } } }],
    files: [{ bytes: glbBytes, kind: 'glb', cost: JSON.parse(metadata).row.cost }, { bytes: metadata, kind: 'json', dependencies: [hash(glbBytes)], library: true }] },
    at.map(([x, z], i) => ({ id: `stranger.${name}.${i + 1}`, species: row.id, variant: row.variants[0].id, group, at: [x, 0, z] })));
  }
  return all;
}
/** Write merged rows into the seed at `src`: sections, wasm guests and bodies, and the index entries that admit them. */
function writeRows(src, rows, read, write) {
  const spawns = rows.spawns;
  write('actors/species', { rows: { species: rows.species } });
  write('combat/strikes', { rows: { strikes: rows.strikes } });
  write('look/materials', { rows: { looks: rows.looks } });
  write('actors/creatures', { creatures: { brains: rows.brains ?? [], groups: [], spawns: spawns.map((row, i) => ({
    variant: 'plain', brain: null, strike: null, seed: 17 + i, scale: 1, yaw: Math.PI, ...row })) } });
  mkdirSync(resolve(src, 'blobs/wasm'), { recursive: true });
  const index = JSON.parse(readFileSync(resolve(src, 'shard.json'), 'utf8')), have = new Set(index.files.map(row => row.hash));
  for (const blob of rows.blobs) {
    const path = `blobs/wasm/${hash(blob)}.wasm`; if (have.has(hash(blob))) continue; have.add(hash(blob)); writeFileSync(resolve(src, path), blob);
    index.files.push({ compressed: blob.length, critical: true, decoded: blob.length, dependencies: [], draws: 0, gpu: 0, hash: hash(blob), kind: 'wasm', path, triangles: 0 }); index.admission.critical.push(hash(blob)); index.admission.budgets.sim.compressed += blob.length; index.admission.budgets.sim.resident += blob.length * 4 + 131072; index.admission.serverBudget.memory += blob.length * 4 + 131072;
  }
  for (const file of rows.files ?? []) {
    const id = hash(file.bytes), path = `blobs/${file.kind}/${id}.${file.kind}`;
    if (have.has(id)) continue; have.add(id);
    mkdirSync(resolve(src, 'blobs', file.kind), { recursive: true }); writeFileSync(resolve(src, path), file.bytes);
    // a kit body's skin file states its GLB's cost, which the index must not understate
    const cost = file.cost ?? (file.kind === 'glb' ? parseGlbData(file.bytes) : { decoded: file.bytes.length, gpu: 0, triangles: 0, draws: 0 });
    index.files.push({ compressed: file.bytes.length, critical: false, ...cost, dependencies: file.dependencies ?? [], hash: id, kind: file.kind, path });
    if (file.library === true) index.admission.library.push(id);
    index.admission.budgets.library.compressed += file.bytes.length; index.admission.budgets.library.resident += cost.decoded + cost.gpu;
  }
  const moves = rows.moves ?? [];
  for (const section of [...(rows.scripts.length > 0 ? ['sim/scripts'] : []), ...(moves.length === 0 ? [] : ['actors/moves'])]) {
    if (index.sections.some(row => row.name === section)) continue;
    index.sections.push({ bytes: 0, hash: '0'.repeat(64), name: section, path: `sections/${section}.json`, schema: `wildshard:${section}@1` });
  }
  index.sections.sort((a, b) => a.name < b.name ? -1 : 1);
  writeFileSync(resolve(src, 'shard.json'), `${JSON.stringify(index)}\n`);
  if (rows.scripts.length > 0) write('sim/scripts', rows.scripts);
  if (moves.length > 0) write('actors/moves', moves);
  if ((rows.encounters ?? []).length > 0) write('combat/encounters', { encounters: rows.encounters });
  return spawns;
}

if (name === 'compose') {
  const src = resolve(process.argv[5] ?? resolve(root, '..', 'src'));
  rmSync(src, { recursive: true, force: true });
  const spawns = await compose(src);
  console.log(JSON.stringify({ composed: src, spawns: spawns.length }));
  process.exit(0);
}
const fixture = FIXTURES[name];
if (fixture === undefined) throw new Error(`Unknown fixture ${name}: ${Object.keys(FIXTURES).join(', ')}`);
mkdirSync(scratch, { recursive: true });
const work = mkdtempSync(resolve(scratch, `${name}-`)), src = resolve(work, 'src');
try {
  writeHandwrittenSource(src, 'stranger-fixtures');
  const read = section => JSON.parse(readFileSync(resolve(src, 'sections', `${section}.json`), 'utf8'));
  const write = (section, value) => { mkdirSync(resolve(src, 'sections', section, '..'), { recursive: true }); writeFileSync(resolve(src, 'sections', `${section}.json`), `${JSON.stringify(value)}\n`); };
  const spawnAt = read('world/spawn').spawn;
  const rows = await fixture.rows(spawnAt);
  write('actors/species', { rows: { species: rows.species } });
  write('combat/strikes', { rows: { strikes: rows.strikes } });
  write('look/materials', { rows: { looks: rows.looks } });
  const spawns = rows.spawns ?? rows.species.map(row => ({ id: row.id, species: row.id }));
  write('actors/creatures', { creatures: { brains: [], groups: [], spawns: spawns.map((row, i) => ({
    variant: 'plain', brain: null, strike: null, seed: 17 + i, scale: 1, yaw: Math.PI, at: [spawnAt.x + i * 3, 0, spawnAt.z + 6], ...row })) } });
  mkdirSync(resolve(src, 'blobs/wasm'), { recursive: true });
  const index = JSON.parse(readFileSync(resolve(src, 'shard.json'), 'utf8'));
  for (const blob of rows.blobs) {
    const path = `blobs/wasm/${hash(blob)}.wasm`; writeFileSync(resolve(src, path), blob);
    index.files.push({ compressed: blob.length, critical: true, decoded: blob.length, dependencies: [], draws: 0, gpu: 0, hash: hash(blob), kind: 'wasm', path, triangles: 0 }); index.admission.critical.push(hash(blob)); index.admission.budgets.sim.compressed += blob.length; index.admission.budgets.sim.resident += blob.length * 4 + 131072; index.admission.serverBudget.memory += blob.length * 4 + 131072;
  }
  // AC6: skins (a GLB and its metadata, a library root) and attachment meshes
  for (const file of rows.files ?? []) {
    const id = hash(file.bytes), path = `blobs/${file.kind}/${id}.${file.kind}`;
    mkdirSync(resolve(src, 'blobs', file.kind), { recursive: true }); writeFileSync(resolve(src, path), file.bytes);
    const cost = file.kind === 'glb' ? parseGlbData(file.bytes) : { decoded: file.bytes.length, gpu: 0, triangles: 0, draws: 0 };
    index.files.push({ compressed: file.bytes.length, critical: false, ...cost, dependencies: file.dependencies ?? [], hash: id, kind: file.kind, path });
    if (file.library === true) index.admission.library.push(id);
    index.admission.budgets.library.compressed += file.bytes.length; index.admission.budgets.library.resident += cost.decoded + cost.gpu;
  }
  for (const section of [...(rows.scripts.length > 0 ? ['sim/scripts'] : []), ...(rows.moves === undefined ? [] : ['actors/moves'])]) {
    if (index.sections.some(row => row.name === section)) continue;
    index.sections.push({ bytes: 0, hash: '0'.repeat(64), name: section, path: `sections/${section}.json`, schema: `wildshard:${section}@1` });
  }
  index.sections.sort((a, b) => a.name < b.name ? -1 : 1);
  writeFileSync(resolve(src, 'shard.json'), `${JSON.stringify(index)}\n`);
  if (rows.scripts.length > 0) write('sim/scripts', rows.scripts);
  if (rows.moves !== undefined) write('actors/moves', rows.moves);
  if (rows.encounters !== undefined) write('combat/encounters', { encounters: rows.encounters });
  const checked = spawnSync(process.execPath, ['packages/cli/bin/wildshard.mjs', 'check', work, '--json'], { cwd: sdk, encoding: 'utf8' });
  let report;
  try { report = JSON.parse(checked.stdout); } catch { throw new Error(`check printed no report:\n${checked.stdout}\n${checked.stderr}`); }
  if (process.env.DIAGNOSE === '1') console.error(JSON.stringify((report.refusals ?? []).map(row => row.message)));
  if ((checked.status !== 0 || report.verdict !== 'pass') && process.env.DIAGNOSE !== '1') throw new Error(`check refused ${name}:\n${JSON.stringify(report.refusals ?? report, null, 1)}`);
  const { shard, assets, sections } = validateOutputProduct(report.output);
  const sim = createShardfileSim(shard, assets, { rapier: await loadRapier(readFileSync(resolve(engine, 'public/assets/physics/rapier.wasm'))), sections,
    quest: { fact: () => undefined, coins: () => undefined } });
  try {
    const actor = sim.host.entities.get(spawns[0].id); if (actor === undefined) throw new Error(`Missing ${name}`);
    const step = seconds => { for (let tick = 0; tick < seconds * shard.sim.fixedHz; tick++) sim.host.step(); };
    console.log(JSON.stringify({ fixture: name, ...fixture.witness(sim, actor, step, shard) }));
  } finally { sim.dispose(); }
} finally { if (process.env.KEEP !== '1') rmSync(work, { recursive: true, force: true }); }
