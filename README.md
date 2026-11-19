# stranger

A Wildshard **shard source**, started by `wildshard new` from Mossgate Hollow, a three.js scene module.
`wildshard check .` builds it into one **shard file**, and `wildshard upload`
sends that file to a channel.

Start with `GUIDE.md`, the author's manual: section 1 is the loop (new, dev,
check, hero, upload), section 2 this layout. The `wildshard` skill in
`.claude/skills/` gives an agent the same loop; its siblings there make a
model from a picture (`wildshard-mockup-to-model`), refresh the hero and
proof tape (`wildshard-goldens`) and move to a newer sdk
(`wildshard-upgrade`).

```sh
pnpm install
pnpm exec wildshard dev .
pnpm exec wildshard check .
```

- `src/` is the shard source: `shard.config.ts` (the build entry), `identity.json` (the slug and name),
  `generators/` (`world.ts` is the scene; `play.ts` the braziers, gates, lever, chest, rack and lift;
  `quests.ts` and `gameplay.ts` the quests and talks; `wildshard watch .` shows each save) and
  `proof.json` (the proof tape `check` plays).
- `package.json` pins `@wildshard/cli` (the `wildshard` command), the
  `@wildshard/sdk` library, shard-format and `three` exactly; its `version`
  is the version `wildshard upload` sends.
- `public/shardfiles/` is build output. Never edit or commit it.
