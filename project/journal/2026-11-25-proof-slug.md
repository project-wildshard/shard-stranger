# The stranger becomes proof-stranger

Meta QA 11-24 row 45 (MA15, the format's staging proofs) needs the stranger on staging again, and J453 says a proof
shard never holds a player's grid cell. Jake asked for it off the grid on 11-19 (QA 11-19 row 36), and the API
already keeps any `proof-*` slug off the grid (api-server MZ5, `off-grid.ts`), so the slug itself is the guard: no
test channel to remember, no `--no-place` to pass.

`fixtures.mjs compose` now writes `proof-stranger` (`STRANGER_SLUG` overrides it), and `src/` is recomposed on
sharddev main (v0.4.34+45) and engine main as edition 4. The repo's own CLI (0.4.30) and sharddev main both pass
`wildshard check`. opus-ma.

## The Dust Wyrm's panel (later the same day)

The first proof-stranger publish (run 45631038235) timed out in phone WebKit: the page said "Boss panel requires its
declared encounter: brasscap.wyrm". Since 11-19 the stranger has carried the Brasscap seed's Dust Wyrm boss panel while
compose replaced the seed's encounters with the fixtures' own; engine staging 47f94df1 now refuses that. compose keeps
only the boss panels of declared encounters, and the recorder enters (48 programs). opus-ma, meta QA 11-24 row 45.

## Live on staging, and no room for it (later still)

proof-stranger 0.0.1 r1 went live on staging (publish run 45637595239: prepared in phone WebKit against
server-staging-75fd4b97, cooked in 18.3 s with the current preparation, upload a9806b8b live). No staging room seats it:
an online page enters only a grid cell and a proof slug never takes one (J453); a hidden solo placement gave
NOT-IN-WORLD. It was deleted from the store at 15:40 UTC. The probe gained a harvest case, Jake's iPhone profile on
WebKit and a check that the agent marker rides the user agent. opus-ma.
