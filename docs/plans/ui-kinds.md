# UI work by kind, each with its own check

The owner's UI work is six different jobs that all used one brief kind, `ui`, with one `แบบ` line holding anything from a Figma node to a sentence of copy. One check cannot fit all six: the design reviewer added on 2026-11-21 fired on every brief with `แบบ`, so a copy change got a reviewer and a vibe-coded screen with no frames got a fidelity table it could not fill.

| job | kind | truth | check |
|---|---|---|---|
| client Figma | `ui-figma` | the Figma frame | design reviewer overlays every frame; may critique only what Figma leaves out |
| redo existing UX/UI on the old CI | `ui-redo` | approved mock, the project's design system and playbook, the version in use | design reviewer per frame, and against `ของเดิม`: worse than the version in use is differs |
| small ticket | `ui` | the card and the neighbouring pages | clicks only |
| own product, no design | `ui-vibe` | the owner's taste, references they like | taste review (phase 2) |
| brand, marketing, motion, film | `feel` | brand spec, how the motion feels | a recording of each motion, checked frame by frame |
| unsettled direction | `design` | none yet | stills for the owner to pick |

Evidence: 70 UI runs from 2026-10-27 to 2026-11-21 sorted into these six by their `แบบ` line; the owner confirmed the split on 2026-11-21.

## Phase 1: kinds (engine)

- `ui-figma`, `ui-redo`, `ui-vibe` in `KINDS`; `ui` narrowed to tickets; `feel` asks for recordings.
- The design reviewer rule and its check turn apply to `DESIGN_KINDS` only, not to any brief with `แบบ`.
- `run.json` stores the kind, so the audit can later split its numbers by kind.
- dispatch skill: how to pick among the UI kinds.

Done when: a `ui` brief with `แบบ` gets no design check turn, a `ui-redo` brief does, `bun test` and the eval gate pass.

## Phase 2: the owner's taste file

- `profile/taste.md`: ten numbered sections, each a habit the owner sent UI back for, with the dated quotes it comes from (journal and `state/audit/misses.json`, 2026-10-02 to 2026-11-20). Nothing in it is invented.
- `start` appends it, headings one level down, to every run's `contract.md` under `## What the owner sends UI back for`. The contract is the system prompt, so it survives compaction on long runs. On a turn that changes UI files, every reviewer that looks at the UI checks each screen against each section and names the section in a finding. แบบ wins where a brief has it, and on a `ui` ticket the taste applies only to what the ticket changes.
- Every run, not only `ui-vibe` and `feel` as first planned, and not chosen by kind: many of the quotes came from `feature` and `bug` briefs that changed UI (sol-new-web, winyu), and from redo work (sol-backoffice-ui, receipt-mobile).
- `improve` routes a new UI correction to the file, so it grows from the owner's words only.

## Phase 3: measure reviewers on real rejections

- 8 to 10 screens the owner sent back, screenshotted from the commit before the fix, with the owner's words as the answer key.
- Reviewer arms: no rubric, taste file, taste file + charles-polish, taste file + charles-unslop.
- Score: owner complaints caught (recall) and findings the owner never raised (noise). Pick the arm from this, not from a skill's reputation.
- The audit's untouched share and sent-back count per kind, 7 days before and after; needs at least 10 runs per side, so about 2 to 3 weeks. UI corrections per week (26 in the week to 2026-11-21) is the early signal.
