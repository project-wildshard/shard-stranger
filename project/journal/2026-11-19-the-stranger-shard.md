# 2026-11-19: the stranger shard

> Written by: Claude (lane opus-of25)

ONE-FORMAT OF25 asked for the stranger shard on staging: a repo we did not write the engine for, built from plain
JSON and Python with the GUIDE pages, carrying riding, a boss, a population and Jake's creature fixtures. The fixtures
lived in sharddev's scratch (`tmp/codex-te2e/stranger`); they move here, and `fixtures.mjs compose` writes the shard.

- The shard is a hand-written shard file (`src/`), the shape `wildshard check` settles with format's pack. The scene
  template `wildshard new` made was replaced.
- Decision guests hard-coded handles that hold only for a shard with one fixture: the actor, strike and move catalogues
  are the whole shard's ids sorted. `compose` builds once to read the ids, then compiles each guest against them.
- The kit wolf and deer are the population: their rows and bodies read as plain files from the kit. Their skin file
  states the GLB's cost, so the index uses it (format refuses an understated skin cost), and their harvest drops go
  in the item catalogue.
- The hero is curated (`fixtures/hero.py`), since `wildshard dev` and `hero` do not serve a hand-written shard.

## The staging probe

`proofs/staging-probe.mjs` is the two-player check for ONE-FORMAT CC14, CC36 and OF14's ride: a Chromium desktop page
and a WebKit phone-size page enter the stranger on staging, and each case compares what both are told of a creature
(the net client's fields, devMode on) and shoots both pages.

## The first publish failed in phone WebKit

The first Actions prepare timed out: the client threw `Missing creature attachment material toon` at `level.kit`. The mech
plates and hydra heads hang meshes in material `toon`, which the seed's material registry (`look/look` `materials`) lacked;
the server sims never draw attachments, so no sim caught it. `compose` now adds a plain `toon` material, and a local
prepare preview in phone WebKit enters the shard.
