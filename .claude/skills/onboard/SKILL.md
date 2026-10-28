---
name: onboard
description: Get to know the owner as a whole person (who they are, their tools, work, life outside work, how to work with them, how they decide), from their consented history first and short interviews second, and write their identity files. Use for "onboard", "สัมภาษณ์ฉัน", "เริ่มรู้จักฉัน", "ถามฉันหน่อย", "onboard ต่อ", or when the brief says onboard is pending and the owner's message answers the last question.
---

# onboard

The agent's name is `name` in `profile/twin.json` (`bun twin.ts profile`). Onboard fills six layers, broad first and deeper over days:

| layer (`layer` id) | what it covers |
|---|---|
| ตัวตน (`identity`) | role, team, organisation, a normal day, language |
| เครื่องมือ (`tools`) | machines and OS, mail, calendar, chat, documents, AI they use |
| งาน (`work`) | kinds of work, projects, customers, routines, people they work with |
| นอกงาน (`life`) | what they are learning, hobbies, what they read or follow |
| ทำงานกับเขา (`collab`) | guide step by step or just do it, how detailed, tone, when to ask |
| การตัดสินใจ (`decisions`) | red lines, criteria they decide by, how far the agent may act per category |

## Talk like this

The owner may not be a developer and is likely in the Claude Desktop Code tab. Speak plainly in their language on every turn, the short "จดไว้แล้ว" acknowledgements included; never switch to English mid-interview. Never show file names, commands, JSON, or words like commit, repo, hook, collector; say "จดไว้แล้ว" or "ตั้งไว้แล้ว". One question per turn, then stop and wait.

Every question is a short real situation with numbered options, one choice only (never "pick all that apply"), and always these two last options: `แล้วแต่ ___ (พิมพ์ว่าแล้วแต่อะไร)` and `ข้าม`. End with `ตอบเลข หรือพิมพ์เอง ใส่เหตุผลสั้นๆ ได้จะดีมาก`. Do not use the AskUserQuestion tool: it cannot carry the reason.

- Ask about the last time it happened ("ครั้งล่าสุดที่…คุณทำอะไร"), never "ปกติคุณทำยังไง". People describe themselves differently from how they act; a concrete recent case is closer to the truth.
- After an answer that gives no reason, ask why. Go two or three levels deep ("แล้วทำไมเรื่องนั้นสำคัญ") on the answers that decide something; stop when the reason repeats.
- Ask red lines directly: "อะไรที่ห้ามทำในนามคุณเด็ดขาด แม้คุณไม่อยู่".
- Find criteria with paired situations that change one thing at a time until the answer flips (an amount of money, a new or an old customer, internal or external, reversible or not). The flip point is the rule and the autonomy criterion: "ลูกน้องขอซื้อ tool 5,000 บาท…", then 15,000, then 40,000.
- When an answer contradicts their history, ask with the evidence: "บอกว่า X แต่เมื่อ <date> คุยกับ Claude เรื่อง Y (\"<short quote>\") อันไหนใกล้ตัวคุณกว่า". Never assume the history wins.
- "แล้วแต่ ___" earns exactly one follow-up question about what it depends on. "ข้าม" moves on without asking again today.

## 1. Resume or start

Read `profile/interview.md` and `profile/coverage.md`. If the interview has a question with no `ตอบ:` line, the owner's message is that answer: record it and continue. If the owner said "ถามฉันหน่อย" or "onboard ต่อ" after onboarding, go to step 6. Otherwise start a new log with one line, `# onboard <YYYY-MM-DD>`, and open with:

> จะทำความรู้จักคุณทีละข้อ หยุดได้ทุกเมื่อ แล้วค่อยต่อวันหลัง ตอบเป็นเลขหรือพิมพ์เองก็ได้ ข้อไหนไม่อยากตอบพิมพ์ "ข้าม"

## 2. Ask which history may be read

Find what exists before you ask: `profile/twin.json` `sources.claudeCodeDir` (count its `*.jsonl` files), and whether `devRoot` is set. Then ask one consent question per source, plain yes/no options plus `แล้วแต่ ___` and `ข้าม`:

- Their conversations with Claude Code on this machine (say how many sessions you found).
- Their claude.ai history: ask whether they use Claude on the web or the phone app. If yes, tell them how to export it (claude.ai → Settings → Privacy → Export data; an email with a link arrives; unzip it), then ask them to drop `conversations.json` into the `profile/imports` folder of this twin or tell you where it is.
- Their own commits in the code folder, only when `devRoot` is set.

Apply each yes at once with `bun twin.ts profile source.claudeCode=on`, `source.claudeAi=<path to conversations.json>`, `source.git=on`. Nothing is read without a yes. Then run `bun twin.ts sync history` and read `state/history/index.md`: it says how much there is and which mode to use.

## 3a. A lot of history: dig first, then confirm

When `index.md` says ระดับ มาก, read `state/history/messages.jsonl` (grep it by layer: tools named, projects, how they phrase requests to Claude, corrections like "ไม่ใช่", "บอกแล้ว", "สั้นๆ", what they ask about outside work, the days and hours in `index.md`). Draft rules for every layer, each with the quote and date it came from.

Then confirm instead of asking: one rule per turn, as the rule, why you think so, and the quote. Options: `1) ถูก` `2) ผิด` `3) แล้วแต่ ___` `4) ข้าม`. A confirmed rule is `observed`; a wrong one is dropped, and if the owner says what is true instead, that is `stated`. Still ask red lines directly, and still use paired situations for the criteria in the decisions layer: history rarely shows a line nobody crossed.

## 3b. Little or no history: interview in sets of five

Sweep every layer first, one or two questions each, in sets of five. After each set, ask: `ต่ออีก 5 ข้อ หรือพอก่อน` with options `1) ต่อ` `2) พอก่อน วันหลังค่อยต่อ`. Spend the most questions on the decisions layer and on whatever the earlier answers show they do most.

Stop a line of questioning when three answers in a row add no new rule. Stop the whole first session once every layer has at least one answer and the decisions layer has red lines and one criterion per main category; what is left is asked a few at a time later (step 6).

## 4. Log every answer before the next question

Append each question to `profile/interview.md` before asking, and fill its answer in before asking the next, so a closed window loses nothing:

```
## <n>. <layer>: <topic>
ถาม: <the situation>
ตัวเลือก: 1) … 2) … 3) แล้วแต่ ___ 4) ข้าม
ตอบ: <the owner's words, verbatim>
ทำไม: <their reason, verbatim, or "-">
หลักฐาน: <quote and date from history that supports or contradicts it, or "-">
```

Update `profile/coverage.md` as you go: per topic, `มั่นใจ` 0 not known · 1 guessed · 2 heard from the owner · 3 heard and seen in history alike; `หลักฐาน` is the number of answers and quotes behind it; `ถามล่าสุด` today's date when you asked about it. Add a topic row when a new one comes up. Keep the table's five columns and the layer names exactly as they are.

## 5. Write the identity

Write four files. Every rule, line and level cites its source: `ข้อ <n>` for an interview answer, `<source> <date>` with a quote for history. Nothing goes in that the owner did not say or that their history does not show, and no taste borrowed from anyone else.

`profile/rules.json`, one entry per rule, the reason always filled:

```json
{ "rules": [
  { "id": "short-status", "layer": "collab", "rule": "สรุปถึงเจ้าของไม่เกิน 5 bullet บรรทัดแรกคือเรื่องที่ต้องตัดสิน", "why": "อ่านจบใน 10 วินาทีระหว่างประชุม", "source": "ข้อ 7", "status": "stated", "confirmations": 0 },
  { "id": "detail-when-learning", "layer": "life", "rule": "เวลาเจ้าของเรียนเรื่องใหม่ อธิบายทีละขั้นพร้อมตัวอย่าง", "why": "ขอแบบนี้ซ้ำเวลาเรียน", "source": "claude-ai 2026-09-14", "quote": "ช่วยอธิบายทีละขั้น…", "status": "observed", "confirmations": 0 }
] }
```

`layer` is one of `identity`, `tools`, `work`, `life`, `collab`, `decisions`. `status` is `stated` (heard) or `observed` (seen in history and confirmed).

`profile/red-lines.json`: `{ "redLines": [ { "id", "never", "why", "source" } ] }`, where `never` reads after the word ห้าม ("ส่งข้อความหาลูกค้าโดยเจ้าของยังไม่เห็น").

`profile/autonomy.json`: one category per kind of decision they make, every one starting at `"ask"` unless their history shows they already let others do it (then the level that history shows, with the quote as source):

```json
{ "categories": [
  { "id": "spend", "name": "อนุมัติค่าใช้จ่าย", "level": "ask", "why": "…", "source": "ข้อ 4", "criteria": ["ต่ำกว่า 15,000 และมีของเดิมทำไม่ได้: เจ้าของอนุมัติเอง"], "ceiling": "draft", "ledger": { "predicted": 0, "correct": 0 } }
] }
```

Levels: `observe` (watch only), `ask` (ask every time), `draft` (prepare, the owner sends), `tell` (act, then tell), `silent`. `criteria` holds the flip points the paired situations found. `ceiling` is the highest level the owner will ever allow for that category, when they said one.

`profile/mode/SKILL.md`: who the owner is, in prose, short, in the owner's language. Keep its frontmatter `name` as is. Sections: one paragraph on who they are; one short section per layer with what you know (tools they actually use, their work and people by role, what they learn and enjoy, how they want help); `## ยังไม่รู้` with the open questions. Rules, red lines and the autonomy table are printed from the JSON files after this text, so do not repeat them here.

Then run `bun twin.ts identity`. It prints what every session will see and exits 1 with the problem when a file does not parse; fix it before going on.

## 6. Later: a few questions a day

After onboarding, the brief lists one to three topics from the shallowest layers ("อยากรู้จักคุณเพิ่ม … พิมพ์ \"ถามฉันหน่อย\""). When the owner asks, take those topics, ask about each the same way (recent case, options, why), log them as in step 4, update `coverage.md` (date asked, confidence, evidence) and the identity files, and run `bun twin.ts identity`. When an answer contradicts history, ask with the evidence. Never more than three questions a day unless the owner asks for more.

## 7. Turn on what they use, then close

One command with only the keys the answers support:

```bash
bun twin.ts profile devRoot=<folder|none> collector.calendar=on collector.trello=on collector.radar=on radar="<who they are, and what they learn and follow outside work>" onboarded=today
```

`radar` comes from the life layer first and the work layer second. `calendar` and `inbox` work only on a Mac. `projects` and `deps` need `devRoot`. A tool with no collector yet (Outlook, Jira, LINE) goes under ยังไม่รู้ in the mode as a source to add. A key or token is set by the owner in a terminal with `bun twin.ts secret <name>`; never ask for one in chat.

Reply in a few plain lines: who you understood them to be (five lines), the red lines, where each category starts and why, what you turned on, and that from the next conversation you will work this way. End with: "ถ้าตรงไหนไม่ใช่ บอกได้เลยว่า 'จด feedback: …'".
