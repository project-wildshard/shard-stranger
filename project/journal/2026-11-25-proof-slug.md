# The stranger becomes proof-stranger

Meta QA 11-24 row 45 (MA15, the format's staging proofs) needs the stranger on staging again, and J453 says a proof
shard never holds a player's grid cell. Jake asked for it off the grid on 11-19 (QA 11-19 row 36), and the API
already keeps any `proof-*` slug off the grid (api-server MZ5, `off-grid.ts`), so the slug itself is the guard: no
test channel to remember, no `--no-place` to pass.

`fixtures.mjs compose` now writes `proof-stranger` (`STRANGER_SLUG` overrides it), and `src/` is recomposed on
sharddev main (v0.4.34+45) and engine main as edition 4. The repo's own CLI (0.4.30) and sharddev main both pass
`wildshard check`. opus-ma.
