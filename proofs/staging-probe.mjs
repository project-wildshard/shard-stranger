#!/usr/bin/env node
// ONE-FORMAT CC14 (M2), CC36 (M5) and OF14 (CC40c's ride): two players in the stranger shard on staging. Ana is headless
// Chromium at desktop size, Bo headless WebKit at Jake's phone size (402×874). Each case walks Ana to the rows it proves
// while Bo stands by, and reads what BOTH pages are told of each creature (the server's own fields: state, hp, alive,
// channels, lockable) and where they draw it. Shots from both pages at each beat.
//   wolves     the kit wolf pack: Ana strikes one wolf, its pack mates take up the hunt (assist); both players land hits
//   deer       the kit deer herd: a hind bolts (state flee) from the player who walks at it, on both pages
//   chameleon  faded (channel 0.1, not lockable) until a player is inside 4 m, then shown (1, lockable) on both pages
//   mech       a player's blows break an armour plate: its channel reads 1 on both pages
//   horse      Ana mounts the skeleton horse, walks and gallops it, and gets off beside it; Bo sees her ride
//   boss       both shoot the flying dragon with the lever until its hp gate lands it, then fight on with swords
//   harvest    Ana fells a kit wolf, both pages see it fall, and Ana harvests its body for the kit's drops (meta MA15)
// Bo is headless WebKit in an iPhone profile at Jake's iPhone 17 Pro size (402×874 at pixel density 3, meta MA15). Both
// pages carry the agent marker in their user agent (the engine's browser-playwright marks every context), never `?agent=`.
// J205: staging, preview or a local dev world on this Mac, never production. Headless and muted, 60 fps cap.
// A local world (meta QA 11-24 row 45, J453 keeps a proof slug off the staging grid): a `pnpm dev` world on 127.0.0.1 whose
// client baked the slug into a cell. There the probe also seats Cy (`--third`, a second desktop page), checks that every page
// names each creature with the same species (identity), and checks the world's release against the key its page was stamped
// with (signed admission).
//   node proofs/staging-probe.mjs <engine checkout> <out dir> [--base=https://staging.wildshard.io|http://127.0.0.1:<port>] [--slug=proof-stranger] [--cases=wolves,harvest,…] [--third]
import { verify } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { enterZone } from '@wildshard/sdk/headless/scripts/zone-entry.mjs'; // CHUNK-PARAM-REMOVAL CP20 (J522): no zone in any address

const [engineDir, outDir] = process.argv.slice(2).filter(arg => !arg.startsWith('--')).map(path => resolve(path));
const flag = (name, fallback) => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
if (engineDir === undefined || outDir === undefined) throw new Error('usage: staging-probe.mjs <engine checkout> <out dir> [--base=…] [--cases=…]');
const base = flag('base', 'https://staging.wildshard.io').replace(/\/$/u, '');
const local = /^http:\/\/(127\.0\.0\.1|localhost):[0-9]{2,5}$/u.test(base);
if (!local && !/^https:\/\/(staging|preview)\.wildshard\.io$/u.test(base)) throw new Error('--base takes staging, preview or a local dev world only (J205)');
const third = process.argv.includes('--third');
const cases = flag('cases', 'horse,chameleon,deer,wolves,harvest,mech,boss').split(',').filter(Boolean), slug = flag('slug', 'proof-stranger');
const at = file => import(pathToFileURL(resolve(engineDir, 'scripts', file)).href);
const { chromium, webkit, devices } = await at('browser-playwright.mjs');
const { KEYCHAIN_ARGS } = await at('chromium-keychain.mjs');
const { saveFixture } = await at('debug-settings.mjs');
mkdirSync(outDir, { recursive: true });

const sleep = ms => new Promise(done => { setTimeout(done, ms); });
const log = [], verdicts = {};
const note = (step, ok, detail) => { log.push({ t: new Date().toISOString(), step, ok, detail }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${step}${detail === undefined ? '' : ` ${JSON.stringify(detail).slice(0, 400)}`}`); return ok; };

/** A page in the stranger: devMode on (the net client is readable), muted, 60 fps. */
async function enter(browser, name, device) {
  const context = await browser.newContext(device), page = await context.newPage(), errors = [];
  page.on('pageerror', error => { errors.push(error.message.slice(0, 240)); });
  await saveFixture(context, { scope: 'device', key: 'devMode', data: true });
  await saveFixture(context, { scope: 'global', key: 'settings', data: { music: false, sfx: false, volume: 0 }, merge: true });
  const t0 = Date.now();
  await enterZone(page, { zone: slug, base, flags: 'mute=1&nolock=1&skipintro=1&fps=60', timeout: 120_000 });
  for (const ends = Date.now() + 150_000; Date.now() < ends;) {
    if (await page.locator('#ws-name-field').isVisible().catch(() => false)) break;
    const clicked = await page.evaluate(title => {
      const all = [...document.querySelectorAll('body *')], head = all.find(e => e.children.length === 0 && (e.textContent ?? '').trim().toUpperCase() === title);
      for (let up = head?.parentElement; up; up = up.parentElement) {
        const load = [...up.querySelectorAll('*')].find(e => e.children.length === 0 && /^(LOAD|ENTER ZONE|ENTER WORLD)$/u.test((e.textContent ?? '').trim().toUpperCase()));
        if (load !== undefined) { (load.closest('button') ?? load).click(); return true; }
      }
      return false;
    }, slug.toUpperCase().replaceAll('-', ' ')).catch(() => false);
    if (await page.getByText(/could not load|the world didn.t download/iu).isVisible().catch(() => false)) throw new Error(`${name}: the shard could not load`);
    await sleep(clicked ? 4000 : 1000);
  }
  if (await page.locator('#ws-name-field').isVisible().catch(() => false)) {
    await page.locator('#ws-name-field').fill(name);
    await page.getByRole('button', { name: /let.s go/iu }).click();
  } else await page.screenshot({ path: resolve(outDir, `${name.toLowerCase()}-no-name-box.png`) }).catch(() => undefined);
  await page.waitForFunction(() => typeof window.__workerClient === 'function' && window.__wildshard?.world?.player !== undefined, undefined, { timeout: 150_000 });
  await page.evaluate(() => window.__wildshard?.world?.hud?.enterNow?.());
  await page.waitForFunction(() => (window.__workerClient?.().frames ?? 0) > 30, undefined, { timeout: 90_000 });
  await page.keyboard.press('Shift');
  note(`${name} entered ${slug}`, true, { ms: Date.now() - t0, cell: (await page.evaluate(() => window.__workerClient().cell)) });
  return { name, page, context, errors };
}

/** What a page is told: its player, the other players and each creature (by the server's id, `creature:N`) with its
 *  species and the server's fields (cell-local x and z, state, hp, alive, channels, lockable, target). */
const look = page => page.evaluate(() => {
  const world = window.__wildshard.world, { player } = world, net = window.__workerClientNet?.().client, bodies = {};
  if (net?.latest) for (const [handle, info] of net.entities) {
    const f = net.fields(net.latest, handle), species = info.initial?.species || info.initial?.kind || f?.species;
    if (f === null || f === undefined || typeof species !== 'string') continue;
    bodies[info.id] = { species, x: Number(f.x), y: Number(f.y), z: Number(f.z), state: f.state ?? null, hp: f.hp ?? null, alive: f.alive ?? null,
      ch: [f.channel1, f.channel2, f.channel3, f.channel4], lockable: f.lockable ?? null, target: f.target ?? null };
  }
  const report = window.__workerClient();
  return { me: { x: player.position.x, y: player.position.y, z: player.position.z, hp: report.hp, falls: report.falls, hits: report.hits }, bodies,
    others: (window.__onlinePlayers?.() ?? []).map(other => ({ name: other.name, x: other.x, z: other.z, speed: other.speed, mounted: other.mounted })) };
});
/** The server ids of `species`, in id order (the same on every page). */
// A body further off than the server's interest range is not on a page at all (meta QA 11-24 row 45, v0.1.90: from the spawn the
// pages hold the fixtures near it, never the kit wolves and deer 58 m off). The shard's own spawn rows name every creature and where
// it stands, so a case knows its ids before any page holds them and walks toward the spawn until one does.
const AUTHORED = new Map(JSON.parse(readFileSync(new URL('../src/sections/actors/creatures.json', import.meta.url), 'utf8')).creatures.spawns
  .map(row => [row.id, { species: row.species, x: row.at[0], z: row.at[2] }]));
const idsOf = (seen, species) => [...new Set([...Object.keys(seen.bodies).filter(id => seen.bodies[id].species === species),
  ...[...AUTHORED].filter(([, row]) => row.species === species).map(([id]) => id)])].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
const named = (seen, who) => seen.others.find(other => other.name.startsWith(who));
/** Get on or off through the page's own ride press (it carries the live command seq). */
const ride = (page, action) => page.evaluate(how => { const net = window.__workerClientNet(); if (typeof net.predictor?.ride === 'function') net.predictor.ride(how); else net.client.act({ kind: 'ride', seq: net.client.seq ?? 0, action: how }); }, action);
/** Where a blow aims on each body, above its feet: the species' `bodyY` (its middle), the mech's chest plates. A kit blow
 *  is judged from the server's eye (1.68 m) along this look, so a level look passes over a wolf's back at arm's length. */
const MIDDLE = { 'kit.creature.wolf': 0.72, 'kit.creature.deer': 0.92, 'fixture.mech': 1.4 };
const aimAt = (seen, body) => Math.atan2((body.y + (MIDDLE[body.species] ?? 1)) - (seen.me.y + 1.68), Math.max(0.3, Math.hypot(body.x - seen.me.x, body.z - seen.me.z)));
const steer = (page, x, z, forward, sprint, swing = false, pitch = -0.15) => page.evaluate(([tx, tz, y, run, hit, look]) => {
  const { player, game } = window.__wildshard.world;
  player.yaw = Math.atan2(-(tx - player.position.x), -(tz - player.position.z)); player.pitch = look;
  player.touchMove.x = 0; player.touchMove.y = y; player.touchSprint = run;
  if (hit) game.app.input.press('attack');
}, [x, z, forward, sprint, swing, pitch]);
/** Take a weapon into hand by its row (revision 4: the lever is the primary, the sword the second slot). */
const hold = (page, id) => page.evaluate(row => {
  const equipment = window.__wildshard.world.game.app.equipment, weapon = equipment?.list.find(entry => entry.row?.id === row || entry.id === row);
  if (weapon !== undefined) equipment.select(weapon.id, true);
  return weapon?.id ?? null;
}, id);
const stop = page => page.evaluate(() => { const { player } = window.__wildshard.world; player.touchMove.x = 0; player.touchMove.y = 0; player.touchSprint = false; });
/** Walk `who` to within `near` m of creature `id` (as its own page draws it). A straight line can meet a wall (the seed's
 *  hall stands between the spawn and the mech): with under half a metre gained in 2.5 s it walks 7 m aside, alternating
 *  sides, and tries again. */
async function goTo(who, id, near, seconds = 60) {
  let best = Infinity, since = Date.now(), side = 1;
  for (const ends = Date.now() + seconds * 1000; Date.now() < ends;) {
    // a body no page holds yet is walked toward where the shard spawns it, round walls the same way, until a page holds it
    const seen = await look(who.page), held = seen.bodies[id], body = held ?? AUTHORED.get(id);
    if (body === undefined) { await sleep(250); continue; }
    const away = Math.hypot(body.x - seen.me.x, body.z - seen.me.z);
    if (held !== undefined && away <= near) { await stop(who.page); return { away, seen }; }
    if (away < best - 0.5) { best = away; since = Date.now(); }
    else if (Date.now() - since > 2500) {
      const dx = (body.x - seen.me.x) / away, dz = (body.z - seen.me.z) / away, aside = { x: seen.me.x - dz * 7 * side, z: seen.me.z + dx * 7 * side };
      for (const off = Date.now() + 1800; Date.now() < off;) { await steer(who.page, aside.x, aside.z, 1, true); await sleep(150); }
      side = -side; best = Infinity; since = Date.now(); continue;
    }
    await steer(who.page, body.x, body.z, 1, away > 10 || held === undefined);
    await sleep(150);
  }
  await stop(who.page);
  const seen = await look(who.page);
  return { away: seen.bodies[id] === undefined ? null : Math.hypot(seen.bodies[id].x - seen.me.x, seen.bodies[id].z - seen.me.z), seen };
}
const shot = async (who, name) => { const file = `${who.name.toLowerCase()}-${name}.png`; await who.page.screenshot({ path: resolve(outDir, file) }).catch(() => undefined); return file; };
const shots = [];
async function both(ana, bo, name) { shots.push({ name, ana: await shot(ana, name), bo: await shot(bo, name) }); }

const CASES = {
  async horse(ana, bo) {
    const [id] = idsOf(await look(bo.page), 'fixture.bonehorse');
    await goTo(bo, id, 9);
    const reached = await goTo(ana, id, 1.6);
    note('horse: Ana beside the skeleton horse', reached.away !== null && reached.away <= 1.6, { away: reached.away });
    await ride(ana.page, 'mount');
    await sleep(800);
    const mounted = named(await look(bo.page), 'Ana');
    const pace = async (forward, sprint, seconds) => {
      // the mount reads held actions (move.forward, ride.gallop), not the walking player's stick
      const hold = (on = true) => ana.page.evaluate(([y, run, down]) => {
        const { player, game } = window.__wildshard.world, input = game.app.input;
        player.touchMove.x = 0; player.touchMove.y = down ? y : 0; player.touchSprint = down && run;
        input.setHeld('move.forward', down); for (const name of ['ride.gallop', 'sprint']) { try { input.setHeld(name, down && run); } catch { /* not this page's action */ } }
      }, [forward, sprint, on]);
      for (const ends = Date.now() + (seconds - 1) * 1000; Date.now() < ends;) { await hold(); await sleep(150); }
      const keep = setInterval(() => { hold().catch(() => undefined); }, 150);
      const a = await look(ana.page), b = await look(bo.page), t = Date.now();
      await sleep(1000);
      const a2 = await look(ana.page), b2 = await look(bo.page), dt = (Date.now() - t) / 1000;
      clearInterval(keep); await hold(false);
      const seenByBo = (from, to) => { const p = named(from, 'Ana'), q = named(to, 'Ana'); return p?.x === undefined || q?.x === undefined ? null : Math.hypot(q.x - p.x, q.z - p.z) / dt; };
      return { own: Math.hypot(a2.bodies[id].x - a.bodies[id].x, a2.bodies[id].z - a.bodies[id].z) / dt, player: Math.hypot(a2.me.x - a.me.x, a2.me.z - a.me.z) / dt, bo: seenByBo(b, b2) };
    };
    await ana.page.evaluate(() => { const { player, game } = window.__wildshard.world; player.touchMove.y = 1; game.app.input.setHeld('move.forward', true); });
    await sleep(400);
    const held = await ana.page.evaluate(() => { const { player } = window.__wildshard.world;
      const c = player.sampleHeldCommand(), sent = player.sampleCommand?.(), rideSample = player.ride?.sampleCommand?.() ?? null, rideClass = player.ride?.constructor?.name ?? null, m = window.__wildshard.world.mount ?? window.__wildshard.world.riding ?? null;
      return { command: c, sent, rideClass, rideSample, mountObject: m === null ? null : Object.keys(m).slice(0, 12), state: player.state ?? null, mounted: player.mounted ?? player.riding ?? null, worldKeys: Object.keys(window.__wildshard.world).filter(k => /ride|mount|horse/iu.test(k)) }; });
    note('horse: what Ana\'s page sends while seated', true, held);
    const walk = await pace(0.3, false, 3);
    await both(ana, bo, 'horse-walk');
    const gallop = await pace(1, true, 5);
    await both(ana, bo, 'horse-gallop');
    await stop(ana.page); await sleep(2500);
    await ride(ana.page, 'dismount');
    await sleep(1200);
    const after = await look(ana.page), off = Math.hypot(after.bodies[id].x - after.me.x, after.bodies[id].z - after.me.z);
    await both(ana, bo, 'horse-off');
    const ok = note('horse: rode it at the row\'s gaits and got off beside it', walk.own > 1.2 && walk.own < 3 && gallop.own > 8.5 && gallop.own < 11.5 && off < 3,
      { mounted, walk, gallop, off });
    const boSees = named(await look(bo.page), 'Ana');
    note('horse: Bo saw Ana ride at a gallop', gallop.bo !== null && gallop.bo > 6, { bo: gallop.bo, now: boSees });
    return ok;
  },
  async chameleon(ana, bo) {
    const [id] = idsOf(await look(bo.page), 'fixture.chameleon');
    await goTo(bo, id, 9);
    const far = { ana: (await look(ana.page)).bodies[id], bo: (await look(bo.page)).bodies[id] };
    note('chameleon: faded and not lockable at range, on both pages', far.ana?.ch[0] < 0.2 && far.bo?.ch[0] < 0.2 && far.bo?.lockable === 'off', { ana: far.ana, bo: far.bo });
    await both(ana, bo, 'chameleon-far');
    // v0.1.50 (opus-of-proofs50b): from the spawn a wall stops the straight walk 19.6 m short; the mech's yard is reached, and
    // the chameleon stands 24 m south of it, so a stuck walk goes by way of the mech
    if ((await goTo(ana, id, 3)).away > 3) {
      const [mech] = idsOf(await look(ana.page), 'fixture.mech');
      if (mech !== undefined) { await goTo(ana, mech, 4); await goTo(ana, id, 3); }
    }
    await sleep(800);
    const anaNow = await look(ana.page), near = { gap: Math.hypot(anaNow.bodies[id].x - anaNow.me.x, anaNow.bodies[id].z - anaNow.me.z), ana: anaNow.bodies[id], bo: (await look(bo.page)).bodies[id] };
    await both(ana, bo, 'chameleon-near');
    return note('chameleon: shown and lockable inside 4 m, on both pages', near.ana?.ch[0] === 1 && near.bo?.ch[0] === 1 && near.bo?.lockable === 'on', { gap: near.gap, ana: near.ana, bo: near.bo });
  },
  async deer(ana, bo) {
    const ids = idsOf(await look(bo.page), 'kit.creature.deer');
    await goTo(bo, ids[0], 26);
    // Ana comes from wherever the last case left her (the chameleon's yard is 70 m off, walls between): first to the herd's edge
    await goTo(ana, ids[0], 30);
    await both(ana, bo, 'deer-before');
    let fled = null;
    for (const ends = Date.now() + 30_000; Date.now() < ends && fled === null;) {
      const seen = await look(ana.page), toward = seen.bodies[ids[0]] ?? AUTHORED.get(ids[0]);
      await steer(ana.page, toward?.x ?? 0, toward?.z ?? 0, 1, true);
      const [a, b] = [await look(ana.page), await look(bo.page)];
      const id = ids.find(each => a.bodies[each]?.state === 'flee' && b.bodies[each]?.state === 'flee');
      if (id !== undefined) fled = { id, ana: a.bodies[id], bo: b.bodies[id] };
      await sleep(200);
    }
    await stop(ana.page);
    await both(ana, bo, 'deer-bolt');
    return note('deer: a hind bolts, on both pages', fled !== null, fled ?? undefined);
  },
  async wolves(ana, bo) {
    await hold(ana.page, 'weapon.stranger-sword'); await hold(bo.page, 'weapon.stranger-sword');
    // the pack stands again 30 s after it falls (stranger revision 3): wait for it
    const ids = idsOf(await look(bo.page), 'kit.creature.wolf');
    await goTo(bo, ids[1], 24); await goTo(ana, ids[0], 24);
    let start = await look(bo.page);
    for (const ends = Date.now() + 45_000; Date.now() < ends && !ids.every(id => start.bodies[id]?.alive === true);) { await sleep(1000); start = await look(bo.page); }
    note('wolves: the pack stands, on both pages', ids.every(id => start.bodies[id]?.alive === true), Object.fromEntries(ids.map(id => [id, start.bodies[id]?.state])));
    await both(ana, bo, 'wolves-before');
    const assist = new Set(), seenOnBoth = new Set(), landed = { Ana: 0, Bo: 0 }, swings = { Ana: 0, Bo: 0 }, close = { Ana: Infinity, Bo: Infinity };
    const watch = async () => {
      const [a, b] = [await look(ana.page), await look(bo.page)];
      for (const id of ids) {
        if (a.bodies[id]?.state === 'stalk' || (a.bodies[id]?.target !== null && a.bodies[id]?.target !== undefined)) assist.add(id);
        if (a.bodies[id]?.state === 'stalk' && b.bodies[id]?.state === 'stalk') seenOnBoth.add(id);
      }
      return b;
    };
    // One fighter at a time, so a wolf's lost hp is that fighter's blow: Bo first (the phone), then Ana. The other stands.
    const fight = async (who, seconds) => {
      let aim = null, hp = null; const hits0 = (await look(who.page)).me.hits;
      for (const ends = Date.now() + seconds * 1000; Date.now() < ends && landed[who.name] === 0;) {
        const seen = await look(who.page), alive = ids.filter(id => seen.bodies[id]?.alive === true);
        const target = aim !== null && alive.includes(aim) ? aim : alive.sort((p, q) => Math.hypot(seen.bodies[p].x - seen.me.x, seen.bodies[p].z - seen.me.z) - Math.hypot(seen.bodies[q].x - seen.me.x, seen.bodies[q].z - seen.me.z))[0];
        if (target === undefined) { await sleep(500); continue; }
        if (target !== aim) { aim = target; hp = seen.bodies[target].hp; }
        // far off (a wall between, or the pack ran after the other player): walk there the way goTo does, round walls
        if (Math.hypot(seen.bodies[target].x - seen.me.x, seen.bodies[target].z - seen.me.z) > 4) { await goTo(who, target, 3, 10); continue; }
        const body = seen.bodies[target], away = Math.hypot(body.x - seen.me.x, body.z - seen.me.z), swing = away < 2.3;
        close[who.name] = Math.min(close[who.name], away); if (swing) swings[who.name]++;
        await steer(who.page, body.x, body.z, away > 1.4 ? 1 : 0, false, swing, aimAt(seen, body));
        await sleep(250);
        const b = await watch(), now = b.bodies[target]?.hp, mine = (await look(who.page)).me.hits;
        // a hit is the server's confirmation of this player's own blow (the page's report), or the wolf's hp falling
        if (mine > hits0 || (typeof now === 'number' && typeof hp === 'number' && now < hp)) { landed[who.name]++; hp = now; }
      }
      await stop(who.page);
    };
    await fight(bo, 40);
    await fight(ana, 30);
    await both(ana, bo, 'wolves-fight');
    note('wolves: Bo\'s weapon', true, await bo.page.evaluate(() => { const app = window.__wildshard.world.game.app; return { current: app.equipment?.current?.constructor?.name ?? null, melee: app.input.active('weapon.melee') }; }));
    note('wolves: the pack hunts together (assist), seen on both pages', assist.size >= 2 && seenOnBoth.size >= 2, { hunting: [...assist], onBoth: [...seenOnBoth] });
    return note('wolves: both players land hits', landed.Ana > 0 && landed.Bo > 0, { landed, swings, closest: close });
  },
  async harvest(ana, bo) {
    // MA15: the kit wolf's `harvest` rows put its drops in the shard's item catalogue (fixtures.mjs compose). Ana fells one
    // with the sword, Bo's page sees the same body fall, and Ana's carcass prompt pays its drops ("… harvested · N in the pack").
    await hold(ana.page, 'weapon.stranger-sword');
    const ids = idsOf(await look(bo.page), 'kit.creature.wolf');
    await goTo(bo, ids[0], 20); await goTo(ana, ids[0], 12);
    let start = await look(bo.page);
    for (const ends = Date.now() + 45_000; Date.now() < ends && !ids.some(id => start.bodies[id]?.alive === true);) { await sleep(1000); start = await look(bo.page); }
    const id = ids.find(each => start.bodies[each]?.alive === true);
    if (id === undefined) return note('harvest: a living wolf to fell', false, Object.fromEntries(ids.map(each => [each, start.bodies[each]?.alive])));
    let fell = null;
    for (const ends = Date.now() + 90_000; Date.now() < ends && fell === null;) {
      const seen = await look(ana.page), body = seen.bodies[id];
      if (body === undefined) { await sleep(300); continue; }
      if (body.alive === false) { const b = (await look(bo.page)).bodies[id]; fell = { ana: body, bo: b ?? null }; break; }
      const away = Math.hypot(body.x - seen.me.x, body.z - seen.me.z);
      if (away > 4) { await goTo(ana, id, 2.5, 10); continue; }
      await steer(ana.page, body.x, body.z, away > 1.4 ? 1 : 0, false, away < 2.3, aimAt(seen, body));
      await sleep(250);
    }
    await stop(ana.page);
    await both(ana, bo, 'harvest-fell');
    if (!note('harvest: Ana felled a wolf, and Bo\'s page saw it fall', fell !== null && fell.bo?.alive === false, fell ?? { id })) return false;
    // stand on the body, then press use until the prompt pays
    let paid = null; const prompts = [];
    for (const ends = Date.now() + 30_000; Date.now() < ends && paid === null;) {
      const seen = await look(ana.page), body = seen.bodies[id];
      if (body !== undefined && Math.hypot(body.x - seen.me.x, body.z - seen.me.z) > 1.8) await goTo(ana, id, 1.8, 8);
      // the carcass prompt needs the eye to see the body (a camera ray, play.ts): look down at it, not over it
      const now = await look(ana.page), carcass = now.bodies[id];
      if (carcass !== undefined) { await steer(ana.page, carcass.x, carcass.z, 0, false, false, Math.atan2(carcass.y + 0.3 - (now.me.y + 1.68), Math.max(0.3, Math.hypot(carcass.x - now.me.x, carcass.z - now.me.z)))); await sleep(300); }
      const texts = () => ana.page.evaluate(() => [...document.querySelectorAll('body *')].map(e => e.children.length === 0 ? (e.textContent ?? '').trim() : '').filter(Boolean));
      prompts.push({ prompt: (await texts()).find(text => /harvest/iu.test(text)) ?? null, near: await ana.page.evaluate(() => {
        const { animals, player } = window.__wildshard.world;
        return (animals?.animals ?? []).map(a => [a.entityId, a.kind, a.alive, Math.round(a.position.distanceTo(player.position) * 10) / 10, (a.harvest ?? []).length]).filter(row => row[3] < 8);
      }) });
      await ana.page.evaluate(() => { window.__wildshard.world.game.app.input.press('use'); });
      // the skinning beat, then the server's drops, then a card that fades: read the page often, not once
      for (const until = Date.now() + 4000; Date.now() < until && paid === null; await sleep(200)) paid = (await texts()).find(text => /harvested|in the pack/iu.test(text)) ?? null;
    }
    await both(ana, bo, 'harvest-paid');
    return note('harvest: the wolf\'s body pays its drops into Ana\'s pack', paid !== null && !/^Nothing harvested/iu.test(paid), { paid, prompts: prompts.slice(0, 6), body: (await look(ana.page)).bodies[id] ?? null });
  },
  async boss(ana, bo) {
    // the dragon flies at 6 m until half its hp is gone (the encounter's gate), so both shoot it with the lever from inside
    // its arena, one at a time so each blow is that player's; then it lands and they close in with swords
    const [id] = idsOf(await look(bo.page), 'fixture.dragon'), MIDDLE_Y = 1.2;
    const seenBy = async () => ({ a: (await look(ana.page)).bodies[id], b: (await look(bo.page)).bodies[id] });
    const start = await seenBy();
    note('boss: the dragon stands, on both pages', start.a?.alive === true && start.b?.alive === true, start);
    const landed = { Ana: 0, Bo: 0 };
    let high = start.a?.y ?? 0, ground = start.a?.y ?? 0;
    const shoot = async (who, seconds, until) => {
      await hold(who.page, 'weapon.stranger-lever');
      const hits0 = (await look(who.page)).me.hits;
      for (const ends = Date.now() + seconds * 1000; Date.now() < ends;) {
        const seen = await look(who.page), body = seen.bodies[id];
        if (body === undefined || body.alive !== true) break;
        high = Math.max(high, body.y); ground = Math.min(ground, body.y);
        const away = Math.hypot(body.x - seen.me.x, body.z - seen.me.z);
        if (away > 16) { await goTo(who, id, 12, 10); continue; }
        const pitch = Math.atan2(body.y + MIDDLE_Y - (seen.me.y + 1.68), Math.max(0.3, away));
        await steer(who.page, body.x, body.z, 0, false, true, pitch);
        await sleep(400);
        landed[who.name] = (await look(who.page)).me.hits - hits0;
        if (until(body)) break;
      }
      await stop(who.page);
    };
    await goTo(bo, id, 12, 90); await goTo(ana, id, 12, 90);
    await shoot(bo, 25, () => landed.Bo >= 2);
    await shoot(ana, 60, body => body.hp < 200);
    await shoot(bo, 40, body => body.hp < 200);
    await both(ana, bo, 'boss-air');
    let down = null;
    for (const ends = Date.now() + 15_000; Date.now() < ends && down === null;) {
      const now = await seenBy();
      if (now.a !== undefined && now.b !== undefined && Math.abs(now.a.y - now.b.y) < 0.8 && high - now.a.y > 2.5 && now.a.hp < 200) down = now;
      else await sleep(500);
    }
    // on the ground: both close in with swords for a while (the fight, not necessarily the kill)
    for (const who of [ana, bo]) await hold(who.page, 'weapon.stranger-sword');
    for (const ends = Date.now() + 20_000; Date.now() < ends;) {
      for (const who of [ana, bo]) {
        const seen = await look(who.page), body = seen.bodies[id]; if (body === undefined || body.alive !== true) continue;
        const away = Math.hypot(body.x - seen.me.x, body.z - seen.me.z);
        await steer(who.page, body.x, body.z, away > 2 ? 1 : 0, false, away < 3.2, aimAt(seen, { ...body, species: 'fixture.dragon' }));
      }
      await sleep(250);
    }
    for (const who of [ana, bo]) await stop(who.page);
    await both(ana, bo, 'boss-ground');
    const end = await seenBy();
    const low = Math.min(ground, down?.a.y ?? Infinity, end.a?.y ?? Infinity);
    note('boss: the dragon flew, and both players\' shots hit it', high - low > 2.5 && landed.Ana > 0 && landed.Bo > 0, { high, low, landed });
    return note('boss: its hp gate lands it, on both pages', down !== null, down ?? { end, high, landed });
  },
  async mech(ana, bo) {
    await hold(ana.page, 'weapon.stranger-sword');
    const [id] = idsOf(await look(bo.page), 'fixture.mech');
    await goTo(bo, id, 14);
    await goTo(ana, id, 2.2, 90);
    let broken = null;
    for (const ends = Date.now() + 40_000; Date.now() < ends && broken === null;) {
      const seen = await look(ana.page), body = seen.bodies[id];
      if (body === undefined) break;
      const away = Math.hypot(body.x - seen.me.x, body.z - seen.me.z);
      await steer(ana.page, body.x, body.z, away > 1.6 ? 1 : 0, false, away < 2.4, aimAt(seen, body));
      await sleep(300);
      const [a, b] = [await look(ana.page), await look(bo.page)];
      const plate = [0, 1, 2, 3].find(i => a.bodies[id]?.ch[i] === 1 && b.bodies[id]?.ch[i] === 1);
      if (plate !== undefined) broken = { plate, ana: a.bodies[id], bo: b.bodies[id] };
    }
    await stop(ana.page);
    await both(ana, bo, 'mech-plate');
    const end = await look(ana.page);
    return note('mech: a broken plate, on both pages', broken !== null, broken ?? { ...end.bodies[id], anaGap: Math.hypot(end.bodies[id].x - end.me.x, end.bodies[id].z - end.me.z) });
  },
};

const cBrowser = await chromium.launch({ headless: true, args: [...KEYCHAIN_ARGS, '--use-angle=metal', '--ignore-gpu-blocklist'] });
const wBrowser = await webkit.launch({ headless: true });
let ana, bo, cy;
try {
  ana = await enter(cBrowser, 'Ana', { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  // MA15: Jake's phone (iPhone 17 Pro: 402×874 points at pixel density 3), as Playwright's iPhone profile on headless WebKit
  const { defaultBrowserType: _webkit, ...iphone } = devices['iPhone 15 Pro'];
  bo = await enter(wBrowser, 'Bo', { ...iphone, viewport: { width: 402, height: 874 }, screen: { width: 402, height: 874 }, deviceScaleFactor: 3 });
  for (const who of [ana, bo]) {
    const ua = await who.page.evaluate(() => navigator.userAgent);
    note(`${who.name}: the agent marker rides the user agent, not the URL`, /WildshardAgent\/1/u.test(ua) && !/[?&]agent=/u.test(who.page.url()), { ua, url: who.page.url() });
  }
  if (third) cy = await enter(cBrowser, 'Cy', { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const met = await look(ana.page);
  note('two players: Ana sees Bo', named(met, 'Bo') !== undefined, met.others);
  if (cy !== undefined) {
    const seenByCy = await look(cy.page);
    note('three pages: Cy sees Ana and Bo, and Ana sees Cy', named(seenByCy, 'Ana') !== undefined && named(seenByCy, 'Bo') !== undefined && named(await look(ana.page), 'Cy') !== undefined, seenByCy.others);
  }
  // creature identity: every page names each server id with the same species
  const pages = [ana, bo, cy].filter(who => who !== undefined), censuses = await Promise.all(pages.map(who => look(who.page)));
  const ids = [...new Set(censuses.flatMap(seen => Object.keys(seen.bodies)))], clash = ids.filter(id => new Set(censuses.map(seen => seen.bodies[id]?.species).filter(Boolean)).size > 1);
  const shared = ids.filter(id => censuses.every(seen => seen.bodies[id] !== undefined));
  note(`creature identity: ${pages.length} pages agree on each creature's species`, clash.length === 0 && shared.length > 0, { creatures: ids.length, onEveryPage: shared.length, clash });
  if (local) {
    // signed admission: the release the room took names this shard and verifies under the key the page was stamped with
    const stamp = await ana.page.evaluate(() => globalThis.__WS_WORLD__ ?? null), release = await (await fetch(stamp?.release ?? `${base}/__dev/release.json`)).json();
    const key = stamp === null ? null : { key: Buffer.from(stamp.key, 'hex'), format: 'der', type: 'spki' }, body = JSON.parse(release.body);
    const good = key !== null && verify(null, Buffer.from(release.body), key, Buffer.from(release.signature, 'hex'));
    const forged = key !== null && verify(null, Buffer.from(release.body.replace(slug, `${slug}-forged`)), key, Buffer.from(release.signature, 'hex'));
    note('signed admission: the room\'s release names the shard and verifies under the page\'s key; an edited body does not', good && !forged && body.shards.some(row => row.slug === slug),
      { serial: body.serial, channel: body.channel, engineBuild: body.engineBuild, shards: body.shards, good, forged });
  }
  await both(ana, bo, 'entered');
  const census = await look(bo.page);
  note('Bo\'s creatures', true, Object.entries(census.bodies).slice(0, 40).map(([id, body]) => `${id}:${body.species}:${body.state}:${body.hp}`));
  for (const name of cases) {
    try { verdicts[name] = await CASES[name](ana, bo); }
    catch (error) { verdicts[name] = note(`${name}: threw`, false, String(error?.stack ?? error).slice(0, 600)); }
  }
} finally {
  const errors = { ana: ana?.errors ?? [], bo: bo?.errors ?? [], ...cy === undefined ? {} : { cy: cy.errors } };
  writeFileSync(resolve(outDir, 'probe.json'), `${JSON.stringify({ base, cases, verdicts, log, shots, errors }, null, 1)}\n`);
  await cBrowser.close(); await wBrowser.close();
}
console.log(JSON.stringify(verdicts));
process.exitCode = Object.values(verdicts).every(Boolean) ? 0 : 1;
