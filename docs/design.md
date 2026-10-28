# twin: design

The code is the implementation; this file is the why. Change a decision here only with evidence, and say what the evidence was.

## Problem

One Claude Code session in this repo acts for its owner: it knows their meetings, work items and projects at second zero, decides the way they would, works inside other repos without colliding with their live sessions, and asks before it does anything they have not trusted it with. Anyone can clone the repo and get their own agent: nothing of a previous owner comes with it.

## Three layers

| Layer | Where | Whose |
|---|---|---|
| Identity: who the owner is, how they decide, red lines, autonomy per category | `profile/mode/SKILL.md`, linked to `~/.claude/skills/<name>-mode` | the owner, written by `onboard`, revised by `improve` |
| Method: how code work is done | pstack poteto-mode when installed, else the lean rules in `lib/contract.ts` | optional |
| Engine: collectors, brief, notes, journal, dispatch, guard | this repo | shared by every clone |

The identity is not code and not shared. Keeping it in `profile/` beside the engine, gitignored, lets one `git pull` update the engine without touching anyone's identity. Backup builds its commit with a private index on its own non-branch ref, `refs/twin/backup`, so no branch carries private files, `git push --all` cannot publish them, and the checked-out branch never diverges from the template. That ref is pushed only to a remote named `backup`, as its branch `twin-backup`. With no git identity configured the snapshot commits as `twin`, so backup never stops `sync`. The link into `~/.claude/skills` makes it a normal skill on that machine; a junction does the same on Windows.

Method is optional because most owners are not engineers. A measured comparison on code tasks (five fixture repos with hidden tests, ten runs per setup) found one agent with short method rules as correct as one carrying the full method skill and its subagents, at about half the cost. So the lean rules are a real fallback, not a degraded mode, and nothing throws when pstack is missing.

## Knowing the whole person

Decisions are one layer of six: who they are, their tools, their work, their life outside work (what they learn feeds their radar), how they want to be helped (a guide step by step, or just done), and how they decide. Onboard sweeps every layer lightly on day one, then the brief asks one to three questions a day from the shallowest layer. `profile/coverage.md` records, per topic, how sure the agent is (0 unknown, 1 guessed, 2 heard, 3 heard and seen), how much evidence backs it and when it last asked, so the agent knows where it knows the owner thinly.

How long the interview runs depends on history. Three approaches were compared: asking hard questions, mining evidence, and learning from work as it happens. Each fails where another holds:
- Red lines, permissions, rare big events and conditional rules never show in evidence, so they must be asked.
- People answer as who they want to be. Evidence corrects that: the earlier owner of this engine never said in an interview that the agent asked too much; counting their replies showed it.
- Frequent decisions are best learned by predicting before the owner decides.

So with a rich consented history (Claude Code transcripts, a claude.ai `conversations.json` export, their commits) onboard mines rules first and asks the owner to confirm each with its quote (right, wrong, or "depends on ___", which earns one follow-up). With little history it interviews in sets of five that can stop at any point. Either way it asks red lines directly, finds criteria with paired situations that change one thing until the answer flips, and asks about the last real case and why two or three levels deep. An answer that contradicts history is asked about with the evidence; history never wins by default.

The identity is typed. `rules.json` carries each rule's reason, source and whether it was `stated` or `observed`. `red-lines.json` and `autonomy.json` sit beside it: every category starts at "ask" unless history shows the owner already lets go, with criteria, a ceiling and a ledger. A later phase predicts each decision before the owner makes it, records it in a ledger and moves levels on measured agreement; the file shapes already hold what that needs. The mode hook prints these files after the prose, so every session sees the same rules, and `bun twin.ts identity` refuses a file that does not parse.

The history collector keeps only the owner's own words: it drops `claude -p` worker prompts, subagent prompts, compaction summaries and system lines, and redacts the secret shapes people paste (key assignments, connection strings, bearer tokens, private keys, Thai "รหัสผ่าน"). Redaction is a pattern list, so it narrows exposure but cannot promise none. It reads each source separately, so one broken export or a moved file costs only that source, and it judges rich or thin over everything it read while keeping at most 1,500 messages per source. Withdrawing consent deletes what was collected. Consent itself is a rule the onboard skill follows, not a lock: `bun twin.ts profile source.*` is allow-listed like every twin command. An imported `conversations.json` stays out of the backup wherever it sits under `profile/`.

## Where the owner talks to it

The Claude Desktop Code tab and the `claude` CLI, opened in this repo. Both run the same Claude Code session, so the hooks, skills and permissions here apply unchanged. The Desktop Chat tab is not supported: one way in keeps one set of rules, and owners who do not code use the Code tab with plain language from the agent.

## Answers survive interruptions

Every question and answer is written to `profile/interview.md` before the next question, so a closed window resumes where it stopped. Trust is granted per category, never all at once: levels move up only on the owner's word and drop one step after a serious mistake in that category. Red lines beat any level.

Modes load as text, not as skill calls: an instruction to invoke a skill was skipped often enough in practice that the global SessionStart hook prints the mode in full into every session, workers included.

## State and owners

One writer per path; the directory says who.

| Path | Writer | In git |
|---|---|---|
| `state/<collector>/*`, `state/brief/<collector>.json` | that collector, through `runCollector` (lock, timeout, atomic write, last good result kept on error) | no |
| `journal/YYYY-MM-DD.md` | the journal collector: the owner's prompts and commit subjects in this repo and in `devRoot`, extracted, never summarized by a model; sessions elsewhere on the machine stay out | backup only |
| `notes/<date>-<slug>.md` | the agent, one file per note | backup only |
| `profile/twin.json` | `bun twin.ts setup` and `bun twin.ts profile`, validated by zod | backup only |
| `profile/mode/SKILL.md`, `rules.json`, `red-lines.json`, `autonomy.json`, `coverage.md`, `interview.md` | `onboard` and `improve` | backup only |
| `state/history/` | the history collector, from consented sources only | no |
| `runs/<id>/` | `lib/dispatch.ts` and the worker wrapper | no |

The guard hook enforces the table for the agent: it denies Edit/Write under `state/`, `runs/`, `journal/`, on `profile/twin.json`, and in other repos under `devRoot`.

## Collectors

`collectors/*.ts` are discovered by directory; the directory is the only list. Each declares `defaultOn` and what it `requires` (macOS, a POSIX shell, `devRoot`). The profile stores only the owner's explicit choices; anything unset is on when its `defaultOn` holds and its requirements are met right now, so setting `devRoot` later turns on `projects` without another step, and the brief never nags about a source the owner does not have; a collector the owner turned on whose requirement fails shows as off with the reason. Each runs in its own child process with a hard kill. The brief is one ranking over every collector's attention items, cut to a budget; `todo` prints all of it, so the two cannot disagree.

Only `radar` calls a model in the background, once a day, and only after the owner says what they care about. The journal stays extractive so it costs nothing and cannot invent.

## Setup is per machine and idempotent

`bun twin.ts setup` detects the OS, pstack, the browser capability (Baton or Claude in Chrome) and a code folder, writes the profile, links the mode skill, merges one SessionStart hook into `~/.claude/settings.json` (other hooks kept), enables the status-band mod for this repo only, and installs the schedule the OS has: launchd, cron, or Task Scheduler. Running it again converges to the same state, and it checks the skill link and both settings files before it writes anything, so a refused rename leaves the old install whole. Scheduler jobs are keyed by a hash of the repo path, not the agent's name, so a rename replaces them instead of adding a second set. When `HOME` is not the user's home in the passwd database it writes files inside that `HOME` but never registers with the OS scheduler, which is per user and would outlive the test (Bun's `os.userInfo()` follows `$HOME`, so it cannot tell).

Skills name capabilities, not tools: "browser", not a product, because the tool differs per machine.

## Secrets

`Bun.secrets` stores them in the OS store (Keychain, Credential Manager, libsecret); `security` is the macOS fallback for an older Bun. Workers get only the secrets their brief header names, as environment variables set by the engine at turn start (never through the shell), and a name that would overwrite a system variable is refused. The deny rules on reading the store from a worker are a speed bump, not a wall: a script file gets past them. Anything a worker can run as the owner can read the owner's store.

## Dispatch

- A worktree from `origin/develop` (else the default branch) at `<repo>/.claude/worktrees/twin-<slug>`, branch `twin/<slug>`; root `.env*` files copied; a free port from 4101 as `TWIN_PORT`.
- The push block is structural: a per-worktree `pre-push` hook lets the worker push its own `twin/<slug>` and refuses every other ref and every remote delete. Other gates (`shared-write`, `delete`) are deny rules in a per-turn settings file generated from one `GATES` table. Production has no gate value, so it cannot be approved through dispatch.
- The worker is `claude -p` with a JSON-schema report; commits are counted from `git log`, not from the worker's claim, and an unparsable report is never "done". A turn that changed UI files and reports done with no clicks gets one click-check turn before `wait` returns, because rules in prose did not stop unclicked UI from reaching the owner.
- A followup sent while a turn runs is queued and starts when the turn ends; approval holds for one turn.
- Briefs are typed by kind (`lib/briefs.ts`): each kind names the lines it needs and what done means for it. A brief carries what, for whom, what stays and limits, never method.

## Runs belong to a session

With several sessions open, a run dispatched from one showed up in every other. `runs/` stays shared on purpose, so any session can see work waiting on the owner, but `dispatch` writes the dispatching `CLAUDE_CODE_SESSION_ID` to `runs/<id>/owner`. The runs collector hands owned lines to the brief, which renders them for the session that asked (the session id comes from the environment, or from the SessionStart hook's stdin) and lists the rest as `session อื่น`. `followup` and `close` refuse another session's run unless `--take` (or `take`) moves it here. A session that has closed (no longer in `claude agents --json`) owns nothing: its runs show as this session's and the next followup takes them, because a Desktop-only owner cannot resume an old session from a terminal. When the live sessions cannot be read (no `claude` command), ownership stays strict. Runs with no owner (morning plans started by the scheduler) are open to every session, and the first session to follow one up becomes its owner. Attention items in the brief and `todo` carry the same `session อื่น` mark.

`runs --json` carries each run's report and, from `claude agents --json`, whether the owning session is still open and where (Desktop or terminal), so the status band can say "waiting in another session" and offer to approve it here. No money is shown anywhere: usage is on a subscription, and a dollar figure was read as a bill.

## The status band

`mods/twin` is a Claude Code mod: a band above the prompt and a `/twin` pane. `model.ts` holds what both surfaces share (stages, actions, which runs wait on the owner); `desktop.tsx` and `terminal.tsx` draw it natively for each surface; `register.tsx` wires events, polling and state. Actions are prompts the twin session already understands ("ok push <id>", "Take <id> into this session…"); Answer fills the prompt box instead of sending, so the owner writes the reply. The agent's name and bun's path come from `profile/twin.json`, because the Desktop app's PATH may not include bun. `bun run preview:mod` serves the real Desktop components with fixture runs for design work.

## Trying it beside another agent

`setup --scope project` puts the SessionStart hook in this repo's `.claude/settings.local.json` and links the mode skill under this repo's `.claude/skills`, so no other session loads this twin; workers dispatched to other repos run without the mode. The sync schedule is still installed (keyed by the repo path) unless `--no-schedule` is given, and `daily` may draft plans into repos under `devRoot`. The default stays global. Switching scope moves the hook and the link and removes the old ones.

## Deliberately not

`daily` always closes runs whose branch is merged and drops old closed runs, which the twin created. It deletes build output in the owner's repos and tool caches only when the owner turns `autoClean` on: in a stranger's folders, "regenerable" is a guess.

No daemon, no MCP server, no database or embeddings, no background model calls except `radar` and the morning plan workers, no writes into another repo except a worker on `twin/*`, no push of the owner's data anywhere but their own `backup` remote.

## Tradeoffs accepted

- A headless worker cannot ask mid-task; in exchange approvals work from anywhere, and takeover is `claude --resume <id>` in the worktree.
- Remote sources may be up to ten minutes stale; staleness is printed and `sync <name>` is one call.
- A worktree per run costs disk; in exchange runs never collide, and `clean` removes merged ones.

## Changes since

(record each change to a decision above: date, what, the evidence)
