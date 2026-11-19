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
// J205: staging or preview only, never production. Headless and muted, 60 fps cap.
//   node proofs/staging-probe.mjs <engine checkout> <out dir> [--base=https://staging.wildshard.io] [--cases=wolves,deer,chameleon,mech,horse]
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [engineDir, outDir] = process.argv.slice(2).filter(arg => !arg.startsWith('--')).map(path => resolve(path));
const flag = (name, fallback) => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
if (engineDir === undefined || outDir === undefined) throw new Error('usage: staging-probe.mjs <engine checkout> <out dir> [--base=…] [--cases=…]');
const base = flag('base', 'https://staging.wildshard.io').replace(/\/$/u, '');
if (!/^https:\/\/(staging|preview)\.wildshard\.io$/u.test(base)) throw new Error('--base takes staging or preview only (J205)');
const cases = flag('cases', 'horse,chameleon,deer,wolves,mech').split(',').filter(Boolean), slug = flag('slug', 'stranger');
const at = file => import(pathToFileURL(resolve(engineDir, 'scripts', file)).href);
const { chromium, webkit } = await at('browser-playwright.mjs');
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
  await page.goto(`${base}/?chunk=${slug}&mute=1&nolock=1&skipintro=1&fps=60`, { waitUntil: 'load', timeout: 120_000 });
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
    bodies[info.id] = { species, x: Number(f.x), z: Number(f.z), state: f.state ?? null, hp: f.hp ?? null, alive: f.alive ?? null,
      ch: [f.channel1, f.channel2, f.channel3, f.channel4], lockable: f.lockable ?? null, target: f.target ?? null };
  }
  const report = window.__workerClient();
  return { me: { x: player.position.x, z: player.position.z, hp: report.hp, falls: report.falls }, bodies,
    others: (window.__onlinePlayers?.() ?? []).map(other => ({ name: other.name, x: other.x, z: other.z, speed: other.speed, mounted: other.mounted })) };
});
/** The server ids of `species`, in id order (the same on every page). */
const idsOf = (seen, species) => Object.keys(seen.bodies).filter(id => seen.bodies[id].species === species).sort((a, b) => Number(a.split(':')[1]) - Number(b.split(':')[1]));
const named = (seen, who) => seen.others.find(other => other.name.startsWith(who));
/** Get on or off through the page's own ride press (it carries the live command seq). */
const ride = (page, action) => page.evaluate(how => { const net = window.__workerClientNet(); if (typeof net.predictor?.ride === 'function') net.predictor.ride(how); else net.client.act({ kind: 'ride', seq: net.client.seq ?? 0, action: how }); }, action);
const steer = (page, x, z, forward, sprint, swing = false) => page.evaluate(([tx, tz, y, run, hit]) => {
  const { player, game } = window.__wildshard.world;
  player.yaw = Math.atan2(-(tx - player.position.x), -(tz - player.position.z)); player.pitch = -0.15;
  player.touchMove.x = 0; player.touchMove.y = y; player.touchSprint = run;
  if (hit) game.app.input.press('attack');
}, [x, z, forward, sprint, swing]);
const stop = page => page.evaluate(() => { const { player } = window.__wildshard.world; player.touchMove.x = 0; player.touchMove.y = 0; player.touchSprint = false; });
/** Walk `who` to within `near` m of creature `id` (as its own page draws it). */
async function goTo(who, id, near, seconds = 40) {
  for (const ends = Date.now() + seconds * 1000; Date.now() < ends;) {
    const seen = await look(who.page), body = seen.bodies[id];
    if (body === undefined) { await sleep(250); continue; }
    const away = Math.hypot(body.x - seen.me.x, body.z - seen.me.z);
    if (away <= near) { await stop(who.page); return { away, seen }; }
    await steer(who.page, body.x, body.z, 1, away > 10);
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
    await goTo(ana, id, 3);
    await sleep(800);
    const anaNow = await look(ana.page), near = { gap: Math.hypot(anaNow.bodies[id].x - anaNow.me.x, anaNow.bodies[id].z - anaNow.me.z), ana: anaNow.bodies[id], bo: (await look(bo.page)).bodies[id] };
    await both(ana, bo, 'chameleon-near');
    return note('chameleon: shown and lockable inside 4 m, on both pages', near.ana?.ch[0] === 1 && near.bo?.ch[0] === 1 && near.bo?.lockable === 'on', { ana: near.ana, bo: near.bo });
  },
  async deer(ana, bo) {
    const ids = idsOf(await look(bo.page), 'kit.creature.deer');
    await goTo(bo, ids[0], 26);
    await both(ana, bo, 'deer-before');
    let fled = null;
    for (const ends = Date.now() + 30_000; Date.now() < ends && fled === null;) {
      await steer(ana.page, (await look(ana.page)).bodies[ids[0]]?.x ?? 0, (await look(ana.page)).bodies[ids[0]]?.z ?? 0, 1, true);
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
    const start = await look(bo.page), ids = idsOf(start, 'kit.creature.wolf');
    note('wolves: the pack stands, on both pages', ids.every(id => start.bodies[id]?.alive === true), Object.fromEntries(ids.map(id => [id, start.bodies[id]?.state])));
    await goTo(bo, ids[1], 24); await goTo(ana, ids[0], 24);
    await both(ana, bo, 'wolves-before');
    const hp0 = Object.fromEntries(ids.map(id => [id, (start.bodies[id]?.hp ?? 80)]));
    const landed = { Ana: 0, Bo: 0 }, assist = new Set(), seenOnBoth = new Set();
    let last = { ...hp0 };
    const aims = { Ana: ids[0], Bo: ids[1] };
    for (const ends = Date.now() + 45_000; Date.now() < ends && !(landed.Ana > 0 && landed.Bo > 0 && assist.size >= 2);) {
      // each player fights the live wolf nearest them, Bo a different one from Ana's while two stand
      for (const who of [ana, bo]) {
        const seen = await look(who.page), alive = ids.filter(id => seen.bodies[id]?.alive === true && !(who === bo && id === aims.Ana && ids.filter(each => seen.bodies[each]?.alive === true).length > 1));
        const target = alive.sort((a, b) => Math.hypot(seen.bodies[a].x - seen.me.x, seen.bodies[a].z - seen.me.z) - Math.hypot(seen.bodies[b].x - seen.me.x, seen.bodies[b].z - seen.me.z))[0];
        aims[who.name] = target; if (target === undefined) continue;
        const body = seen.bodies[target], away = Math.hypot(body.x - seen.me.x, body.z - seen.me.z);
        // once Ana has landed one, she holds back so the pack is still there for Bo
        const swing = away < 3.2 && !(who === ana && landed.Ana > 0);
        await steer(who.page, body.x, body.z, away > 1.8 && !(who === ana && landed.Ana > 0) ? 1 : 0, false, swing);
      }
      await sleep(250);
      const [a, b] = [await look(ana.page), await look(bo.page)];
      for (const id of ids) {
        if (a.bodies[id]?.state === 'stalk' || a.bodies[id]?.target !== null && a.bodies[id]?.target !== undefined) assist.add(id);
        if (a.bodies[id]?.state === b.bodies[id]?.state && a.bodies[id]?.state === 'stalk') seenOnBoth.add(id);
        const hp = b.bodies[id]?.hp;
        if (typeof hp === 'number' && hp < last[id]) { if (id === aims.Ana && id !== aims.Bo) landed.Ana += 1; else if (id === aims.Bo && id !== aims.Ana) landed.Bo += 1; last[id] = hp; }
      }
    }
    await stop(ana.page); await stop(bo.page);
    await both(ana, bo, 'wolves-fight');
    note('wolves: Bo\'s weapon', true, await bo.page.evaluate(() => { const app = window.__wildshard.world.game.app; return { current: app.equipment?.current?.constructor?.name ?? null, melee: app.input.active('weapon.melee') }; }));
    note('wolves: the pack hunts together (assist), seen on both pages', assist.size >= 2 && seenOnBoth.size >= 2, { hunting: [...assist], onBoth: [...seenOnBoth] });
    return note('wolves: both players land hits', landed.Ana > 0 && landed.Bo > 0, { landed, hp0, last });
  },
  async mech(ana, bo) {
    const [id] = idsOf(await look(bo.page), 'fixture.mech');
    await goTo(bo, id, 14);
    await goTo(ana, id, 2.2, 40);
    let broken = null;
    for (const ends = Date.now() + 40_000; Date.now() < ends && broken === null;) {
      const seen = await look(ana.page), body = seen.bodies[id];
      if (body === undefined) break;
      const away = Math.hypot(body.x - seen.me.x, body.z - seen.me.z);
      await steer(ana.page, body.x, body.z, away > 2.4 ? 1 : 0, false, away < 4.5);
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
let ana, bo;
try {
  ana = await enter(cBrowser, 'Ana', { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  bo = await enter(wBrowser, 'Bo', { viewport: { width: 402, height: 874 }, deviceScaleFactor: 1, hasTouch: true });
  const met = await look(ana.page);
  note('two players: Ana sees Bo', named(met, 'Bo') !== undefined, met.others);
  await both(ana, bo, 'entered');
  const census = await look(bo.page);
  note('Bo\'s creatures', true, Object.entries(census.bodies).slice(0, 40).map(([id, body]) => `${id}:${body.species}:${body.state}:${body.hp}`));
  for (const name of cases) {
    try { verdicts[name] = await CASES[name](ana, bo); }
    catch (error) { verdicts[name] = note(`${name}: threw`, false, String(error?.stack ?? error).slice(0, 600)); }
  }
} finally {
  const errors = { ana: ana?.errors ?? [], bo: bo?.errors ?? [] };
  writeFileSync(resolve(outDir, 'probe.json'), `${JSON.stringify({ base, cases, verdicts, log, shots, errors }, null, 1)}\n`);
  await cBrowser.close(); await wBrowser.close();
}
console.log(JSON.stringify(verdicts));
process.exitCode = Object.values(verdicts).every(Boolean) ? 0 : 1;
