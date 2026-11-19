# Stranger shard fixtures

> Written by: Codex
> State: local rabbit and dragonfly fixtures, 2026-11-17; AC5 troll, chameleon
> and dragon in `fixtures.mjs` (opus-of-m5d, 2026-11-18); AC6 mech, mech8,
> hydra and shifter (opus-of-m57, 2026-11-18).

`write-fixture.py` edits four plain shard sections in the shipped handwritten
format seed. There is no shard config or SDK TypeScript author source.
The engine reads the exact product built by `wildshard check`.

```sh
python3 check-fixture.py /path/to/sharddev /path/to/engine
python3 check-fixture.py /path/to/sharddev /path/to/engine --fixture dragonfly
python3 check-fixture.py /path/to/sharddev /path/to/engine --bad
```

Use Node 24 and installed checkouts. The test runs 3,600 server ticks
and requires damage from the fixture's named strike. The dragonfly must
also dive at least two metres from its flight altitude. The bad control
plants an unresolved strike and requires the ordinary CLI to refuse it.
The source seed and built products are rebuilt in per-run scratch.

## ST1: orc and ogre (`fixtures.mjs`)

```sh
node --experimental-transform-types --import <engine>/scripts/sim-node-loader.mjs \
  fixtures.mjs <sharddev> <engine> orc|ogre
```

The kit humanoid on the biped contract (a placeholder one-triangle skin) at
scale 1 (orc, medium) and 2 (ogre, large). Both take the kit's own
`content/abilities/swing.json` and `slam.json` as plain JSON, renamed per
species. The witness needs both the swing and the slam to land on the player
within 60 s. On 2026-11-19 (sharddev engine 0.1.44, format 0.45.0) the orc
lands 13 swings and 8 slams, the ogre 13 and 12.

## AC5: troll, chameleon, dragon (`fixtures.mjs`)

```sh
node --experimental-transform-types --import <engine>/scripts/sim-node-loader.mjs \
  fixtures.mjs <sharddev> <engine> troll|chameleon|dragon
```

Each fixture writes its rows and ABI-1 guests (compiled by sharddev's own
compiler) into the seed, runs `wildshard check`, then 60 s on the engine's
server sim. Catalogue handles are each catalogue sorted by id.

- troll: heals 3 a call until a hit's tags say fire.
- chameleon: opacity channel 0.1 and unlockable until a player is inside
  its 4 m reveal radius; then shown, lockable, and a 6 m tongue pulls the
  player to its mouth.
- dragon: climbs and orbits the player at 6 m breathing fire, lands at its
  encounter's half-hp gate, walks in and fights with claws and tail.

State on 2026-11-18: sharddev pins format 0.37.1, which refuses body
channels and the CC32 verbs, so these run against a local sharddev clone
with format main's creature backports (`DIAGNOSE=1` prints refusals and
runs the sim anyway). There the dragon passes check; troll and chameleon
(brain bindings) are refused at execution by sharddev's engine v0.1.44
(`Invalid strike catalogue owner`). Engine main runs all three. Both go
away with the format release and the sharddev re-pin (QA29).

## AC6: mech, hydra, shape-shifter (`fixtures.mjs`)

```sh
node --experimental-transform-types --import <engine>/scripts/sim-node-loader.mjs \
  fixtures.mjs <sharddev> <engine> mech|mech8|hydra|shifter
```

Bodies are placeholder skins: a one-triangle GLB on the kit biped or
quadruped contract's bones (or the hydra's own rig) with its metadata
JSON as a library root; attachment meshes are a plain library GLB.

- mech: four 40 hp armour plates (x0, attachments on `chest`, each with a
  break channel) around the pilot (the biped's `body` volume, x2); laser
  (lane) and rockets (projectile) from range; on `part.broken` it jets in
  (a 4 m leap) and stomps (knockback 4 m). Witness: weapon rays break each
  plate, then meet the pilot at x2; the jets and the stomp follow.
- mech8: 8 mechs and 8 players, armoured then with every plate broken,
  60 s against the shard's `serverBudget.tickMicros` (mean and p95).
- hydra: three heads, each a 50 hp volume with its own channel and an
  attachment; each breaks alone, then blows pass it.
- shifter: path a, at 75% a channel swaps the man's look on one body;
  path b, at 50% the script's `despawn` holds the man out and the beast
  (a quadruped: the skeleton changes) stands in its place at its hp %.

Needs engine main from `b2c900046` (despawn, scripted-strike knockback
and projectile), `eb661ba90` (a held-out form is not beaten) and `376178080`
(a lane with no speed is a beam). `wildshard check` waits on QA29 like AC5.

## CC40c: the skeleton horse (`fixtures.mjs horse`)

A plain-JSON `mount` row (walk 2, gallop 10 m/s) on the kit quadruped
(placeholder skin), spawned on open ground clear of the seed's hall. The
player mounts it, walks and gallops at the row's speeds (within 5%) and
dismounts beside it. Its `wildshard check` passes with format main; the
staging ride waits on the releases (QA29).

## Rerun on engine 0.1.47 (opus-of-m789, 2026-11-19)

sharddev main pins engine 0.1.47 (`61fd32d2` and its fix-forward), format
0.45.0. All eight fixtures pass the ordinary `wildshard check` and their 60 s
sims on engine main `dc203a546`: troll heals to 200, burns, holds 123;
chameleon fade 0.1 unlockable at 6 m, shown and lockable at 0.9 m, pulled
2.6 m; dragon climbs to 6, lands, breath 2, claw 6, tail 6; mech breaks four
plates, pilot 300 to 220, jets 4 m, stomp; mech8 mean 649 us, p95 474 of
1000; hydra heads break alone; shifter keeps 0.7 and 0.45; horse walks 2.0,
gallops 10.0 and dismounts 1.5 m beside it.

## The stranger shard (OF25, opus-of25, 2026-11-19)

These fixtures moved from sharddev's scratch (`tmp/codex-te2e/stranger`, `2c42025`) into
`project-wildshard/shard-stranger`. `fixtures.mjs compose` writes the shard itself into `../src`: every fixture
at its own place, plus the kit wolf pack, the kit deer herd and a curated hero. Handles: a guest names actors,
strikes and moves by the shard's catalogues (every id sorted), so `compose` builds each guest twice, the second
time against the whole shard's catalogues (`CATALOGUE`); alone, a fixture keeps its own numbering.
`composed-sim.mjs` runs the composed product for 60 s.
