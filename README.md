# Stranger

> Written by: Claude (lane opus-of25, meta ONE-FORMAT OF25), 2026-11-19. Fixtures by Codex and Claude lanes
> (sharddev `tmp/codex-te2e/stranger` up to `2c42025`).

The **stranger shard**: a shard the engine was not written for, built from plain JSON and Python with the GUIDE pages
(sharddev `packages/sdk/GUIDE.md` section 2c, kit `packages/kit/GUIDE.md` "Deer and wolf bodies"). It is the
end-to-end proof of meta's ONE-FORMAT plan: riding, a boss and a population, plus Jake's creature fixtures, uploaded
like any author's shard.

- `src/` is the shard source: a **hand-written shard file** (sections JSON, blobs and `shard.json`), no
  `shard.config.ts` and no SDK at runtime. `wildshard check .` settles it with format's pack and admits it.
- `fixtures/` writes `src/` and holds each fixture's 60 s server-sim witness.

## What is in it

| Part | Rows | Where (x, z) |
|---|---|---|
| Riding | `fixture.bonehorse`: a plain `mount` row (walk 2, gallop 10 m/s) on the kit quadruped | (-14, 22), by the spawn |
| The boss | `fixture.dragon`: flies, orbits breathing fire, lands at its encounter's half-hp gate, fights on foot | (0, -85) |
| The population | The kit's own wolf pack (3, `stranger.wolves`, pack assist 14 m) and deer herd (3, `stranger.deer`) | (30, 55) and (-30, 55) |
| Fixtures | orc, ogre, troll, chameleon, mech, hydra, shape-shifter; rabbit and dragonfly from `write-fixture.py` | a ring 50 to 70 m out |

Jake's ten (ONE-FORMAT J367 (7)) are the dragon, T-Rex, dragonfly, chameleon, rabbit, skeleton horse, orc, ogre, troll
and mech. Nine are in the shard; the T-Rex (ONE-FORMAT CC58c) is a fixture (`fixtures.mjs trex`) that joins `compose` once
the repo's SDK pin carries format 0.46.1. Bodies are placeholder skins.

## Rebuild `src/`

With installed checkouts of sharddev and engine, on Node 24:

```sh
node --experimental-transform-types --import <engine>/scripts/sim-node-loader.mjs \
  fixtures/fixtures.mjs <sharddev> <engine> compose src "edition N"
pnpm exec wildshard check .
```

`compose` writes the hand-written seed, every fixture at its place, the kit wolf and deer (their GLB and skin files read
from the kit as plain files), the item catalogue for their drops, and the curated hero (`fixtures/hero.py`; the edition
is printed on it, since upload refuses a hero unchanged since the last version). Decision guests are compiled against the
whole shard's catalogues, so each names the same rows composed as it does alone.

## The sims

```sh
# one fixture alone, in its own seed (fixtures/README.md has each witness)
node --experimental-transform-types --import <engine>/scripts/sim-node-loader.mjs \
  fixtures/fixtures.mjs <sharddev> <engine> orc|ogre|ranged|troll|chameleon|dragon|mech|mech8|hydra|shifter|horse
python3 fixtures/check-fixture.py <sharddev> <engine> --fixture rabbit|dragonfly
# the composed shard: every spawn stands, no guest refuses, riding is installed
node --experimental-transform-types --import <engine>/scripts/sim-node-loader.mjs \
  fixtures/composed-sim.mjs <sharddev> <engine> out/stranger
```

## Shipping

`pnpm build:shards` runs `wildshard check . out/stranger`. Publish from Actions with
`gh workflow run publish.yml -R project-wildshard/shard-stranger -f channel=staging`: it prepares the product in phone
WebKit and uploads it like any shard. Its first staging upload took its grid cell (`GRID_AUTOPLACE=staging`).
