# AGENTS.md

> Human-written section (Jake). Empty until Jake writes it; until then the agent section below holds the working rules.

<!-- agents-below: everything under this line is agent-written (Claude, Codex); agents never edit above it (J241) -->

## Agent-written

> Written by: Claude and Codex (agents). Jake gardens this; it may be purged or promoted above the line.

 - AGENTS.md: agents edit only below the J241 marker, never above it; README.md stays humans-only unless Jake says
   otherwise. The check is `.githooks/agents-md.mjs` (`docs/agents-md.md`).
 - Every request for work from Jake -> src/scripts/.kit/ask-new.sh "<his words>", rules in docs/tasks/asks/README.md
 - Follow-up work is a row in a live plan, never a new ask.

Git hygiene

 - Small Commit early & often.
 - Own hunks of shared files use the sanctioned patch entry:
   `src/scripts/.kit/commit.sh --patch own.patch "<message>" -- <files...>`.
   Make the patch against HEAD with only your hunks. Installed hooks
   run normally; peer working bytes and stages stay untouched.
 - Main only (D36: this repo has no `land.config.json`): many agents share one checkout
   (`~/projects/games/wildshard/shard-stranger`) and every commit goes straight on `main`. No worktrees,
   no branches, no landing. After each commit, `git pull --rebase origin main`, then a plain
   `git push origin main` through the normal pre-push (it runs `pnpm check` in a clean copy).
   Never `--no-verify` or `SKIP_*`, never force main.
 - Use pre-commit & pre-push git hooks for keeping checks/quality/lints etc.
 - Push after every commit.
 - Every meaningful commit writes a journal into project/journal, the why & informal.

Shared checkout

 - Many agents work here, git add only for new files, use git commit -- <filespec>
 - Never git add -A / . / -u, never git commit -a, never bare git commit.
 - Never stash, checkout, restore or delete what you didn't author.

Githooks

 - pnpm install will install the hooks.

Docs / Repo shape

 - docs/ is living: edit in place, keep it true. See docs/plans for all the plans.
 - project/ is for history. See project/archive for the archives.
 - Code in ./src/ etc.
 - Top level directory is thin & lean.
 - Dev commands, layout, code rules in docs/dev.md
 - Scratch goes in ./tmp/<task>; delete it when done.

Code rules

 - In the test suite, No LLM, no claude, no herdr.
 - Every Chromium launch is headless and passes `--use-mock-keychain`, `--password-store=basic` (else a macOS keychain dialog opens) and `--mute-audio`.

Agent tooling

 - Claude Code and Codex load the same tooling from one source (meta MULTI-AGENT-TOOLING). A new repo starts on the
   kit's `.claude/` layout; move it to the one-source layout once with
   `node ../repo-kit/scripts/agent-sync.mjs --from ../repo-kit`. From then on skills live in `.agents/skills/`, hook
   scripts in `.agents/hooks/`, hooks are declared once in `.agents/hooks.json` (this repo's own in
   `.agents/hooks.local.json`), and agent-sync writes the rest; never edit `.claude/settings.json` hooks,
   `.codex/hooks.json` or `.claude/skills` by hand.

The shard source (from `wildshard new`)

 - This is a Wildshard shard repo: its shard source is at `src/`.

 - Read `GUIDE.md` first. It is the author's manual: the loop, the shard source layout, budgets, and every refusal
   with its fix.
 - The skills are in `.agents/skills/`: `wildshard` (the loop, in order), `wildshard-mockup-to-model`,
   `wildshard-goldens` and `wildshard-upgrade`. `.claude/skills/` links to the same folders, for Claude Code.
 - `wildshard update` rewrites `GUIDE.md` and those four skills from the installed sdk, so never edit them here.
   It leaves this file alone once you change it: add your own rules below.
