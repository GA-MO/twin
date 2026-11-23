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
- `parseBrief` appends it under `## What the owner sends UI back for` to every brief of a `TASTE_KINDS` kind (all UI kinds, `feel` and `design`), and the contract tells every reviewer that looks at the UI to check each screen against each section and to name the section in a finding. On `ui-figma`, แบบ wins where the two disagree.
- All UI kinds, not only `ui-vibe` and `feel` as first planned: most of the quotes came from redo and ticket work (sol-backoffice-ui, sol-new-web, receipt-mobile).
- `improve` routes a new UI correction to the file, so it grows from the owner's words only.

## Phase 3: measure reviewers on real rejections

- 8 to 10 screens the owner sent back, screenshotted from the commit before the fix, with the owner's words as the answer key.
- Reviewer arms: no rubric, taste file, taste file + charles-polish, taste file + charles-unslop.
- Score: owner complaints caught (recall) and findings the owner never raised (noise). Pick the arm from this, not from a skill's reputation.
- The audit's untouched share and sent-back count per kind, 7 days before and after; needs at least 10 runs per side, so about 2 to 3 weeks. UI corrections per week (26 in the week to 2026-11-21) is the early signal.
