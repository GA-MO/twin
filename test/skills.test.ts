import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkSkills, type Finding } from "../lib/skills.ts";

const lang = process.env.TWIN_LANG;
beforeAll(() => {
  process.env.TWIN_LANG = "en";
});
afterAll(() => {
  if (lang === undefined) delete process.env.TWIN_LANG;
  else process.env.TWIN_LANG = lang;
});

let root = "";
afterEach(() => root && rmSync(root, { recursive: true, force: true }));

function repo(files: Record<string, string>): string {
  root = mkdtempSync(join(tmpdir(), "twin-skills-"));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  return root;
}

const skill = (name: string, description: string, body = "# body\n") => `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\n---\n${body}`;
const rules = (f: Finding[]) => f.map((x) => `${x.level} ${x.file} ${x.rule}`);
const check = (files: Record<string, string>, mode: string | null = null) => checkSkills(repo(files), mode).findings;

test("a skill that follows every rule has no findings", () => {
  expect(check({ ".claude/skills/pdf/SKILL.md": skill("pdf", "Extracts text and tables from PDF files. Use when the owner mentions PDFs or forms.") })).toEqual([]);
});

test("name must be lowercase a-z 0-9 -, at most 64 characters, without reserved words, and match its folder", () => {
  const f = check({
    ".claude/skills/Big/SKILL.md": skill("Big", "Resizes photos."),
    ".claude/skills/claude-tools/SKILL.md": skill("claude-tools", "Tracks invoices."),
    ".claude/skills/long/SKILL.md": skill("a".repeat(65), "Plays music."),
    ".claude/skills/here/SKILL.md": skill("there", "Books flights."),
  });
  expect(rules(f)).toEqual([
    "error .claude/skills/Big/SKILL.md name",
    "error .claude/skills/claude-tools/SKILL.md name",
    "error .claude/skills/here/SKILL.md name-folder",
    "error .claude/skills/long/SKILL.md name",
    "error .claude/skills/long/SKILL.md name-folder",
  ]);
  expect(f.find((x) => x.file.includes("claude-tools"))!.detail).toContain("reserved word");
});

test("description must be present, at most 1,024 characters, and free of XML-like tags", () => {
  const f = check({
    ".claude/skills/empty/SKILL.md": skill("empty", ""),
    ".claude/skills/long/SKILL.md": skill("long", "x".repeat(1025)),
    ".claude/skills/edge/SKILL.md": skill("edge", "x".repeat(1024)),
    ".claude/skills/tag/SKILL.md": skill("tag", "Bill <project> monthly."),
  });
  expect(rules(f)).toEqual(["error .claude/skills/empty/SKILL.md description", "error .claude/skills/long/SKILL.md description", "error .claude/skills/tag/SKILL.md description"]);
  expect(f[1]!.detail).toContain("1025");
});

test("a broken or missing frontmatter and a folder without SKILL.md are errors, not crashes", () => {
  const f = check({
    ".claude/skills/none/SKILL.md": "# no frontmatter\n",
    ".claude/skills/typed/SKILL.md": "---\nname: [a, b]\ndescription: ok\n---\n",
    ".claude/skills/empty/notes.md": "x",
  });
  expect(rules(f)).toEqual(["error .claude/skills/none/SKILL.md frontmatter", "error .claude/skills/typed/SKILL.md frontmatter", "warn .claude/skills/empty frontmatter"]);
});

test("frontmatter that is not strict YAML is read leniently and warned about", () => {
  const f = check({ ".claude/skills/mac/SKILL.md": "---\nname: mac\ndescription: Operate apps: reminders and notes. Use for reminders.\n---\n" });
  expect(rules(f)).toEqual(["warn .claude/skills/mac/SKILL.md yaml"]);
});

test("a body over 500 lines is an error", () => {
  expect(rules(check({ ".claude/skills/big/SKILL.md": skill("big", "Does a. Use for a.", "x\n".repeat(501)) }))).toEqual(["error .claude/skills/big/SKILL.md body-lines"]);
  expect(check({ ".claude/skills/ok/SKILL.md": skill("ok", "Does a. Use for a.", "x\n".repeat(500)) })).toEqual([]);
  expect(rules(check({ "profile/mode/SKILL.md": `---\nname: nok-mode\ndescription: How nok works.\ndisable-model-invocation: true\n---\n${"x\n".repeat(600)}` }, "nok"))).toEqual(["warn profile/mode/SKILL.md body-lines"]);
});

test("references must exist, stay one level deep, and long ones need a table of contents", () => {
  const f = check({
    ".claude/skills/pdf/SKILL.md": skill("pdf", "Does a. Use for a.", "[forms](FORMS.md) [ref](ref/api.md#top) [gone](missing.md) [web](https://example.com) [up](../../docs/x.md)\n"),
    ".claude/skills/pdf/FORMS.md": "# Forms\nsee [details](details.md)\n",
    ".claude/skills/pdf/details.md": "deep\n",
    ".claude/skills/pdf/ref/api.md": "# API\n" + "line\n".repeat(150),
  });
  expect(rules(f)).toEqual(["error .claude/skills/pdf/SKILL.md reference", "warn .claude/skills/pdf/SKILL.md reference-depth", "warn .claude/skills/pdf/SKILL.md reference-toc"]);
  expect(f[0]!.detail).toContain("missing.md");
});

test("a long reference with a contents section passes", () => {
  expect(
    check({
      ".claude/skills/pdf/SKILL.md": skill("pdf", "Does a. Use for a.", "[ref](REF.md)\n"),
      ".claude/skills/pdf/REF.md": "# Ref\n## Contents\n- a\n" + "line\n".repeat(150),
    }),
  ).toEqual([]);
});

test("two skills whose descriptions share most words are warned about once, and disabled skills are not compared", () => {
  const f = check({
    ".claude/skills/computer/SKILL.md": skill("computer", "Operate reminders, calendar events, notes, mail drafts and websites. Use for reminders or notes."),
    "profile/skills/mac/SKILL.md": skill("mac", "Operate Mac reminders, calendar, notes, mail drafts and websites. Use for reminders or notes."),
    ".claude/skills/pdf/SKILL.md": skill("pdf", "Extracts text and tables from PDF files. Use when the owner mentions PDFs."),
    ".claude/skills/quiet/SKILL.md": "---\nname: quiet\ndescription: Operate reminders, calendar events, notes, mail drafts and websites.\ndisable-model-invocation: true\n---\n",
  });
  expect(rules(f)).toEqual(["warn profile/skills/mac/SKILL.md overlap"]);
  expect(f[0]!.detail).toContain("computer");
});

test("the mode skill is checked under its link name, and a profile skill linked into .claude/skills is read once", () => {
  const r = repo({
    "profile/mode/SKILL.md": skill("nok-mode", "Works the way the owner does. Use on every task."),
    "profile/skills/inv/SKILL.md": skill("inv", "Bills a client. Use for invoices."),
  });
  mkdirSync(join(r, ".claude/skills"), { recursive: true });
  symlinkSync(join(r, "profile/skills/inv"), join(r, ".claude/skills/inv"));
  const { skills, findings } = checkSkills(r, "nok");
  expect(skills.map((s) => `${s.source} ${s.name}`)).toEqual(["mode nok-mode", "profile inv"]);
  expect(findings).toEqual([]);
  expect(rules(checkSkills(r, "other").findings)).toEqual(["error profile/mode/SKILL.md name-folder"]);
});

test("a skill Claude cannot invoke on its own only warns about its description, since nothing picks it by description", () => {
  expect(rules(check({ "profile/mode/SKILL.md": "---\nname: nok-mode\ndisable-model-invocation: true\n---\n" }, "nok"))).toEqual(["warn profile/mode/SKILL.md description"]);
});

test("links inside code are not references, and a stray % or a folder named .md does not crash the check", () => {
  expect(
    check({
      ".claude/skills/code/SKILL.md": skill("code", "Calls handlers. Use for handlers.", "```ts\nconst r = handlers[name](input);\n```\nInline `fns[0](x)` and [title](path) in `[a](b)`.\n[50% off](50%-off.md) [dir](notes.md)\n"),
      ".claude/skills/code/50%-off.md": "ok\n",
      ".claude/skills/code/notes.md/inner.txt": "x",
    }),
  ).toEqual([{ level: "error", file: ".claude/skills/code/SKILL.md", rule: "reference", detail: "links to a missing file: path" }]);
});

test("a reference that links back to SKILL.md is not nesting", () => {
  expect(check({ ".claude/skills/pdf/SKILL.md": skill("pdf", "Does a. Use for a.", "[forms](FORMS.md)\n"), ".claude/skills/pdf/FORMS.md": "back to [the skill](SKILL.md)\n" })).toEqual([]);
});

test("frontmatter edge cases: a BOM, a quoted true, an empty description on the mode, and a folded block when YAML is otherwise broken", () => {
  expect(check({ ".claude/skills/bom/SKILL.md": `\uFEFF${skill("bom", "Reads BOM files. Use for BOM files.")}` })).toEqual([]);
  expect(rules(check({ "profile/mode/SKILL.md": '---\nname: nok-mode\ndescription:\ndisable-model-invocation: "true"\n---\n' }, "nok"))).toEqual(["warn profile/mode/SKILL.md description"]);
  const { skills, findings } = checkSkills(repo({ ".claude/skills/fold/SKILL.md": "---\nname: fold\ndescription: >\n  Folds text: across lines.\n  Use for folding.\nbad: : :\n---\n" }), null);
  expect(skills[0]!.description).toBe("Folds text: across lines. Use for folding.");
  expect(rules(findings)).toEqual(["warn .claude/skills/fold/SKILL.md yaml"]);
});

test("profile folders that setup ignores (names outside a-z 0-9 -) are ignored here too", () => {
  expect(check({ "profile/skills/_shared/notes.md": "x", "profile/skills/.trash/old/SKILL.md": "broken", "profile/skills/ok/SKILL.md": skill("ok", "Does a. Use for a.") })).toEqual([]);
});
