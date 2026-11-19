# 2026-11-19: compose on the Brasscap seed

> Written by: Claude

sharddev `e1e41e94` (ONE-FORMAT OF25d) gives a hand-written author Brasscap Mesa's place with an empty creature layer,
since Template 2's plain seed left shard-format (J434). `compose` leaned on two Template 2 parts Brasscap lacks: a
`look.presentation` card and a `door` material it copied for `toon`. It now writes `presentation` fresh and `toon`
whole. On sharddev `e1e41e94` with engine main, `compose`, `wildshard check` and `composed-sim.mjs` pass (18 spawns, 5
guests, the dragon revives at 29 s and climbs to 6 m), and the mech fixture alone breaks all four plates.

`src/` is not recomposed here: revision 5 on staging (Template 2's clay hall) is what the CC36 and OF14 probes walk, and
a recompose moves the shard onto Brasscap's mesa. Alone, the Python rabbit now packs but bites nothing: 5 m from
Brasscap's spawn it stands behind the gate wall (`write-fixture.py` places it by the seed's spawn).
