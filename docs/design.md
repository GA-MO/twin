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
| Owner additions: their own commands, collectors, skills, repo instructions | `profile/commands/`, `profile/collectors/`, `profile/skills/`, `profile/CLAUDE.md` | the owner, written by the agent on request |

The identity is not code and not shared. Keeping it in `profile/` beside the engine, gitignored, lets one `git pull` update the engine without touching anyone's identity. Backup builds its commit with a private index on its own non-branch ref, `refs/twin/backup`, so no branch carries private files, `git push --all` cannot publish them, and the checked-out branch never diverges from the template. That ref is pushed only to a remote named `backup`, as its branch `twin-backup`. With no git identity configured the snapshot commits as `twin`, so backup never stops `sync`. The link into `~/.claude/skills` makes it a normal skill on that machine; a junction does the same on Windows.

Owner additions live in `profile/` for the same reason: an owner who wants a command or a data source of their own would otherwise fork the engine, and every later pull would conflict. Each kind is discovered by directory beside the engine's own (`profile/commands/*.ts`, `profile/collectors/*.ts`, `profile/skills/<name>/`), so there is nothing to register. Names are one namespace per kind and the engine wins a clash: an engine update that adds a command the owner already had keeps the engine working, and the brief and `bun twin.ts` name the owner's file to rename. A broken owner file (syntax error, a throw while loading, the wrong export) costs only itself: a command reports its file and line when run or listed, a collector becomes an error fragment the brief shows like any other failure. Owner files import only `lib/command.ts` and `lib/collector.ts`, the two surfaces kept stable across pulls. An owner collector always writes under `state/<name>/`, never beside the engine's directories, and cannot `refreshOnBrief`, so a slow one never stalls session start. Owner skills are linked next to the mode skill by `setup`, skipped when the name is taken, and removed by `uninstall`; the `.gitignore` ignores every symlink in `.claude/skills/` while real directories (the engine's skills) stay tracked. `profile/CLAUDE.md` is imported by the repo's `CLAUDE.md`; a missing file leaves the import line inert.

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

They live in the OS store under the agent's name as service, recorded in the profile at first setup so a rename keeps finding them (Keychain, Credential Manager, libsecret); a secret not found there is read from the service `twin`, where earlier versions kept them. On macOS the `security` command reads and writes the agent's service first, because an item is trusted only by the tool that created it and agents that ran before this engine created theirs with `security`; `Bun.secrets` is the store everywhere else, and first for the `twin` service. Workers get only the secrets their brief header names, as environment variables set by the engine at turn start (never through the shell), and a name that would overwrite a system variable is refused. The deny rules on reading the store from a worker are a speed bump, not a wall: a script file gets past them. Anything a worker can run as the owner can read the owner's store.

## Dispatch

- A worktree from `origin/develop` (else the default branch) at `<repo>/.claude/worktrees/<name>-<slug>`, branch `<name>/<slug>` after the agent's name; root `.env*` files copied; a free port from 4101 as `TWIN_PORT`. A `run.json` without `agent` (written before it was recorded) takes the agent from its branch prefix, so runs from an earlier engine still list, follow up and close.
- The push block is structural: a per-worktree `pre-push` hook lets the worker push its own `<name>/<slug>` and refuses every other ref and every remote delete. Other gates (`shared-write`, `delete`) are deny rules in a per-turn settings file generated from one `GATES` table. Production has no gate value, so it cannot be approved through dispatch.
- The worker is `claude -p` with a JSON-schema report; commits are counted from `git log`, not from the worker's claim, and an unparsable report is never "done". A done turn gets one check turn before `wait` returns when it changed UI files with `clicked` empty, or changed code (not tests, specs, mocks or type declarations) with `inputs_tried` empty; files under `fixtures/`, `fixtures-*/` or `testdata/` are test data and never count; only files the turn changed that also differ from the run's base count, so merging the base branch or deleting a file brings no check; both asks go in one turn, and the turn after a check is never checked again. Rules in prose did not stop unclicked UI from reaching the owner, and every worker setup measured reported a bill split done without validating its inputs. A turn marked `click-check` by an earlier engine counts as checked, and a stored report without `inputs_tried` reads as empty.
- At most `maxRuns` turns run at once (profile, 1 to 20, default 3); a dispatch past it is refused with how to raise it, since several worker turns at once is a choice of the owner's machine and plan, not the engine's.
- A followup sent while a turn runs is queued and starts when the turn ends; approval holds for one turn.
- `close` also removes the worker's own delegate worktrees under `.claude/worktrees/` (branches `<name>/*` outside a run's `<name>-<slug>` directory) once their branch is merged into the run's base and they hold no changes, and only when no other run in that repo is still open; a delegate with files in `.twin-scratch/` is kept, since reports point there.
- Briefs are typed by kind (`lib/briefs.ts`): each kind names the lines it needs and what done means for it. A brief carries what, for whom, what stays and limits, never method.

## Size is review depth, and it was measured

The contract carries how much review a worker runs, by the brief's ขนาด: เล็ก none, กลาง and ใหญ่ one independent reviewer on the final diff (with pstack, its thermo-nuclear review agent; without, a subagent that did not write the change). Delegation is not part of Size: a worker runs as one agent and spawns only for that reviewer, for parallel pieces that save real time, or when its context degrades. The input rule (try empty, zero, negative, fractional, huge, malformed, wrong-type, encoded and duplicated inputs the brief did not list, decide what each should do, test it) lives in the contract too, not in an owner's mode, because every owner's workers need it and the check turn enforces it.

## Measuring how workers work

`evals/` holds the harness that decides these rules, so a change to the contract or Size can be measured before it ships:

- `arms.ts` dispatches real workers through `lib/dispatch.ts` into copies of fixture repos (`evals/fixtures`, harder ones in `evals/fixtures-hard`, a static UI in `evals/fixtures-ui`), each with a brief, a visible test and hidden tests the worker never sees. Arms are contracts: `now` (the current one), `review` (a reviewer at every size) and `pstack` (poteto-mode loaded in full and run as written, Size off). It records outcome, hidden and visible test counts, minutes, API-equivalent cost, subagents and turns, flags a done report that fails hidden tests, and saves each diff. Runs use the profile's agent name and respect `maxRuns`.
- `ui-check.ts` grades a UI fixture: it serves the worktree on loopback and runs each check in headless Chrome over the DevTools protocol, at the width the check names.
- `judge.ts` ranks the saved diffs of one task blind (shuffled labels, two models), since hidden tests could not separate setups that all passed.
- `replay.ts` replays situations from the owner's history against a session in this repo and has a model judge each reply against a stated criterion. Situations are the owner's: `profile/evals/replay.json` when it exists, else the generic `evals/replay.example.json`.

Results go to `evals/results/`, which is gitignored: they hold one machine's runs, and the decision they back is recorded below with its numbers.

`--isolated` (replay and arms) runs each session with this repo's project and local settings plus what this twin itself installs in the user's settings (its mode hook when the scope is global), and nothing else from the machine: no other agent's mode, hooks or plugins, and the replay judge in safe mode. A machine that also hosts another agent would otherwise measure that agent's rules too: on the machine this was built on, an unisolated session loaded the other agent's mode beside the twin's.

## Improve is gated by evals

An improve that made the agent worse used to be caught, if at all, a week later in the audit. Now an `improve:` commit is refused unless the evals of what it changed were measured before and after, on exactly what is committed, and did not get worse. The rule lives in a commit-msg hook (`lib/evalgate.ts`, installed by `setup` and by every `eval` call), not in the skill, because the skill's own instructions are what a bad improve rewrites.

- Which eval measures which file is one table in `lib/evalgate.ts`: replay of the owner's situations for the identity files, owner and engine skills, `CLAUDE.md` and `lib/identity.ts`; arms on `split-bill` and `static-path` (the two fast fixtures where the contract's input rule decides the hidden tests, about a minute a run) for `lib/contract.ts`, `lib/dispatch.ts` and `lib/briefs.ts`. Both run `--isolated`; replay twice per situation, arms three times per fixture.
- `eval before <files>` opens a round: it snapshots every measured file, copies the owner's measured files under `profile/`, and measures the suites those files affect on the committed state, so it refuses while any measured engine file has uncommitted edits, and refuses to add a suite whose files already changed in the round. `eval` measures again and compares. `eval drop` abandons the round and puts the owner's files back as they were when it began, because `profile/` is live the moment it is written: a refused identity change would otherwise keep running in every session, and re-baselining on it would launder it.
- The suite's own yardstick (scenarios, fixtures, the harness) may not change in the round that changes what it measures: an improve that also rewrote the scenario a rule broke would score equal. Change the yardstick in its own round.
- A measurement is keyed by a hash of the files its suite reads (triggers, scenario and fixture files, the harness), the agent's name and the method, so the same state is never measured twice and the hook can tell a measurement of the committed content from one of an earlier edit. The round keeps the baseline's keys, so a plugin update mid-round re-measures only the after side. The hook reads tracked files from the index and `profile/` from disk.
- Worse means, per suite over the items both sides share (a situation, or a fixture's hidden-test pass rate): an item that passed every run before passes none after, or the summed item scores drop by more than a tenth of the item count. One lost replay run in seven situations is noise and passes; two is not. A measurement with a crashed agent, an unreadable judge, or an arms run that timed out, crashed or ran no hidden test is incomplete and never passes.
- On pass the hook appends `Eval-<suite>: <before> → <after> ไม่แย่ลง` to the message (above git's scissors line) and closes the round, keeping what was committed, so amending that commit without changing a measured file passes with the same numbers. On refusal it lists each item that got worse. Every other commit is filtered by the hook's first line in shell, so it never starts bun (0.00 s measured), and a broken eval state cannot block it.
- The hook goes in the repository's own hooks directory and never replaces another commit-msg hook; when `core.hooksPath` points elsewhere it is not installed and every `eval` says how to call the gate from that hook.
- The twin session's settings deny the usual ways around the hook (`--no-verify` and its prefixes, `-n` on commit, `core.hooksPath` in either case, touching `hooks/commit-msg`). That makes going around it a deliberate act, not a wall: `uninstall`, a bundled `-anm`, or writing `state/evals/` from a script still get past it.

Limits: an identity edit made before `eval before` becomes part of the baseline, because `profile/` has no committed version to compare with; the skill takes the baseline as its first step after the plan. A measured engine file committed under another subject skips the gate, by design: other commits must never be slowed or blocked. Replay does not fingerprint the brief's live content or the guard hook, so a rule encoded there is not measured. Replay and arms are model-judged and small, so the tolerance trades missed small regressions for not blocking harmless changes. Every linked worktree of the twin repo shares the hook, so an `improve:` subject there needs its own round.

## Runs belong to a session

With several sessions open, a run dispatched from one showed up in every other. `runs/` stays shared on purpose, so any session can see work waiting on the owner, but `dispatch` writes the dispatching `CLAUDE_CODE_SESSION_ID` to `runs/<id>/owner`. The runs collector hands owned lines to the brief, which renders them for the session that asked (the session id comes from the environment, or from the SessionStart hook's stdin) and lists the rest as `session อื่น`. `followup` and `close` refuse another session's run unless `--take` (or `take`) moves it here. A session that has closed (no longer in `claude agents --json`) owns nothing: its runs show as this session's and the next followup takes them, because a Desktop-only owner cannot resume an old session from a terminal. When the live sessions cannot be read (no `claude` command), ownership stays strict. Runs with no owner (morning plans started by the scheduler) are open to every session, and the first session to follow one up becomes its owner. Attention items in the brief and `todo` carry the same `session อื่น` mark.

`runs --json` carries each run's report and, from `claude agents --json`, whether the owning session is still open and where (Desktop or terminal), so the status band can say "waiting in another session" and offer to approve it here. No money is shown anywhere: usage is on a subscription, and a dollar figure was read as a bill.

## The status band

`mods/twin` is a Claude Code mod: a band above the prompt and a `/twin` pane. `model.ts` holds what both surfaces share (stages, actions, which runs wait on the owner); `desktop.tsx` and `terminal.tsx` draw it natively for each surface; `register.tsx` wires events, polling and state. Actions are prompts the twin session already understands ("ok push <id>", "Take <id> into this session…"); Answer fills the prompt box instead of sending, so the owner writes the reply. The agent's name and bun's path come from `profile/twin.json`, because the Desktop app's PATH may not include bun. `bun run preview:mod` serves the real Desktop components with fixture runs for design work.

## Trying it beside another agent

`setup --scope project` puts the SessionStart hook in this repo's `.claude/settings.local.json` and links the mode skill under this repo's `.claude/skills`, so no other session loads this twin; workers dispatched to other repos run without the mode. The sync schedule is still installed (keyed by the repo path) unless `--no-schedule` is given, and `daily` may draft plans into repos under `devRoot`. The default stays global. Switching scope moves the hook and the link and removes the old ones.

## Deliberately not

`daily` always closes runs whose branch is merged and drops old closed runs, which the twin created. It deletes build output in the owner's repos and tool caches only when the owner turns `autoClean` on: in a stranger's folders, "regenerable" is a guess.

No daemon, no MCP server, no database or embeddings, no background model calls except `radar` and the morning plan workers, no writes into another repo except a worker on `<name>/*`, no push of the owner's data anywhere but their own `backup` remote.

## Tradeoffs accepted

- A headless worker cannot ask mid-task; in exchange approvals work from anywhere, and takeover is `claude --resume <id>` in the worktree.
- Remote sources may be up to ten minutes stale; staleness is printed and `sync <name>` is one call.
- A worktree per run costs disk; in exchange runs never collide, and `clean` removes merged ones.

## Changes since

(record each change to a decision above: date, what, the evidence)

- 2026-10-28. Owner additions in `profile/` (commands, collectors, skills, `profile/CLAUDE.md`); worker branches named after the agent; secrets under the agent's service with `twin` as fallback; `close` sweeps merged delegate worktrees. Evidence: an owner moving an existing agent (with its own commands, Keychain service and runs) onto this engine could only do so by forking it, and that agent's runs have no `agent` field and branches named after it.
- 2026-10-28. Review from กลาง up, the input rule and its check turn, and the eval harness, ported from the agent that ran on this engine's predecessor so it can move here without losing them. Evidence, from that agent's measurements: on five harder fixtures (cache dedupe with error caching, path decoding with traversal, bill split rounding, a duration parser with unstated edge cases, a 15-file migration), three runs per setup, hidden tests passed 93.5% for one agent, 93.5% for one agent plus a reviewer and 87.6% for poteto as written; blind judging ranked one agent plus a reviewer first 15 of 30 times, poteto 10, one agent alone 5; poteto took about three times as long. Every setup reported the bill split done without validating its inputs, which led to the input rule and the check turn.
- 2026-10-28. `improve:` commits are gated by evals (see "Improve is gated by evals"), and replay and arms gained `--isolated`, replay `--reps`, `--parallel` and `--json`, arms `--out`; their defaults are unchanged. Evidence, two real improves on a twin built from `evals/examples/dev`: adding two rules (status one line per run, briefs always carry kind and size) measured replay 10/14 → 11/14 and committed with that line in its message; deleting the input rule from the contract measured arms 100% → 83% (split-bill 9/9 → 6/9 in all three runs, static-path 9/9 throughout) and the hook refused the commit, naming split-bill. Without `--isolated` the replay session on that machine also loaded the other agent's mode, so the twin's own change was not what was measured. In the second trial the check turn did not fire: the workers filled `inputs_tried` with the brief's own inputs, so a non-empty list is not proof that unlisted inputs were tried.
