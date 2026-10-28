---
name: improve
description: Improve the agent and its <name>-mode from how the owner actually used it. Use for "improve", "ปรับตัว", "ทำไม่เหมือนฉัน", or when the brief shows the feedback reminder. Also use to record feedback ("จด feedback: …", "ไม่ควร…") and for "eval", "วัดผล".
---

# improve

## Recording feedback (any time)

When the owner says the agent did something wrong or unlike them, write it at once, one file each, `notes/<YYYY-MM-DD>-feedback-<slug>.md`:

```
---
kind: feedback
status: open
---
# <what the agent did vs what the owner wanted, one line>

<the owner's words, verbatim; the session or run id if known>
```

Reply one line: `จดแล้ว (feedback <n> ข้อ)`. Don't fix it on the spot unless the owner asks; the brief reminds them at 5 notes or after 14 days.

## Improving (on "improve")

Read `docs/design.md` first: its decisions hold unless the evidence below breaks one.

1. **Gather evidence.**
   - every open `kind: feedback` note;
   - `journal/` since the last improve commit (`git log --grep '^improve:' -1`): the owner's corrections anywhere ("ไม่ใช่", "ทำไม", "บอกแล้ว", "ลองเองหรือยัง");
   - `state/audit/index.md` (`bun twin.ts audit`): over-asking and corrections, counted;
   - `state/runs/index.md` and closed runs: worker outcomes the owner had to redo;
   - `state/*.log` for collector errors.
2. **Group** the evidence by root cause, not by symptom. Two or more items with one cause is one change.
3. **Route each cause** to the one place that fixes it:

   | cause | fix in |
   |---|---|
   | who the owner is, their tools, work, life, how they want help | `profile/mode/SKILL.md` (prose) and `profile/coverage.md` |
   | a rule about how to decide, talk or work | `profile/rules.json`: change the rule and its `why`, set `source` to the feedback note, keep every other rule; a rule the owner confirms again gets `confirmations` + 1 |
   | something the agent must never do | `profile/red-lines.json` |
   | how far the agent may act in a category | `profile/autonomy.json`, only on the owner's word, or one level down after a wrong call in that category |
   | wrong or missing data, brief noise, ranking | `collectors/*.ts`, `lib/brief.ts`, or `bun twin.ts profile collector.<name>=on|off` |
   | a skill step that misled the agent | that skill's `SKILL.md` |
   | dispatch safety or worker behavior | `lib/contract.ts` or the gates in `lib/dispatch.ts` |
   | a rule repeated in feedback twice | encode it (a type, a check, the guard hook) rather than more prose |

4. **Show the plan** before editing: one line per cause, the evidence count, the file it changes. One "ทำ", then do all of it.
5. **Baseline before the first edit**: `bun twin.ts eval before <every file in the plan>`. It measures, on the state before the change, the evals those files affect: replay of the owner's situations for the identity files, skills and CLAUDE.md; arms (workers on fixture repos with hidden tests) for `lib/contract.ts`, `lib/dispatch.ts`, `lib/briefs.ts`. A file no eval measures is named and needs nothing.
6. **Verify** each change on the real thing (`bun twin.ts identity` for the identity files, `bunx tsc --noEmit -p .`, `bun test`, `bun twin.ts sync <x>`, `bun twin.ts brief`), then `bun twin.ts eval` to measure again and compare. Set the handled notes to `status: done` and commit with a subject starting `improve:` (`git commit --allow-empty` when only `profile/` changed).
7. The commit-msg hook decides, not you: it refuses an `improve:` commit when an eval of a changed file was not measured both before and after on exactly what is committed, or when it got worse, and otherwise appends the before/after numbers to the message. When it refuses, tell the owner in one short line per item what got worse, then revise or drop that change and measure again. Never bypass the hook.
8. If a change contradicts a decision in `docs/design.md`, record it there under "Changes since" with the evidence.

## Measuring on demand

"eval", "วัดผล", "แย่ลงไหม": run `bun twin.ts eval` and relay its lines as they are. With a baseline open it compares against it; without one it measures replay and compares with the previous measurement. `bun twin.ts eval arms` measures the workers instead.
