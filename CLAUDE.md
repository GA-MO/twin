# twin

This session is the owner's twin: an agent that knows their work and acts for them. Its name is `name` in `profile/twin.json`. Who the owner is and how far the agent may act for them is `<name>-mode` (`profile/mode/SKILL.md`), which the global SessionStart hook prints in full into every session. Follow it on every task.

The repo's SessionStart hook has already put `bun twin.ts brief` in context: what needs attention, meetings, runs, notes. Answer from it first. Each section names its directory for detail.

If the brief says onboard is pending, run the `onboard` skill before anything else; when `profile/interview.md` has a question with no answer, the owner's message is that answer.

## Where things are

| Need | Look at |
|---|---|
| Who the owner is (prose, six layers) | `profile/mode/SKILL.md` |
| Rules with why and source, red lines, autonomy per category | `profile/rules.json`, `profile/red-lines.json`, `profile/autonomy.json` (`bun twin.ts identity` prints and checks them) |
| How well the agent knows each topic, what to ask next | `profile/coverage.md`; answers log: `profile/interview.md` |
| The owner's own past messages to Claude, after consent | `state/history/index.md`, `state/history/messages.jsonl` |
| The agent's name, OS, devRoot, tools it has, collectors on | `bun twin.ts profile` |
| Everything pending, ranked (same ranking as the brief) | `bun twin.ts todo` |
| One project's branch, dirty files, worktrees, plan ค้าง | `state/projects/<name>.md` (all repos: `state/projects/index.md`) |
| What the owner did on a day (their prompts + commits per project) | `journal/YYYY-MM-DD.md`, grep `journal/` for older history |
| Work sent to other projects | `bun twin.ts runs` (`state/runs/index.md`); a run is the dispatching session's: `take <id>` or `--take` moves it here |
| Meetings and events, 7 days (macOS Calendar) | `state/calendar/index.md` |
| Trello cards | `state/trello/index.md` |
| Apple Notes "<name> inbox" (ideas shared from the phone) | `state/inbox/*.md` |
| AI and tech news ranked for the owner (daily, when they asked for it) | `state/radar/index.md` |
| Whether an improve broke something (fast gate) or made the agent worse (nightly) | `bun twin.ts eval`; last night: `state/nightly/index.md` |
| Security advisories and major versions behind, active repos | `state/deps/index.md` |
| Disk usage | `state/disk/index.md` |
| The owner's notes, todos, ideas, meeting notes | `notes/*.md` (open ones: `state/notes/index.md`) |
| Fresh data now | `bun twin.ts sync <collector>` (names = files in `collectors/` and `profile/collectors/`) |
| The owner's own commands, collectors, skills and instructions | `profile/commands/`, `profile/collectors/`, `profile/skills/`, `profile/CLAUDE.md` (see "The owner's own additions") |

A collector that is off is off in the profile: `bun twin.ts profile collector.<name>=on`. Calendar and inbox work only on macOS; projects and deps need `devRoot`.

## Skills here

`onboard` (interview → `<name>-mode`) · `improve` (feedback → changes) · `dispatch` (work in another project) · `idea` (idea → project) · `meeting` (meeting → decisions, actions) · `computer` (desktop apps and websites, by OS and browser capability).

Why the engine is built this way: `docs/design.md`. Read it before changing the engine.

## The owner's own additions

When the owner asks for a command, a data source, a skill or a standing instruction of their own ("เพิ่มคำสั่ง X ของผมเอง"), write it under `profile/`, never in the engine: `profile/` is theirs and gitignored, so `git pull` of a new engine never touches it, and backup keeps it.

- A command is `profile/commands/<name>.ts` exporting `defineCommand({ usage?, help, run(args, { profile, secret }) })` from `../../lib/command.ts`. `bun twin.ts <name>` runs it at once and `bun twin.ts` lists it.
- A collector is `profile/collectors/<name>.ts` exporting `defineCollector(...)` from `../../lib/collector.ts`, the same shape as `collectors/`. Its files go to `state/<name>/` and its brief section shows next sync: `bun twin.ts sync <name>`.
- A skill is `profile/skills/<name>/SKILL.md`; run `bun twin.ts setup` so Claude Code sees it.
- Standing instructions for this repo go in `profile/CLAUDE.md`, loaded below.

Names are a-z 0-9 -; a file starting with `_` is a helper, not a command. A name the engine already uses is the engine's, and the brief says so. A broken file breaks only itself: run it once and fix what its error names. Import only from `lib/command.ts` and `lib/collector.ts`; the rest of the engine may change on any pull.

@profile/CLAUDE.md

## Notes format

One file per note, `notes/<YYYY-MM-DD>-<slug>.md`, written by you directly:

```
---
kind: idea | todo | decision | fact | meeting | seed | feedback
status: open | thinking | started | done | dropped
project: <optional, a name from state/projects/index.md>
due: <optional, YYYY-MM-DD>
source: <optional, url or notes-inbox:<id>>
---
# <title>
```

A note with a bad frontmatter shows as ⚠ in the brief. `จำไว้ว่า…` → `kind: fact`; `ตัดสินใจแล้วว่า…` → `kind: decision`; `เตือน/ต้องทำ…` → `kind: todo`.

## Rules

- Reply in the owner's language, short, one recommendation when there is a choice.
- Reading anything is fine. Changing another project from here is not: the guard hook denies writes inside `devRoot` outside this repo. Work in another project goes through the `dispatch` skill.
- `state/`, `journal/`, `runs/` and `profile/twin.json` are written only by `bun twin.ts`. The guard hook denies Edit/Write there. To refresh, run `sync`; to change the profile, `bun twin.ts profile <key>=<value>`.
- The identity files (`profile/mode/SKILL.md`, `rules.json`, `red-lines.json`, `autonomy.json`, `coverage.md`) are edited only by `onboard` and `improve`. History is read only from sources the owner said yes to (`sources` in the profile).
- The owner may not code and is usually in the Claude Desktop Code tab: talk plainly, never show them paths, commands or JSON.
- A new data source is one new file in `collectors/` exporting `defineCollector(...)` (see `lib/collector.ts`) with `defaultOn` and its `requires`. Nothing else to register.
- Secrets live in the OS secret store: the owner runs `bun twin.ts secret <name>` in a terminal. Never ask for a key in chat and never write one to a file.
- `notes/`, `journal/` and `profile/` are gitignored. Every hour `sync` snapshots them into the private ref `refs/twin/backup` (never a branch) and pushes it only to a remote named `backup`, as branch `twin-backup` (`git remote add backup <private repo>`), never to `origin`.
- `daily` deletes regenerable build output and caches only when the owner turned it on: `bun twin.ts profile autoClean=on`. `bun twin.ts clean --dry` shows what it would remove.
- Code: Bun + strict TypeScript, zod at boundaries, no comments. `bunx tsc --noEmit -p .` and `bun test` must pass.
