---
name: dispatch
description: Send work into another project, run by a headless worker in that project's worktree, and carry it to done. Use when the owner asks to fix, build, or continue something in a project ("ไปแก้ X ใน Y", "ทำ phase 2 ของ Y", "ถึงไหนแล้ว", "ok push", "ship uat", "ปิดงาน").
---

# dispatch

This agent never edits another project itself (the guard hook denies it). A worker does: `claude -p` in `<repo>/.claude/worktrees/<name>-<slug>` on branch `<name>/<slug>` from `origin/develop` (else the default branch), with the project's CLAUDE.md and skills, `<name>-mode` from the import in `~/.claude/CLAUDE.md` (global scope), the worker contract (`lib/contract.ts`), its own port in `$TWIN_PORT`, and push limited at the git level: the worker pushes its own `<name>/<slug>` branch itself; any other branch (develop, uat, sit, main) and deleting a remote branch wait for the push gate.

The method layer is optional. With pstack installed the contract points the worker at poteto-mode's playbooks; without it the contract carries a short set of method rules. Nothing else changes.

A project name resolves inside `devRoot` from `profile/twin.json`. With no `devRoot`, pass the repo's full path.

## 1. Brief (read before you write)

Read `state/projects/<name>.md`, the project's `CLAUDE.md`, its plan file if the ask names a phase, and the files the ask obviously touches. Note where the project says finished work lands (fast-forward main, or develop then uat): that target is what the push gate asks about. Then write the brief, in Thai, one sentence per line, with `[เดา]` right after anything guessed:

ชนิด: <bug | ui | feature | design | build | plan | release | deps | ci | feel>
ขนาด: <เล็ก | กลาง | ใหญ่: how much review the worker runs, per the contract's Size>
เป้าหมาย: <what the owner can do afterwards>
อ้างอิง: <real paths / issue / plan>
ห้าม: <files not to touch, deps not to add>
เสร็จเมื่อ: <what someone does and sees, checked by the worker on the real thing>
ลงที่: <where finished work lands per the project's CLAUDE.md: push branch only / ff develop / ff main and push>
<plus the lines the kind needs>

No blank line inside the header: `dispatch` reads lines only up to the first blank line, and anything after it is context for the worker, never a header line.

Each kind adds its own lines and its own meaning of `เสร็จเมื่อ`; `KINDS` in `lib/briefs.ts` is the one table (bug needs `อาการ` and `คงไว้`, ui needs `คนใช้`, `แบบ` and `คงไว้`, and so on). `dispatch` refuses a brief whose kind is missing or whose lines are empty, and its error names the missing lines and what `เสร็จเมื่อ` means for that kind. The brief carries what, who, what stays, and limits, never method.

A worker that needs a secret (an API key the product calls) gets it through a `secret: <name>[, <name>]` line. The owner stores it once with `bun twin.ts secret <name>`; at each turn start it is exported as `<NAME>` (dashes to underscores). The worker's own secret-store reads are denied, so never tell it to read one.

Pick the size by the change you expect, not by the project: one file with a direct check is เล็ก even in a big repo; a release or anything others install or buy is ใหญ่ even when the diff is small.

Pick the kind by what the owner will judge, not by the files touched: a ticket that changes a screen is `ui` even when it is one line of CSS; a test that fails on CI while the product works is `ci`; a motion that "ไม่ลื่น" is `feel`.

`เสร็จเมื่อ` names an action and its visible result, never only an artifact. `คงไว้` names what already works and must still work after. `คนใช้` names who reads the result and in which language.

UI clicks need no line in the brief: a turn that changed UI files and reports `done` with no clicks gets one more turn queued automatically to click them, before `wait` returns. Work that touches files a running run already changes goes to that run as a followup, never to a second run.

Send it without waiting (step 2) unless either holds:

- a `[เดา]` that, if wrong, means redoing most of the work. Ask that one question.
- the work touches a red line or a category whose autonomy step in `<name>-mode` is below 3.

When you stop, print the brief and end with this line, flush left: `ตอบ "ทำ" หรือแก้บรรทัดที่ผิด`

## 2. Send

```bash
bun twin.ts dispatch <project> <slug> <<'EOF'
<the brief>
EOF
```

`<slug>`: short kebab-case English for the change (`checkout-ios`). Then immediately start `bun twin.ts wait <id>` with `run_in_background: true` and reply `ส่งแล้ว <id> · จะแจ้งเมื่อเสร็จ`, then the brief as sent. Keep talking with the owner about other things meanwhile.

## 3. Relay

When the background wait returns, first answer anything the owner asked since your last reply, then relay the report in a few lines: outcome, what was done, what was verified, clicked (`กดแล้ว`) and tried (`ลองแล้ว`), commits, what is pending, and the worker's ideas. The worker never opens a PR or MR: when the project uses them, open it yourself after the push gate is approved. Then one line for the decision the outcome needs:

| outcome | ask |
|---|---|
| needs-approval (push) | `เข้า <target ตาม CLAUDE.md ของ project> ไหม` (the branch itself is already pushed) |
| needs-input | the worker's question, verbatim |
| blocked | what blocked it and your recommendation |
| done | `ship ไหม หรือปิดงาน` |

`ถึงไหนแล้ว` → `bun twin.ts runs`, then answer as a checklist of the brief's steps: ✓ only for a step you saw on the real thing (the SHA on the remote branch, the pipeline, the ticket or card itself), กำลังทำ, ยังไม่ถึง. Quote the worker's last words as they are; never turn them into a step.

A finished turn of a run this session dispatched stays off the owner's band for ten minutes, shown as in progress, so you decide first: send the followup yourself when the owner's autonomy lets you or they said to decide for them, and ask the owner only what is theirs. When deciding takes longer (checking a pipeline, a page, another run), `bun twin.ts handle <id> "<what you are doing>"` keeps it off the band until its next turn or two hours.

A run belongs to the session that dispatched it. The brief and `runs` list another session's runs as `session อื่น`, and `followup` or `close` on one is refused while that session is still open: say which session has it and that it continues there, and add `--take` only when the owner asks to take it over here. A run whose session has closed is no one's: the next followup from here takes it without asking. The status band's buttons send that ask for you: "Take <id> into this session" is `bun twin.ts take <id>`, and "Take <id> into this session and approve <gates>" is `take` followed by the usual approve followup for those gates. "Answer for <id>: <text>" is the owner's answer to that run's question: send `<text>` as its followup (after `take` when it says "into this session and answer"). "ok push <id>" is the approve-push followup for that run.

## 4. Follow up

| owner says | run (then background `wait` again) |
|---|---|
| ok push / push เลย / เข้า main | `bun twin.ts followup <id> --approve push "<the project's landing steps from its CLAUDE.md> แล้วรายงาน SHA"` |
| answer to a question / more work | `bun twin.ts followup <id> "<their words>"` |
| a correction to how the worker works | `bun twin.ts followup <id> "<their words>. เพิ่มกฎนี้ลง CLAUDE.md ของ project แล้ว commit ไปกับงานนี้"` |
| ปิดงาน | `bun twin.ts close <id>` (refuses with unpushed commits; `--discard` only if the owner says ทิ้ง) |

When a run's work lands, set the todo note it served to `status: done` in the same turn; an open note with a due date is what makes `daily` draft a plan for it.

A run whose branch is already merged into develop/uat/sit/main can be closed without asking; `bun twin.ts daily` also closes those every morning.

A followup sent while the worker is still running is queued and starts the moment the current turn ends. To change direction now, `close --stop` is the only interrupt.

Approval holds for that one turn only. Production is not a gate and cannot be approved through dispatch: the owner deploys production from their own session.

## Rules

- One run per project change. At most `maxRuns` running at once, 3 unless the owner set it (`bun twin.ts profile maxRuns=<1-20>`); the CLI refuses more and its error says how to raise it.
- Never open the worktree and edit files yourself. To take over by hand, give the owner the `takeover:` line from `runs`.
