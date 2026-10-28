<p align="center">
  <img src="site/public/favicon.svg" width="72" height="72" alt="">
</p>

<h1 align="center">twin</h1>

<p align="center">
  Your own agent in Claude Code. It knows what is pending, decides the way you do,<br>
  and asks before it does anything you have not trusted it with.
</p>

<p align="center">
  <a href="https://ga-mo.github.io/twin/docs">Documentation</a> ·
  <a href="https://ga-mo.github.io/twin/docs/quick-start">Quick start</a> ·
  <a href="README.th.md">ภาษาไทย</a>
</p>

---

twin is a repository you clone once. Open it in Claude Code (the Code tab in Claude Desktop, or `claude` in a terminal) and the session is your agent: it has read your meetings, projects, notes and running work before you type, it loads who you are from files only you own, and it sends code work into your other repos as workers that cannot collide with what you are doing.

Nothing runs in the cloud. There is no daemon, no database and no server. Your identity, notes and journal stay on your machine and never reach the repo you pull updates from.

## What it does

- **Knows where things stand.** Every session starts with a brief: what needs attention, meetings, work you sent out, open notes and todos. Sources are small collectors (calendar, projects, notes, runs, Trello, dependency advisories, disk, a daily news radar) that you turn on and off.
- **Learns how you decide.** `onboard` reads the history you allow (Claude Code transcripts, a claude.ai export, your commits) and proposes rules for you to confirm, or interviews you five questions at a time. Rules, red lines and how much it may do alone per category live in typed files beside its prose identity.
- **Remembers for you.** "Remember that…", "remind me…", "we decided…" become notes. Paste a meeting and get the decisions, your action items and the work to hand off.
- **Works in your other projects safely.** "Fix X in Y" starts a headless worker in its own git worktree and branch. It can push only its own branch, it gets one extra check turn when it changed UI without clicking or code without trying inputs, and it reports back with what it did.
- **Gets better from how you use it.** Tell it what it got wrong and `improve` turns that into changes. The number it watches is the share of handed-off work you never had to touch again.

## Quick start

You need [Bun](https://bun.sh) 1.3 or later, [Claude Code](https://code.claude.com) logged in, and git. pstack, Baton and macOS are optional.

```bash
git clone https://github.com/GA-MO/twin.git my-twin
cd my-twin
bun install
bun twin.ts setup
```

`setup` asks for your agent's name, writes `profile/twin.json`, links your mode skill, adds one SessionStart hook (your existing hooks stay), and schedules `sync` every 10 minutes and `daily` at 08:30 with launchd, cron or Task Scheduler. Running it again converges to the same state. Use `--scope project` to keep the hook and skill inside this repo only, and `--no-schedule` to skip the schedule.

Then open the folder in Claude Desktop's **Code** tab (or run `claude` in it) and type `onboard`.

Never used a terminal? The [install guide](https://ga-mo.github.io/twin/docs/install) walks through Bun, git and Claude Desktop on Mac and Windows step by step.

## Everyday use

| Type in Claude Code | You get |
|---|---|
| what's pending | an answer from the brief |
| remember … / remind me … | a note in `notes/` |
| a pasted meeting | decisions, your actions, work to hand off |
| fix X in &lt;project&gt; | a worker in that project's worktree that reports back |
| feedback: … / improve | changes to how the agent works and who it thinks you are |

`bun twin.ts` with no arguments lists every command.

## Your data

`profile/`, `notes/` and `journal/` are yours and gitignored. Every hour `sync` snapshots them into the local ref `refs/twin/backup` (not a branch). To back up off the machine, add a private remote named `backup` and it is pushed there as `twin-backup`, never to `origin`. API keys and tokens go in the OS secret store with `bun twin.ts secret <name>`, never in a file.

Read [Your data](https://ga-mo.github.io/twin/docs/concepts/your-data) for moving to a new machine and cleanup.

## Learn more

- [Concepts](https://ga-mo.github.io/twin/docs/concepts/identity): identity, the brief, dispatch, extending it with your own commands and collectors
- [CLI reference](https://ga-mo.github.io/twin/docs/reference/cli)
- [Design](https://ga-mo.github.io/twin/docs/design): why it is built this way, with the measurements behind each decision ([docs/design.md](docs/design.md) in the repo)

## Docs site

The site lives in [`site/`](site): Fumadocs on React Router and Vite, English and Thai, built to static files and deployed to GitHub Pages by [`.github/workflows/pages.yml`](.github/workflows/pages.yml).

```bash
cd site
bun install
bun run dev      # http://localhost:5173/twin/
bun run build    # static site in site/dist
bun run preview  # serve site/dist the way GitHub Pages does
```
