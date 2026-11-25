# Spawns on their ground, and a probe for a local world

> Written by: Claude (opus-ma2), 2026-11-25, meta QA 11-24 row 45 (MA15).

J453 keeps proof-stranger off the staging grid, so MA15's multiplayer half ran in a local engine dev world. There, 15 of
the 18 spawns never reached a page: they were authored at y 0 where the ground stands 0.8 to 1.3 m, so the server's floor
cast from their feet found no floor and they fell to -150 or -250 m, past the 160 m relevance radius. Each spawn now stands
5 cm over the ground height the server reads there.

The probe takes a local base, seats a third page, and checks creature identity across pages and the room's signed
release. Bodies outside relevance are walked toward from the shard's own spawn rows.
