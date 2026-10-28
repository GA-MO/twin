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
5. **Baseline is automatic.** The gate compares engine changes with HEAD's own result and measures HEAD itself when it has none, so there is nothing to run before editing. `bun twin.ts eval before` is optional: it runs the two fast fixtures twice on the current files, which makes HEAD's result firmer before a contract or dispatch change.
6. **Verify** each change on the real thing (`bun twin.ts identity` for the identity files, `bunx tsc --noEmit -p .`, `bun test`, `bun twin.ts sync <x>`, `bun twin.ts brief`), then `git add` everything the improve changed (the gate refuses while any file is unstaged or untracked, because it checks the files on disk) and run `bun twin.ts eval`: the fast layer, the same check the commit hook runs, about a minute. Set the handled notes to `status: done` and commit with a subject starting `improve:` (`git commit --allow-empty` when only `profile/` changed); the hook reuses the result, so the commit is instant.
7. **The gate is a guardrail, not a score.** The commit hook blocks only what it can check for certain: a key rule missing from the contract, `bun test` failing, a fixture brief, a stored report or an identity file that no longer parses, a fast-fixture worker that does not finish twice, or hidden tests that fall below full twice where HEAD passed them fully. It never says better or worse, and neither do you: the single replay run it shows is too noisy to decide anything. When it refuses, tell the owner the one line it names, fix that, and run `bun twin.ts eval` again. Never bypass the hook.
   Whether an improve helped is answered by the main number in the audit: the share of handed-off runs the owner never had to touch again, compared before and after the improve once enough runs have passed. Quote that number, not an eval score.
8. If a change contradicts a decision in `docs/design.md`, record it there under "Changes since" with the evidence.

## Measuring on demand

"eval", "วัดผล", "พังไหม": run `bun twin.ts eval` and relay its lines as they are. "ดีขึ้นไหม", "แย่ลงไหม": answer from the audit's main number (`bun twin.ts sync audit`, then `state/audit/index.md`). "รัน eval ชุดเต็ม", "วัดเต็ม": `bun twin.ts eval full`, which takes tens of minutes of the machine; run it only when the owner asks, and relay its few lines.
