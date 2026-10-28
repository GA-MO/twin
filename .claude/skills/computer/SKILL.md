---
name: computer
description: Operate the owner's computer and websites for them: reminders, calendar events, notes, mail drafts, files, and logged-in web apps through a browser. Use for "เตือน…", "นัด…", "จดลง Notes", "ร่างเมล…", "เปิด…", or anything done in a desktop app or a website.
---

# computer

Read `os` and `capabilities` in `profile/twin.json` first: they say which recipes below apply. Verify every write by reading it back.

## Pause first

Anything another person sees: a calendar invite with attendees, sending mail, posting or messaging (LINE, Teams, Slack, X). Show exactly what will go out, then go only as far as `<name>-mode`'s autonomy step for that category allows; below step 3, wait for "ส่ง". Drafts, reminders, personal events and notes need no pause.

## Browser

Pages behind the owner's login, forms, clicks, screenshots, downloads: use the browser capability.

| `capabilities.browser` | use |
|---|---|
| `baton` | the `baton` skill, one task space per goal |
| `claude-in-chrome` | the Claude in Chrome tools (start Claude Code with `--chrome` if they are missing) |
| `none` | WebFetch for public pages; for anything behind a login, tell the owner the one step to do themselves, or suggest installing Claude in Chrome and rerunning `bun twin.ts setup` |

## macOS (`os: darwin`)

Prefer, in order: AppleScript/JXA (`osascript`), Shortcuts (`shortcuts run "<name>"`), then the browser.

Reminder (personal, no pause):
```bash
osascript -e 'tell application "Reminders" to make new reminder at end of list "Reminders" with properties {name:"โทรหา…", due date:(date "Thursday, 23 October 2026 at 15:00:00")}'
```
Build the date string from the owner's words; read it back with `name of reminders whose completed is false`.

Personal calendar event (no attendees, no pause):
```bash
osascript -e 'tell application "Calendar" to tell calendar "<calendar>" to make new event with properties {summary:"…", start date:(date "…"), end date:(date "…")}'
```
Calendars available are listed at the top of `state/calendar/index.md` when the calendar collector is on.

Note in Apple Notes:
```bash
osascript -e 'tell application "Notes" to make new note at folder "Notes" with properties {body:"<h1>หัวข้อ</h1><p>…</p>"}'
```

Mail draft (never send):
```bash
osascript -e 'tell application "Mail" to make new outgoing message with properties {subject:"…", content:"…", visible:true}'
```

Open a file/app/URL: `open -a "<App>" <path>` · `open "<url>"` · reveal in Finder: `open -R <path>`.

## Windows (`os: win32`)

Open a file/app/URL: `start "" "<path or url>"` (through `cmd /c`). Calendar, mail and reminders live in Outlook or a web app: use the browser, or draft the text for the owner to paste. No recipe here is tested yet.

## Linux

Open a file/URL: `xdg-open <path or url>`. Everything else goes through the browser.

These recipes are not all tested on every machine. On first use of one, run it, read the result back, and fix this file if it needed a change.
