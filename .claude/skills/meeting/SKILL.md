---
name: meeting
description: Turn a meeting into decisions, the owner's action items, and new projects. Use when the owner pastes meeting notes, a recap or transcript, points at a calendar event ("ประชุมเมื่อกี้…"), or says "สรุปประชุม".
---

# meeting

## 1. Get the material

Pasted text, a file path (transcript .vtt/.docx, recap), or the owner's own summary. Match it to the event in `state/calendar/index.md` when the calendar collector is on. If there is no material, ask once for the recap or the key points; don't invent content.

## 2. Write the meeting note

`notes/<YYYY-MM-DD>-meeting-<slug>.md`:

```
---
kind: meeting
status: open
project: <project name if it maps to one in state/projects/index.md>
---
# <meeting title> · <date>

## ตัดสินใจ
- ...
## action ของเจ้าของ
- ... (due YYYY-MM-DD ถ้ามี)
## action ของคนอื่น
- <role, not personal names> ...
## ยังไม่ชัด
- ...
```

Set `status: done` once every action of the owner's has its own todo or run.

## 3. Route each of the owner's actions

- Concrete work in an existing project → offer `dispatch` with a ready brief.
- A task outside code → `notes/<date>-<slug>.md` with `kind: todo`, `due:` when known.
- A message to someone else (a follow-up email, a reply in chat) → draft it in the owner's voice from `<name>-mode` and send only as far as its autonomy step allows.
- A new project came out of the meeting → the `idea` skill, with the meeting note as `source:`.

Reply with: decisions (one line each), the owner's actions and where each went, and one recommendation for what to do first.
