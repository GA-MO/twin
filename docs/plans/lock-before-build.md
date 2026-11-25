# Lock what is costly to undo, show it as a still before building

Source: Dex Horthy, "12 Rules for a Software Factory That Doesn't Ship Slop" (AI Engineer, Nov 2026). The two rules that fit gamo: plan depth follows expected pain (chance a part is redone × cost to redo it), and a plan a person must approve is shown as a picture, not a wall of text. The owner agreed on 2026-11-25.

## Evidence

- sol-backoffice-ui is the lowest project in the audit: 11/24 runs untouched (46%), 5 sent back for wrong work (30 days to 2026-11-25).
- None of its send-backs in `state/audit/misses.json` is a code bug. All are design direction decided after the build: fullscreen modal or a page, cards with or without a border, how a bundle's price is shown. One quote: "ไม่ชอบแสดงราคาชุดแบบนี้ ตอนวางแผนมัน…", so a text plan let the wrong direction through.
- In the 7 days to 2026-11-25, "เพิ่มโจทย์หรือตอบคำถาม" (15) is larger than "แก้ของผิด" (8): briefs leave open what the owner later has to settle.
- Briefs have the fields ขนาด, ชนิด, แบบ, ต้นแบบ, secret. None says which parts are costly to undo, so a colour and a layout direction get the same treatment.

## Phase 1: the lock line (engine)

- A brief line `ล็อก`: the parts that are costly to undo (screen layout direction, data shape, API contract, schema, a flow the client sees). Everything else is free: the worker decides and keeps going (colour, copy, spacing).
- On a UI kind (`ui-redo`, `ui-vibe`, `feature` that changes screens), a `ล็อก` part with no approved still stops the run before building it: the worker puts one still per variant (2 to 4, absolute paths) in the report, the turn ends, and gamo shows them to the owner. The answer becomes the approved still, and building starts from it.
- A non-UI `ล็อก` part (data shape, API, schema) is settled the same way, but with a short table or diagram, not prose.
- dispatch skill: how gamo fills `ล็อก` from the ask (rule: would redoing it cost a second run?).

Done when: a `ui-redo` brief with `ล็อก: layout` and no still ends its first turn with stills and no UI files changed; a brief without `ล็อก` runs as today; `bun test`, `bunx tsc --noEmit -p .` and the eval gate pass.

Phase 1 landed 2026-11-25 (8295f94 and the review fixes after it). Choices made while building it:
- The gate reuses the check turn: while a part is unapproved, the only checks are the lock checks (no tracked change vs base or uncommitted outside `.twin-scratch/`, 2 to 4 named options per part as absolute images or .md, outcome needs-input). A check turn does not queue another, so a worker that builds twice ends at `done`; `runs` then flags it, the verifier does not run, and `followup --approve push` is refused until every part is picked.
- `followup --pick l1=B` (or `l1=A+C`, or `l1=skip` to let the worker decide) copies the picked files into `runs/<id>/locks/` and adds an `l` ask; the verifier gets the still's folder. A pick-only followup does not mark the run as touched, so Phase 2's untouched share is not biased against lock runs.
- Not done: the playbook-task check still runs on turn 1 only, which for a lock run is the stills turn.

## Phase 2: measure

- The audit's sent-back count and untouched share per project and per kind, 14 days before and after the phase 1 commit. sol-backoffice-ui needs at least 10 runs on each side.
- Count of send-backs whose quote names a part the brief had locked (a lock that did not hold) vs a part it left free (a lock that was missing).
