import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import type { Block, Scene } from '../app/components/walkthrough/types';

const USAGE = 'bun scripts/walkthrough.ts <recording dir>  (gamo.jsonl, worker.jsonl, run/ from one real dispatch)';
const dir = resolve(process.argv[2] ?? '');
if (!process.argv[2] || !existsSync(join(dir, 'gamo.jsonl'))) throw new Error(USAGE);
const OUT = 'app/components/walkthrough/data.generated.ts';

const Content = z.array(z.looseObject({ type: z.string(), id: z.string().optional(), tool_use_id: z.string().optional(), text: z.string().optional(), name: z.string().optional(), input: z.record(z.string(), z.unknown()).optional(), content: z.unknown().optional() }));
const Line = z.looseObject({
  type: z.string(),
  timestamp: z.string().optional(),
  isSidechain: z.boolean().optional(),
  message: z.looseObject({ content: z.union([z.string(), Content]) }).optional(),
  attachment: z.looseObject({ type: z.string(), content: z.unknown().optional(), files: z.array(z.looseObject({ path: z.string(), content: z.string().optional() })).optional(), hookName: z.string().optional() }).optional(),
});
type Line = z.infer<typeof Line>;
const Ask = z.object({ id: z.string(), from: z.string(), text: z.string() });
const Run = z.looseObject({ id: z.string(), slug: z.string(), branch: z.string(), worktree: z.string(), port: z.number(), kind: z.string(), asks: z.array(Ask) });
const Row = z.object({ ask: z.string(), result: z.string() });
const Report = z.looseObject({ outcome: z.string(), did: z.string(), discovered: z.string(), ledger: z.array(Row) });
const Verdict = z.object({ rows: z.array(z.object({ ask: z.string(), verdict: z.string(), reason: z.string() })) });

const readLines = (file: string): Line[] => readFileSync(join(dir, file), 'utf8').trim().split('\n').map((l) => Line.parse(JSON.parse(l)));
const json = <T>(schema: z.ZodType<T>, file: string): T => schema.parse(JSON.parse(readFileSync(join(dir, file), 'utf8')));

const HOME = process.env.HOME ?? '/Users/x';
const scrub = (text: string) =>
  text
    .replace(/\/private\/tmp\/claude-\d+\/[^\s"'`]*/g, '<tmp>')
    .replaceAll(`${HOME}/Development`, '~/dev')
    .replaceAll(HOME, '~')
    .replaceAll(`${HOME.replaceAll('/', '-')}-Development-`, '-dev-')
    .replace(/~\/dev\/gamo\/\.twin-scratch\/files-admin-origin\.git/g, '<origin>')
    .replace(/\bgamo\b/gi, 'nok')
    .split('\n')
    .filter((line) => !line.startsWith('Shell cwd was reset'))
    .join('\n');

const gamo = readLines('gamo.jsonl').filter((l) => !l.isSidechain);
const worker = readLines('worker.jsonl').filter((l) => !l.isSidechain);
const run = json(Run, 'run/run.json');
const report = (n: number) => Report.parse(z.looseObject({ structured_output: z.unknown() }).parse(JSON.parse(readFileSync(join(dir, `run/turn-${n}/result.json`), 'utf8'))).structured_output);
const verdict = (n: number) => json(Verdict, `run/turn-${n}/verify.json`);
const closed = readFileSync(join(dir, 'run/closed.md'), 'utf8').trim();

const clock = (l: Line) => (l.timestamp ? new Date(l.timestamp).toLocaleTimeString('en-GB', { timeZone: 'Asia/Bangkok' }) : '');
const blocksOf = (l: Line) => (typeof l.message?.content === 'string' ? [] : (l.message?.content ?? []));
const userText = (l: Line) => (l.type === 'user' && typeof l.message?.content === 'string' && !l.message.content.startsWith('<') ? l.message.content : null);
const tools = (lines: Line[]) => lines.flatMap((l) => (l.type === 'assistant' ? blocksOf(l).filter((b) => b.type === 'tool_use').map((b) => ({ line: l, name: b.name ?? '', input: b.input ?? {} })) : []));
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const results = new Map<string, string>();
for (const l of gamo)
  for (const b of blocksOf(l))
    if (b.type === 'tool_result') {
      results.set(b.tool_use_id ?? '', typeof b.content === 'string' ? b.content : JSON.stringify(b.content));
    }

function find<T>(xs: T[], pick: (x: T) => boolean, what: string): T {
  const hit = xs.find(pick);
  if (!hit) throw new Error(`recording has no ${what}: record a run where it happens, or change the story`);
  return hit;
}
const gTools = tools(gamo);
const tool = (pattern: RegExp, what: string) => find(gTools, (t) => pattern.test(`${t.name} ${str(t.input.command)} ${str(t.input.skill)}`), what);
const resultOf = (t: { line: Line; name: string; input: Record<string, unknown> }) => {
  const id = blocksOf(t.line).find((b) => b.type === 'tool_use' && b.name === t.name && b.input === t.input)?.id;
  return results.get(id ?? '') ?? '';
};
const replies = gamo.filter((l) => l.type === 'assistant' && blocksOf(l).some((b) => b.type === 'text')).map((l) => ({ at: clock(l), text: blocksOf(l).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n') }));

const head = (text: string, lines: number) => text.split('\n').slice(0, lines).join('\n');
const between = (text: string, from: string, to: string) => {
  const a = text.indexOf(from);
  const b = to ? text.indexOf(to, a + from.length) : -1;
  return a < 0 ? '' : text.slice(a, b < 0 ? undefined : b);
};


const prompts = gamo.flatMap((l) => {
  const text = userText(l);
  return text ? [{ at: clock(l), text }] : [];
});
const ask = find(prompts, (p) => p.text.includes('files-admin'), 'owner request');
const closeAsk = find(prompts, (p) => p.text.includes('ปิดงาน'), 'close request');

const hook = find(gamo, (l) => l.attachment?.hookName === 'SessionStart:startup', 'SessionStart hook');
const instructions = find(gamo, (l) => l.attachment?.type === 'instructions', 'loaded instruction files');
const listing = str(find(gamo, (l) => l.attachment?.type === 'skill_listing', 'skill listing').attachment?.content);
const dispatchLine = find(listing.split('\n'), (l) => l.startsWith('- dispatch:'), 'dispatch in the skill listing');
const skill = tool(/^Skill .*dispatch/, 'Skill dispatch call');
const skillBody = find(gamo, (l) => blocksOf(l).some((b) => b.type === 'text' && (b.text ?? '').startsWith('Base directory for this skill') && (b.text ?? '').includes('dispatch')), 'dispatch skill body');
const stateRead = tool(/state\/projects\/files-admin\.md/, 'read of the project state file');
const listProjects = tool(/ls gamo\/state\/projects/, 'project list fallback');
const inspect = tool(/git status -sb/, 'repo inspection');
const readCode = tool(/cat dialog\.js/, 'code read');
const kindCheck = tool(/sed -n 1,30p lib\/briefs\.ts/, 'kind lines check');
const dispatchCall = tool(/twin\.ts dispatch files-admin/, 'dispatch command');
const brief = between(str(dispatchCall.input.command), 'ชนิด:', '\nEOF');
const waitCall = tool(/twin\.ts wait/, 'background wait');
const diffCheck = tool(/git diff origin\/develop/, 'diff check');
const followupCall = tool(/twin\.ts followup/, 'followup');
const followupMsg = between(str(followupCall.input.command), 'แก้บั๊ก', '"');
const closeCall = tool(/twin\.ts close/, 'close');

const wTools = tools(worker);
const turnPrompts = [1, 2].map((n) => readFileSync(join(dir, `run/turn-${n}/prompt.md`), 'utf8').slice(0, 40));
const turnStart = turnPrompts.map((p, i) => find(worker, (l) => (userText(l) ?? '').startsWith(p), `worker turn ${i + 1}`).timestamp ?? '');
const inTurn = (n: number) => {
  const from = turnStart[n - 1] ?? '';
  const to = turnStart[n] ?? '~';
  return wTools.filter((t) => (t.line.timestamp ?? '') >= from && (t.line.timestamp ?? '') < to);
};
const fileTime = (file: string) => statSync(join(dir, file)).mtime.toLocaleTimeString('en-GB', { timeZone: 'Asia/Bangkok' });
const replay = (n: number) =>
  inTurn(n)
    .filter((t) => !['TaskCreate', 'TaskUpdate', 'ToolSearch', 'StructuredOutput'].includes(t.name))
    .map((t) => `${clock(t.line)}  ${t.name.padEnd(10)} ${scrub(str(t.input.description) || str(t.input.file_path).split('/').slice(-2).join('/') || str(t.input.skill) || str(t.input.subject)).slice(0, 96)}`)
    .join('\n');

const reportedAt = (n: number) => clock(find(inTurn(n), (t) => t.name === 'StructuredOutput', `worker report ${n}`).line);
const r1 = report(1);
const r2 = report(2);
const v1 = verdict(1);
const v2 = verdict(2);
const passes = (v: z.infer<typeof Verdict>) => v.rows.filter((r) => r.verdict === 'pass').length;
const open1 = v1.rows.filter((r) => r.verdict !== 'pass');
const relay1 = find(replies, (r) => r.text.startsWith('แก้ให้ Esc'), 'first relay');
const relay2 = find(replies, (r) => r.text.startsWith('เสร็จแล้ว'), 'final relay');
const sent = find(replies, (r) => r.text.startsWith('ส่งแล้ว'), 'dispatch reply');
const closeReply = find(replies, (r) => r.text.startsWith('ปิดงานแล้ว'), 'close reply');
const contract = readFileSync(join(dir, 'run/contract.md'), 'utf8');
const settings = readFileSync(join(dir, 'run/turn-1/settings.json'), 'utf8');

type Notes = Record<string, { th: string; en: string }>;
const WORKER_FLAGS: Notes = {
  '-p': { th: 'รันครั้งเดียวแบบไม่มีหน้าจอ อ่าน brief จาก prompt.md ของ turn นั้น (บรรทัด < ท้ายคำสั่ง)', en: "Runs once with no UI. It reads the brief from that turn's prompt.md (the < line at the end)." },
  '--model': { th: 'model ของ worker', en: "The worker's model." },
  '--output-format': { th: 'ผลออกมาเป็น JSON ลง result.json', en: 'The result is JSON, written to result.json.' },
  '--json-schema': { th: 'รายงานต้องตรง schema นี้ engine จึงอ่าน outcome และ ledger ได้ ถ้า worker พังกลางทางจะไม่มีรายงาน engine จึงอ่านข้อความดิบแทน', en: 'The report must match this schema, so the engine can read the outcome and the ledger. If the worker crashes there is no report, and the engine reads the raw result instead.' },
  '--permission-mode': { th: 'ทำงานได้เองไม่ต้องรอคนกดอนุญาต ราวกั้นอยู่ที่ settings ของ turn และ git hook ที่กันการ push', en: "Works without waiting for anyone to approve. The guard rails are the turn's settings and a git hook that holds pushes." },
  '--permission-prompts': { th: 'ไม่มีหน้าต่างขออนุญาต เพราะไม่มีใครนั่งกด', en: 'No permission prompts, since nobody is there to answer them.' },
  '--settings': { th: 'คำสั่งที่ deny ใน turn นี้ เช่น `gh pr`, curl POST หรือ `rm -rf` จนกว่าคุณจะอนุมัติหมวดนั้น บางข้อห้ามตลอด เช่น `--no-verify` ส่วนการ push branch อื่นถูกกันด้วย git hook ไม่ใช่ไฟล์นี้', en: "This turn's denied commands, such as `gh pr`, a curl POST or `rm -rf`, until you approve that gate. Some are denied for good, such as `--no-verify`. Pushing another branch is held by a git hook, not by this file." },
  '--setting-sources': { th: 'อ่าน settings แค่ของ project ไม่เอาของเครื่อง', en: "Reads only the project's settings, not the machine's." },
  '--session-id': { th: 'กำหนด id ของ session ไว้ก่อน turn ถัดไปจึงต่อ session เดิมได้', en: 'Fixes the session id up front, so later turns can resume it.' },
  '-n': { th: 'ชื่อ session ที่เห็นในรายการ session ของ Claude Code', en: "The session's name in Claude Code's session list." },
  '--append-system-prompt-file': { th: 'contract ต่อท้าย system prompt ไม่ได้อยู่ในไฟล์ที่ worker แก้ได้', en: 'The contract is appended to the system prompt, outside any file the worker can edit.' },
  '--resume': { th: 'ต่อ session เดิมของ worker จึงจำทุกอย่างจาก turn ก่อน', en: "Resumes the worker's own session, so it remembers the earlier turn." },
};
const VERIFY_FLAGS: Notes = {
  '-p': { th: 'รันครั้งเดียว engine ส่ง prompt ของผู้ตรวจเข้าไปตรงๆ ไม่ได้เขียนเป็นไฟล์', en: "Runs once. The engine passes the verifier's prompt in directly, not from a file." },
  '--model': { th: 'model ของผู้ตรวจ', en: "The verifier's model." },
  '--output-format': { th: 'ผลออกมาเป็น JSON', en: 'The result is JSON.' },
  '--json-schema': { th: 'คำตัดสินต้องเป็นข้อละแถว: ผ่านไหม เหตุผล ดูอะไร', en: 'The verdict must be one row per ask: pass or not, why, what it looked at.' },
  '--restricted': { th: 'ตัดเครื่องมือที่รันคำสั่งหรือโค้ดออก ไม่อ่านไฟล์ settings ของเครื่องและ project และอ่านไฟล์ได้แค่ใน worktree กับโฟลเดอร์ที่ให้', en: 'Removes the tools that run commands or code, ignores the machine and project settings files, and keeps file reads inside the worktree and the folders it is given.' },
  '--strict-mcp-config': { th: 'ไม่มี MCP server เลย', en: 'No MCP servers at all.' },
  '--tools': { th: 'อ่านไฟล์ได้อย่างเดียว แก้งานที่ตัวเองตรวจไม่ได้', en: 'Read-only tools, so it cannot change the work it judges.' },
  '--permission-mode': { th: 'ไม่ถามใคร อะไรที่ไม่อนุญาตไว้ก็ถูกปฏิเสธ', en: 'Asks no one; anything not allowed is refused.' },
  '--no-session-persistence': { th: 'ไม่เก็บ session ไว้ ตรวจครั้งเดียวแล้วทิ้ง', en: 'Keeps no session; it judges once and is gone.' },
  '--add-dir': { th: 'โฟลเดอร์ที่ให้อ่านเพิ่มจาก worktree: diff, log และไฟล์หลักฐานที่ worker อ้าง', en: 'Folders it may read besides the worktree: the diff, the log and the evidence files the worker cited.' },
};
const SHORT_VALUE: Record<string, string> = { '--json-schema': "'<schema>'" };
const hasCommand = (name: string) => existsSync(join(dir, 'run/turn-1', name));
const rerun = existsSync(join(dir, 'cmd/from')) ? readFileSync(join(dir, 'cmd/from'), 'utf8').trim() : '';
const flagsOf = (name: string) => {
  if (!hasCommand(name) && !rerun) throw new Error(`walkthrough: no run/turn-1/${name}, and no cmd/from naming a re-run that has it`);
  const argv = z.array(z.string()).parse(JSON.parse(readFileSync(join(dir, hasCommand(name) ? 'run/turn-1' : 'cmd', name), 'utf8')));
  if (argv[0] !== 'claude') throw new Error(`walkthrough: ${name} does not start with claude`);
  const groups: string[][] = [];
  for (const a of argv.slice(1)) {
    const last = groups[groups.length - 1];
    if (a.startsWith('-') || !last) groups.push([a]);
    else last.push(a);
  }
  const runId = hasCommand(name) ? run.id : rerun;
  return groups.map(([flag = '', ...values]) => ({ flag, shown: scrub([flag, ...values.map((v) => SHORT_VALUE[flag] ?? v.replaceAll(runId, '<run>'))].join(' ')) }));
};
const RERUN_NOTE = {
  th: (id: string) => `run ในหน้านี้เกิดก่อนที่ engine จะเริ่มบันทึกคำสั่ง คำสั่งนี้จึงมาจาก run ${id} ที่อัดซ้ำด้วยคำขอเดียวกัน flag เหมือนกัน ต่างกันแค่ id และชื่อของ session, path และจำนวนโฟลเดอร์หลักฐาน`,
  en: (id: string) => `The run on this page predates the engine recording its commands, so this one comes from ${id}, a re-run of the same request. The flags are the same; only the session id and name, the paths and the number of evidence folders differ.`,
};
const commandBlocks = (name: string, notes: Notes, promptOnStdin = false): Block[] => {
  const flags = flagsOf(name);
  const settingsPath = flags.find((f) => f.flag === '--settings')?.shown.replace('--settings ', '') ?? '';
  if (promptOnStdin && !settingsPath.endsWith('/settings.json')) throw new Error(`walkthrough: ${name} has no --settings file to place prompt.md beside`);
  const stdin = promptOnStdin ? settingsPath.replace(/settings\.json$/, 'prompt.md') : '';
  const explain = (lang: 'th' | 'en') => {
    const lines = [...new Set(flags.map((f) => f.flag))].map((f) => {
      const note = notes[f];
      if (!note) throw new Error(`walkthrough: ${name} uses ${f}, which has no note; add it to the flag notes`);
      return `\`${f}\` ${note[lang]}`;
    });
    return [...lines, ...(hasCommand(name) ? [] : ['', scrub(RERUN_NOTE[lang](rerun))])].join('\n');
  };
  const label = { th: 'แต่ละ flag ทำอะไร', en: 'What each flag does' };
  return [
    { label: { th: 'คำสั่งที่ engine รัน', en: 'The command the engine runs' }, body: [...flags.map((f, i) => (i === 0 ? `claude ${f.shown}` : `  ${f.shown}`)), ...(stdin ? [`  < ${stdin}`] : [])].join(' \\\n'), code: true },
    { label, body: explain('th'), only: 'th' },
    { label, body: explain('en'), only: 'en' },
  ];
};

const ENGINE_PARTS = ['\n\nงานชนิด ', '\n\nledger ของทุก report'];
const engineAdded = (n: number): Block => {
  const prompt = readFileSync(join(dir, `run/turn-${n}/prompt.md`), 'utf8');
  const at = Math.min(...ENGINE_PARTS.map((m) => prompt.indexOf(m)).filter((i) => i >= 0));
  if (!Number.isFinite(at)) throw new Error(`walkthrough: turn-${n}/prompt.md has none of the parts the engine appends (${ENGINE_PARTS.map((m) => m.trim()).join(', ')})`);
  const label =
    n === 1
      ? { th: 'engine ต่อข้อความนี้ท้าย brief ในฉาก 1 บันทึกเป็น prompt.md ของ turn แล้วส่งไฟล์นั้นให้ claude -p', en: "The engine adds this after the brief from scene 1, saves it as the turn's prompt.md and hands that file to claude -p" }
      : { th: 'engine ต่อข้อความนี้ท้าย followup บันทึกเป็น prompt.md ของ turn แล้วส่งไฟล์นั้นให้ claude -p', en: "The engine adds this after the followup, saves it as the turn's prompt.md and hands that file to claude -p" };
  return { label, body: scrub(prompt.slice(at).trim()), code: true };
};

const BRIEF_FIELDS = ['ชนิด       kind', 'ขนาด       size', 'เป้าหมาย    goal', 'อ้างอิง      references', 'ห้าม        limits', 'อาการ       symptom', 'ทำซ้ำที่      reproduce at', 'คงไว้        must keep working', 'เสร็จเมื่อ     done when', 'ลงที่        where finished work lands'].join('\n');
const MEASURED_SKILL_MISS = { th: 'วัดจาก session ของ gamo ทั้งหมด: คำสั่ง dispatch, followup, ship, close และ approve 427 จาก 1,371 ครั้ง (31%) รันตอนที่ skill นี้ยังไม่ได้โหลด', en: "Measured across all of gamo's sessions: 427 of 1,371 dispatch, followup, ship, close and approve commands (31%) ran while this skill was not loaded." };

const scenes: Scene[] = [
  {
    id: 'ask',
    time: ask.at,
    title: { th: 'คุณสั่งบรรทัดเดียว', en: 'You send one line' },
    chat: [
      { from: 'you', at: ask.at, text: ask.text, gloss: "In files-admin, Delete opens the confirm dialog but Esc doesn't close it. Fix it. Don't change the Delete button's colour, the client approved it." },
      { from: 'twin', at: sent.at, text: scrub(sent.text), gloss: 'Sent. I will tell you when it is done. I have not changed anything myself; a worker is on the branch, and I am waiting for its result.' },
    ],
    events: [
      {
        at: clock(hook),
        actor: 'engine',
        how: 'enforced',
        title: { th: 'ก่อนคุณพิมพ์ session มี mode, กฎ และงานค้างครบแล้ว', en: 'Before you type, the session already holds your mode, rules and pending work' },
        gist: { th: 'ตัวตนของคุณกับงานค้างอยู่ใน context ตั้งแต่เปิด session ไม่ต้องรอให้ model ไปอ่านเอง', en: 'Your identity and pending work are in context from the first second; the model does not have to fetch them.' },
        via: 'SessionStart hook · CLAUDE.md @import',
        why: { th: 'Claude Code อ่าน CLAUDE.md ที่ import mode.md ทุกครั้งที่เปิด session และ hook พิมพ์ brief ของวันนั้นเข้า context ไม่มีขั้นไหนให้ model เลือกข้าม', en: 'Claude Code reads CLAUDE.md, which imports mode.md, at every session start, and the hook prints the day\'s brief into context. The model has no step to skip.' },
        blocks: [
          { label: { th: 'ไฟล์ที่โหลดเข้า context (ตัวอักษร)', en: 'Files loaded into context (characters)' }, body: scrub((instructions.attachment?.files ?? []).map((f) => `${f.path}  ${(f.content ?? '').length.toLocaleString('en-US')}`).join('\n')), code: true },
          { label: { th: 'หัวของ brief จาก hook (รายการงานค้างของเจ้าของตัดออก)', en: "The head of the hook's brief (the owner's own pending items are left out)" }, body: `${scrub(head(str(hook.attachment?.content), 1))}\n…`, code: true },
        ],
      },
      {
        at: clock(skill.line),
        actor: 'twin',
        how: 'model',
        title: { th: 'model เลือกเปิด skill dispatch เอง', en: 'The model chooses to open the dispatch skill' },
        gist: { th: 'ไม่รับประกัน: คำสั่งส่งงาน 31% ที่วัดได้รันโดยไม่ได้โหลด skill นี้', en: 'Not guaranteed: in 31% of measured send-work commands this skill was not loaded.' },
        via: 'Skill tool',
        why: { th: `Claude Code ใส่ชื่อและ description ของทุก skill ไว้ใน context ตั้งแต่ต้น (ยังไม่มีเนื้อหาเต็ม) model อ่านคำของคุณ เห็นว่าตรงกับ "ไปแก้ X ใน Y" จึงเรียก Skill tool ซึ่งโหลด SKILL.md ทั้งไฟล์เข้ามา ไม่มีอะไรบังคับขั้นนี้ ${MEASURED_SKILL_MISS.th}`, en: `Claude Code puts every skill's name and description in context from the start, without the body. The model reads your words, sees they match "ไปแก้ X ใน Y" (fix X in Y), and calls the Skill tool, which loads the whole SKILL.md. Nothing enforces this step. ${MEASURED_SKILL_MISS.en}` },
        blocks: [
          { label: { th: 'สิ่งที่ model เห็นก่อนตัดสิน: description ของ skill', en: 'What the model saw before deciding: the skill description' }, body: dispatchLine, code: true },
          { label: { th: 'สิ่งที่ model เรียก', en: 'What the model called' }, body: `Skill("dispatch", "${str(skill.input.args)}")`, code: true },
          { label: { th: 'สิ่งที่เข้ามาหลังเรียก: ต้น SKILL.md', en: 'What arrived after the call: the top of SKILL.md' }, body: `${scrub(head(blocksOf(skillBody).map((b) => b.text ?? '').join(''), 5))}\n…`, code: true },
        ],
      },
      {
        at: clock(stateRead.line),
        actor: 'twin',
        how: 'model',
        title: { th: 'หาสถานะของ project ไม่เจอ เลยไปค้นรายชื่อ', en: "The project's state file is missing, so it searches the list" },
        gist: { th: 'ไฟล์สถานะเก็บ branch, plan และโน้ตของ project ไว้ แต่ repo นี้เพิ่งสร้างจนยังไม่มีไฟล์', en: "The state file holds the project's branch, plans and notes, but this repo was too new to have one." },
        via: 'state/projects/<name>.md',
        why: { th: 'skill dispatch สั่งให้อ่านไฟล์สถานะของ project ก่อนเขียน brief ไฟล์นั้นมี branch, ไฟล์ค้าง, plan และโน้ตที่ยังเปิดของ project แต่ repo นี้เพิ่งสร้างไม่กี่นาที collector ที่ sync ทุก 10 นาทียังไม่รอบ ไฟล์จึงยังไม่มี gamo เลยค้นในรายชื่อแทน', en: "The dispatch skill says to read the project's state file before writing a brief. It holds the branch, uncommitted files, plans and the project's open notes. This repo was minutes old and the 10-minute sync had not run, so the file did not exist yet and gamo searched the project list instead." },
        blocks: [
          { label: { th: 'คำสั่ง', en: 'Command' }, body: scrub(str(stateRead.input.command)), code: true },
          { label: { th: 'ผล', en: 'Result' }, body: scrub(head(resultOf(stateRead), 4)), code: true },
          { label: { th: 'ค้นต่อ', en: 'Then' }, body: scrub(str(listProjects.input.command)), code: true },
        ],
      },
      {
        at: clock(inspect.line),
        actor: 'twin',
        how: 'model',
        title: { th: 'อ่าน repo, CLAUDE.md ของ project และโค้ด', en: "Reads the repo, the project's CLAUDE.md and the code" },
        gist: { th: 'รู้จากที่นี่ว่างานต้องลงที่ไหน และ dialog ใช้ร่วมกันสองหน้า', en: 'This is where it learns where work lands, and that two pages share the dialog.' },
        via: 'git · cat',
        why: { th: 'CLAUDE.md ของ project บอกว่างานลงที่ไหน ซึ่งกลายเป็นบรรทัด ลงที่ ใน brief ส่วนโค้ดทำให้ gamo เห็นว่า dialog นี้ใช้ร่วมกันสองหน้า เลยขอให้ worker ตรวจหน้า Settings ด้วย', en: "The project's CLAUDE.md says where finished work lands, which becomes the brief's ลงที่ line. Reading the code showed the dialog is shared by two pages, so the brief asks the worker to check Settings too." },
        blocks: [
          { label: { th: 'CLAUDE.md ของ project', en: "The project's CLAUDE.md" }, body: scrub(between(resultOf(inspect), '# Files admin', '')).trim(), code: true },
          { label: { th: 'อ่านโค้ด', en: 'Code read' }, body: scrub(str(readCode.input.command)), code: true },
        ],
      },
      {
        at: clock(kindCheck.line),
        actor: 'twin',
        how: 'model',
        title: { th: 'เช็คว่า brief ชนิด bug ต้องมีบรรทัดอะไร', en: 'Checks which lines a bug brief needs' },
        gist: { th: 'ชนิดงานแต่ละแบบต้องมีบรรทัดไม่เหมือนกัน engine เป็นคนกำหนด', en: 'Each kind of work needs different lines, and the engine decides which.' },
        via: 'lib/briefs.ts KINDS',
        why: { th: 'ตารางชนิดงานอยู่ในโค้ดของ engine ที่เดียว gamo เปิดดูแทนการจำ', en: "The table of kinds lives in one place in the engine's code. gamo looked it up instead of recalling it." },
        blocks: [{ label: { th: 'คำสั่ง', en: 'Command' }, body: scrub(str(kindCheck.input.command)), code: true }],
      },
      {
        at: clock(dispatchCall.line),
        actor: 'twin',
        how: 'model',
        title: { th: 'เขียน brief แล้วส่งให้ engine', en: 'Writes the brief and hands it to the engine' },
        gist: { th: 'brief คือใบสั่งงานถึง worker: ทำอะไร ห้ามอะไร อะไรต้องคงไว้ และเสร็จเมื่อไหร่', en: 'The brief is the work order for the worker: what to do, the limits, what must keep working, and when it is done.' },
        via: 'bun twin.ts dispatch <project> <slug>',
        why: { th: 'คำของคุณ "อย่าเปลี่ยนสีปุ่ม Delete" ไปอยู่ทั้งใน ห้าม และ คงไว้ ทำซ้ำที่ มาจาก CLAUDE.md ของ project ที่บอกวิธีเปิดหน้า ส่วนข้อ Settings มาจากการอ่านโค้ด', en: 'Your "don\'t change the Delete colour" went into both ห้าม (limits) and คงไว้ (keep working). ทำซ้ำที่ (reproduce at) comes from the project\'s CLAUDE.md, which says how to serve the pages. The Settings items come from reading the code.' },
        blocks: [
          { label: { th: 'brief ที่ส่งจริง', en: 'The brief as sent' }, body: scrub(brief), code: true },
          { label: { th: '', en: 'The field names in English' }, body: BRIEF_FIELDS, code: true, only: 'en' },
        ],
      },
      {
        at: clock(dispatchCall.line),
        actor: 'engine',
        how: 'enforced',
        title: { th: `engine ตรวจ brief และแตกเป็น ${run.asks.length} ข้อ`, en: `The engine checks the brief and splits it into ${run.asks.length} asks` },
        gist: { th: 'แต่ละข้อได้ id ตามบรรทัดที่มา: d เสร็จเมื่อ · s อาการ · r ทำซ้ำที่ · k คงไว้', en: 'Each ask gets an id from its line: d done when · s symptom · r reproduce at · k must keep working.' },
        via: 'parseBrief · parseAsks',
        why: { th: 'brief ที่ขาดบรรทัดที่ชนิดงานต้องมีจะถูกปฏิเสธพร้อมบอกบรรทัดที่ขาด แต่ละผลที่ brief ขอได้ id ของตัวเอง worker ต้องรายงานครบทุกข้อในทุกรอบ', en: 'A brief missing a line its kind needs is refused with the missing lines named. Each result the brief asks for gets an id, and the worker must report every one on every turn.' },
        blocks: [{ label: { th: 'ask ที่ engine สร้าง', en: 'The asks the engine made' }, body: run.asks.map((a) => `${a.id}  ${a.text}`).join('\n'), code: true }],
      },
      {
        at: clock(dispatchCall.line),
        actor: 'engine',
        how: 'enforced',
        title: { th: 'worktree, port, contract และราวกั้น', en: 'Worktree, port, contract and guard rails' },
        gist: { th: 'worker ได้สำเนาแยกของ repo และกติกา (contract) ที่แก้ไม่ได้ push ได้แค่ branch ของตัวเอง', en: 'The worker gets a separate copy of the repo and a contract it cannot change; it can push only its own branch.' },
        via: 'bun twin.ts dispatch',
        why: { th: 'worker ทำงานในสำเนาแยก push ได้แค่ branch ของตัวเอง ได้ contract ที่บอกลำดับว่าอะไรชนะอะไร และ taste ของคุณเพราะงาน bug อาจแตะหน้าจอ ส่วนคำสั่งอันตรายถูก deny ไว้ในไฟล์ settings ของ turn นั้น', en: 'The worker gets its own copy, can push only its own branch, and gets a contract that sets precedence, plus your UI taste because a bug may touch a screen. Dangerous commands are denied in that turn\'s settings file.' },
        blocks: [
          { label: { th: 'ที่ทำงาน', en: 'Where it works' }, body: scrub(`worktree  ${run.worktree}\nbranch    ${run.branch}\nport      ${run.port}`), code: true },
          { label: { th: 'ต้น contract', en: 'The top of the contract' }, body: scrub(head(contract, 3)), code: true },
          { label: { th: 'ตัวอย่างคำสั่งที่ถูก deny', en: 'Some denied commands' }, body: head(between(settings, '"deny"', ']'), 8), code: true },
        ],
      },
      {
        at: clock(waitCall.line),
        actor: 'twin',
        how: 'model',
        title: { th: 'รอผลเบื้องหลัง แล้วตอบคุณทันที', en: 'Waits in the background and answers you at once' },
        gist: { th: 'คุณคุยเรื่องอื่นต่อได้ ผลจะเด้งกลับมาเองเมื่อ worker จบรอบ', en: 'You can keep talking; the result comes back on its own when the worker finishes a turn.' },
        via: 'bun twin.ts wait (background)',
        why: { th: 'skill dispatch บอกให้รอแบบไม่บล็อก คุณจึงคุยเรื่องอื่นต่อได้ระหว่าง worker ทำงาน', en: 'The dispatch skill says to wait without blocking, so you can keep talking while the worker runs.' },
        blocks: [{ label: { th: 'คำสั่ง', en: 'Command' }, body: scrub(str(waitCall.input.command)), code: true }],
      },
    ],
  },
  {
    id: 'worker',
    time: clock(find(worker, (l) => (l.timestamp ?? '') === turnStart[0], 'worker turn')),
    title: { th: 'worker ทำงานในสำเนาของมันเอง', en: 'The worker works in its own copy' },
    chat: [],
    events: [
      {
        at: clock(find(worker, (l) => (l.timestamp ?? '') === turnStart[0], 'worker turn')),
        actor: 'worker',
        how: 'model',
        title: { th: 'ทำซ้ำบน Chrome ก่อน แก้ แล้วตรวจทุกข้อ', en: 'Reproduces in Chrome first, fixes, then checks every ask' },
        gist: { th: 'worker เจอบั๊ก focus ด้วย แต่แค่รายงาน เพราะ contract ให้รายงานปัญหาที่มีอยู่ก่อนและอยู่นอก brief โดยไม่แก้เอง', en: 'It also found a focus bug but only reported it: the contract says to report problems that predate the brief and lie outside it, not to fix them.' },
        via: `claude -p · ${run.kind} playbook`,
        why: { th: 'worker โหลด CLAUDE.md และ skill ของ project, mode ของคุณ และ contract แล้วทำตาม playbook bug-fix: ทำซ้ำบนที่ที่ brief บอกก่อนแก้ ถ้าไม่มี test runner ก็ใช้ script ที่รันซ้ำได้แทน', en: "The worker loads the project's CLAUDE.md and skills, your mode and the contract, then follows the bug-fix playbook: reproduce where the brief says before fixing. With no test runner, it uses a script it can rerun." },
        blocks: [
          engineAdded(1),
          ...commandBlocks('command.json', WORKER_FLAGS, true),
          { label: { th: 'เล่นซ้ำ: เครื่องมือที่ worker เรียกจริง', en: 'Replay: the tools the worker really called' }, body: replay(1), code: true },
          { label: { th: 'รายงาน: ทำอะไร', en: 'Report: what it did' }, body: scrub(r1.did), code: false },
          { label: { th: 'รายงาน: สิ่งที่เจอระหว่างทาง', en: 'Report: what it found on the way' }, body: scrub(r1.discovered), code: false },
        ],
      },
      {
        at: reportedAt(1),
        actor: 'engine',
        how: 'enforced',
        title: { th: `gate อ่านรายงาน: ledger ${r1.ledger.filter((r) => r.result === 'pass').length}/${run.asks.length} ไม่ต้องมี turn ตรวจ`, en: `The gate reads the report: ledger ${r1.ledger.filter((r) => r.result === 'pass').length}/${run.asks.length}, no check turn needed` },
        gist: { th: 'ledger คือรายการตรวจของ worker เองทีละข้อ gate คือ engine เช็คว่ารายการนั้นครบและมีหลักฐาน', en: "The ledger is the worker's own checklist, one row per ask. The gate is the engine checking that list is complete and backed by evidence." },
        via: 'ledgerAsks · clicked · inputs_tried',
        why: { th: 'ถ้ารายงานว่าเสร็จแต่ขาดข้อ ข้อยังไม่ผ่าน อ้างภาพที่ไม่มีอยู่ แก้ UI แต่ไม่กด แก้โค้ดแต่ไม่ลอง input ขั้นของ playbook ยังเปิดอยู่ หรืองาน ui-figma และ ui-redo ไม่มีแถวเทียบแบบ engine จะส่ง turn ตรวจกลับไปเองหนึ่งรอบ รอบนี้ครบทุกข้อจึงผ่าน', en: 'A done report with a missing or open ask, a pass citing a missing screenshot, UI changed with no clicks, code changed with no inputs tried, an open playbook step, or a ui-figma or ui-redo turn with no design rows gets one check turn from the engine. This one had them all, so it passed.' },
        blocks: [{ label: { th: 'ledger', en: 'Ledger' }, body: r1.ledger.map((r) => `${r.ask}  ${r.result}`).join('\n'), code: true }],
      },
      {
        at: fileTime('run/turn-1/verify.json'),
        actor: 'engine',
        how: 'enforced',
        title: { th: `ผู้ตรวจอิสระ: ${passes(v1)}/${v1.rows.length} ผ่าน`, en: `Independent verifier: ${passes(v1)}/${v1.rows.length} pass` },
        gist: { th: 'model อีกตัวที่ไม่ได้ทำงานนี้ อ่านหลักฐานเองแล้วตัดสินทีละข้อ ตอนนี้แค่รายงาน ยังไม่กันงาน', en: 'A second model that did not do the work reads the evidence and judges each ask. For now it reports; it does not block.' },
        via: 'claude -p --tools Read,Glob,Grep',
        why: { th: 'model ตัวใหม่ที่อ่านไฟล์ได้อย่างเดียว ตัดสินทีละข้อจาก diff และไฟล์หลักฐาน ไม่เห็นคำตัดสินของ worker ตอนนี้ยังแค่สังเกต ไม่บล็อกงาน', en: "A fresh model that can only read files judges each ask from the diff and the evidence files, without seeing the worker's verdicts. For now it observes and blocks nothing." },
        blocks: [...open1.map((r) => ({ label: { th: `${r.ask} ${r.verdict}`, en: `${r.ask} ${r.verdict}` }, body: r.reason })), ...commandBlocks('verify-command.json', VERIFY_FLAGS)],
      },
    ],
  },
  {
    id: 'decide',
    time: clock(diffCheck.line),
    title: { th: 'gamo ตัดสินเองว่าจะแก้บั๊กที่ worker เจอ', en: 'gamo decides to fix the bug the worker found' },
    chat: [{ from: 'twin', at: relay1.at, text: scrub(relay1.text), gloss: 'Esc now closes the dialog and the Delete button is still red. I read the diff myself: only dialog.js changed. Cause: the dialog listened for clicks only, never for keys.' }],
    events: [
      {
        at: clock(diffCheck.line),
        actor: 'twin',
        how: 'model',
        title: { th: 'เปิด diff ดูเองก่อนเชื่อรายงาน', en: 'Opens the diff before trusting the report' },
        gist: { th: 'รายงานของ worker เป็นแค่คำบอกเล่า nok ดูของจริงก่อนตัดสิน', en: "The worker's report is a claim; nok looks at the real change before deciding." },
        via: 'git diff',
        why: { th: 'รายงานของ worker เป็นคำบอกเล่า gamo ดูของจริงว่าแก้แค่ dialog.js และไม่ได้แตะสีปุ่ม', en: "The worker's report is a claim. gamo checked the real change: only dialog.js, and the button colour untouched." },
        blocks: [{ label: { th: 'ผล', en: 'Result' }, body: scrub(head(resultOf(diffCheck), 2)), code: true }],
      },
      {
        at: clock(followupCall.line),
        actor: 'twin',
        how: 'model',
        title: { th: 'ส่ง followup ให้แก้บั๊ก focus ในรอบเดียวกัน', en: 'Sends a followup to fix the focus bug in the same run' },
        gist: { th: 'ตาราง ระดับการทำแทน ของคุณให้ nok สั่งงาน worker แล้วค่อยบอกคุณ จึงไม่ต้องถาม', en: 'Your autonomy table lets nok direct the worker and tell you after, so it did not ask.' },
        via: 'bun twin.ts followup <id>',
        why: { th: 'บั๊ก focus อยู่ใน dialog ตัวเดียวกันและทำให้กด Enter แล้วได้ dialog ซ้อน ตาราง ระดับการทำแทน ให้ gamo ตอบและสั่งงาน worker ได้แล้วค่อยบอกคุณ จึงไม่ต้องถาม', en: "The focus bug is in the same dialog and lets Enter open a second dialog. The autonomy table lets gamo direct the worker and tell you after, so it did not ask." },
        blocks: [{ label: { th: 'ข้อความ followup', en: 'The followup message' }, body: scrub(followupMsg), code: false }],
      },
      {
        at: clock(find(worker, (l) => (l.timestamp ?? '') === turnStart[1], 'worker turn 2')),
        actor: 'worker',
        how: 'model',
        title: { th: 'worker รอบสอง', en: 'Worker, turn 2' },
        gist: { th: 'รอบสองต่อ session เดิมของ worker จึงจำทุกอย่างจากรอบแรก', en: "Turn 2 resumes the worker's own session, so it remembers turn 1." },
        via: 'claude -p --resume',
        why: { th: 'followup ต่อ session เดิมของ worker จึงจำทุกอย่างจากรอบแรก', en: "A followup resumes the worker's own session, so it keeps everything from turn 1." },
        blocks: [
          engineAdded(2),
          { label: { th: 'เล่นซ้ำ', en: 'Replay' }, body: replay(2), code: true },
          { label: { th: 'รายงาน', en: 'Report' }, body: scrub(r2.did), code: false },
        ],
      },
      {
        at: fileTime('run/turn-2/verify.json'),
        actor: 'engine',
        how: 'enforced',
        title: { th: `ผู้ตรวจอิสระรอบสอง: ${passes(v2)}/${v2.rows.length} ผ่าน`, en: `Verifier, turn 2: ${passes(v2)}/${v2.rows.length} pass` },
        gist: { th: 'ข้อที่รอบแรกขาดหลักฐาน รอบนี้มีครบ', en: 'The ask that lacked evidence in turn 1 has it now.' },
        via: 'verify.json',
        why: { th: 'ข้อที่รอบแรกขาดหลักฐาน รอบนี้ worker ใส่คำสั่งเปิด server กับ port ไว้ในไฟล์หลักฐานแล้ว', en: 'The ask that lacked evidence in turn 1 now names the server command and port in its evidence file.' },
        blocks: [],
      },
    ],
  },
  {
    id: 'relay',
    time: relay2.at,
    title: { th: 'gamo รายงานคุณ', en: 'gamo reports to you' },
    chat: [{ from: 'twin', at: relay2.at, text: scrub(relay2.text), gloss: 'Both are done: Esc closes the dialog, and Enter no longer opens a second one. Focus now starts on Cancel and stays inside the dialog. Every ask passes, and the independent verifier passes all 10.' }],
    events: [],
  },
  {
    id: 'close',
    time: closeAsk.at,
    title: { th: 'คุณสั่งปิดงาน', en: 'You close the run' },
    chat: [
      { from: 'you', at: closeAsk.at, text: closeAsk.text, gloss: 'You can close it.' },
      { from: 'twin', at: closeReply.at, text: scrub(closeReply.text), gloss: 'Closed. The worktree and local branch are gone. The remote branch stays, because the fix lives only there until it is merged.' },
    ],
    events: [
      {
        at: clock(closeCall.line),
        actor: 'engine',
        how: 'enforced',
        title: { th: 'ลบ worktree และ branch ในเครื่อง เก็บ branch บน remote ไว้', en: 'Removes the worktree and local branch, keeps the remote branch' },
        gist: { th: 'close ไม่ทิ้งงานที่ยังไม่ merge ไว้ที่เดียว', en: 'close never drops the only copy of unmerged work.' },
        via: 'bun twin.ts close <id>',
        why: { th: 'close ไม่ยอมทิ้ง commit ที่ยังไม่ได้ push และไม่ลบ branch บน remote ที่ยังไม่ merge เพราะงานมีอยู่ที่นั่นที่เดียว', en: 'close refuses to drop unpushed commits and keeps an unmerged remote branch, because the work exists only there.' },
        blocks: [
          { label: { th: 'ผล', en: 'Result' }, body: scrub(head(resultOf(closeCall), 1)), code: true },
          { label: { th: 'closed.md', en: 'closed.md' }, body: closed, code: true },
        ],
      },
    ],
  },
];

const recorded = (find(gamo, (l) => !!l.timestamp, 'timestamp').timestamp ?? '').slice(0, 10);
const data = scrub(`import type { Walk } from './types';\n\nexport const walk: Walk = ${JSON.stringify({ recorded, run: run.id, scenes }, null, 2)};\n`);
const SAFE = new Set(['files-admin', 'twin', 'baton', 'docs', 'site', 'api']);
const projects = readFileSync(join(dir, '../../../state/projects/index.md'), 'utf8')
  .split('\n')
  .flatMap((l) => l.match(/^\| ([\w.-]{4,}) \|/)?.[1] ?? [])
  .filter((name) => !SAFE.has(name) && name !== 'project');
const LEAKS = [/\/Users\/|\/home\/|C:\\Users/, /sbpdigital|thawatchai/i, /gamo|GA-MO/i, /[\w.+-]+@[\w-]+\.[a-z]{2,}/i, /\b(sk|pk)-[\w-]{12,}|ghp_\w{20,}|glpat-\w{10,}/, ...projects.map((p) => new RegExp(`\\b${p.replace(/[.-]/g, '\\$&')}\\b`, 'i'))];
const leak = LEAKS.map((re) => data.match(re)?.[0]).find(Boolean);
if (leak) throw new Error(`walkthrough: "${leak}" would be published; scrub it or change the story. Nothing was written.`);
writeFileSync(OUT, data);
console.log(`walkthrough: ${scenes.length} scenes, ${scenes.reduce((n, s) => n + s.events.length, 0)} events, checked against ${LEAKS.length} leak patterns → ${OUT}`);
