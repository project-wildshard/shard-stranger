# Scripts enter a zone like a player (opus-chunk2, meta CHUNK-PARAM-REMOVAL CP20)

- J522 deletes `?chunk=`. The staging probe takes the player's tap into its slug.
- They import `enterZone` from `@wildshard/sdk/headless/scripts/zone-entry.mjs` (the engine's, through the sdk as
  the other harness entries), which the next sdk release carries; until this repo's pin moves they run against a
  linked sdk and engine (J475).
