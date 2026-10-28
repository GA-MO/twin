---
name: idea
description: Capture an idea, think it through the way the owner would, and turn it into a new project when they say go. Use for "มีไอเดีย…", a link or post someone shared, an inbox item, "สร้างโปรเจกต์จากไอเดียนี้".
---

# idea

## 1. Capture first

Before any thinking, write `notes/<YYYY-MM-DD>-<slug>.md`:

```
---
kind: idea
status: open
source: <url, or notes-inbox:<id> for an inbox item (id from state/inbox/*.md)>
---
# <one-line idea>

<the owner's words / the post text>
```

The idea now survives a dead session, and an inbox item marked with `source: notes-inbox:<id>` stops showing as new.

## 2. Think it through

Judge it the way `<name>-mode` says the owner decides. When only a link is given, read it: with a browser (`capabilities.browser` in `profile/twin.json`: the `baton` skill, or Claude in Chrome) for pages behind a login, WebFetch for public ones. Then edit the same note in place (status `thinking`) with these sections, short:

- **ปัญหาจริง**: whose pain, and what they do today. Push back if the idea is a weak copy of something that exists.
- **ของที่มีแล้ว**: grep `state/projects/index.md`, `notes/` and `journal/` for work that already solves part of it.
- **v1**: the smallest version worth using, then **ไม่ทำ** for v1.
- **เสี่ยง**: the one assumption that kills it if wrong, and the cheapest test.
- **phases**: 2 to 4 phases, each ending in something the owner can open and use.

Ask every open question in one message, end with one recommendation.

## 3. Start the project (on "เอา" / "สร้างเลย")

Needs `devRoot` and a template repo in it (a folder whose name contains `template`; `bun twin.ts new` with no args lists them). Ask once, in one line: `สร้าง repo บน GitHub private ด้วยไหม` (a write to the owner's account). Then:

```bash
bun twin.ts new <template> <name> --idea notes/<file> [--github]
```

Set the note's frontmatter to `status: started` and add `project: <name>`. Offer the first phase through the `dispatch` skill.
