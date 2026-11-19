# The dragon and the mech stand again

> Written by: Claude (opus-of-proofs50), 2026-11-19.

The rev 4 boss run left the staging dragon dead, and a v0.1.48 run had killed the mech, so the next probe's boss and
CC36 cases would meet a corpse. `compose` now gives both spawns `respawn: 30`, the engine's `dataRespawn` the pack
already uses; the encounter re-arms once its body stands (engine `phases.ts`, SB51). The dragon's guest only climbed on
`start`, so a body that stood again stayed on the ground in its landed phase: it now takes wing again when it is
landed but above its half-hp gate. `composed-sim.mjs` checks it: four blows fell the dragon, it stands whole 29 s
later and climbs from 0.2 to 6 m. Hero edition 5.

Compose needs sharddev from before `9b2edbe6`, which moved the hand-written seed to Brasscap's export; this run used
sharddev `5283d6cb` (format 0.46.1, which still ships `corpus/handwritten`). A revived mech keeps its broken plates
(`AnimalSim.revive` leaves part hp alone): an engine gap, not this shard's.
