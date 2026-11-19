# AGENTS.md

This is a Wildshard shard repo: its shard source is at `src/`.

- Read `GUIDE.md` first. It is the author's manual: the loop, the shard source layout, budgets, and every refusal
  with its fix.
- The skills are in `.claude/skills/`: `wildshard` (the loop, in order), `wildshard-mockup-to-model`,
  `wildshard-goldens` and `wildshard-upgrade`. `.agents/skills/` links to the same folders, for Codex.
- `wildshard update` rewrites `GUIDE.md` and those four skills from the installed sdk, so never edit them here.
  It leaves this file alone once you change it: add your own rules below.
