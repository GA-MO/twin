import { expect, test } from "bun:test";
import { bashDenial } from "../lib/guard-bash.ts";

const refused = [
  "ls -d ~/.claude/projects/*resume-probe* 2>/dev/null; rm -rf ~/.claude/projects/*resume-probe* ~/.claude/projects/*gamo-audit*; echo ok",
  "rm /tmp/s/{a,b,cmp}.png",
  'D=$(mktemp -d); cd $D; rm -rf "$D"',
  "cd x && sudo rm -f $UNSET/thing",
  'for f in *.png; do rm "$f"; done',
  "if true; then rm -rf *; fi",
  "(rm -rf *)",
  "\\rm -rf *",
  "env rm -rf *",
  "timeout 5 rm -rf *",
  "sleep 1 & rm -rf *",
  "ls *.png | xargs rm",
  "find . -name '*.png' -delete",
  "find /tmp/x -path '*cache*' -exec rm -rf {} +",
  "bash -c 'rm -rf *'",
  "rm -rf $D; D=/x",
];

const allowed = [
  "rm -rf ~/.claude/projects/-private-tmp-claude-501-x-scratchpad",
  'S=/private/tmp/claude-501/x/scratchpad; rm -rf "$S/e2e" && mkdir -p $S/e2e',
  "rm -f 'literal*name'",
  'rm -f "app/[slug]/page.tsx"',
  'rm -rf "$HOME/.cache/x" "$TMPDIR/y"',
  "grep -rn 'rm -rf *' lib; echo '*'",
  "echo 'a; rm -rf *'",
  "rm -rf a b # cleanup *",
  "cat > notes/x.md <<'EOF'\n# glob incident\nrm -rf ~/.claude/projects/*probe* deleted transcripts\nEOF",
  'git commit -m "chore: tidy\n\nrm -rf old *.snap files"',
  "find . -name '*.png' -print",
  "find /tmp/x/exact -delete",
];

test("a delete by glob or by a variable of unknown value is refused, in every form a shell runs it; text that only mentions rm is not", () => {
  for (const c of refused) expect([c, bashDenial(c)?.slice(0, 12)]).toEqual([c, "ลบด้วย glob "]);
  for (const c of allowed) expect([c, bashDenial(c)]).toEqual([c, null]);
});

test("a GitLab MR merge that leaves the source branch to the project's setting is refused", () => {
  const merge = (body: string) => `const m = await api(p, \`/merge_requests/\${c.j.iid}/merge\`, { method: "PUT", headers: H, body: JSON.stringify(${body}) });`;
  const run = (...lines: string[]) => `baton run <<'EOF'\n${lines.join("\n")}\nEOF`;
  expect(bashDenial(run(merge("{}")))).toContain("should_remove_source_branch");
  expect(bashDenial(run(merge("{ should_remove_source_branch: true }"), merge("{}")))).toContain("should_remove_source_branch");
  expect(bashDenial(run(merge('{ sha: "3866fb1", should_remove_source_branch: false }')))).toBeNull();
  expect(bashDenial(run("await api(p, `/merge_requests/${iid}/merge`, {", '  method: "PUT",', "  body: JSON.stringify({ should_remove_source_branch: false }),", "});"))).toBeNull();
  expect(bashDenial(run("const body = { should_remove_source_branch: false };", "await api(p, `/merge_requests/${iid}/merge`, { method: \"PUT\", body: JSON.stringify(body) });"))).toBeNull();
  expect(bashDenial("grep -l 'merge_requests/207/merge' runs/*.log")).toBeNull();

  const create = (source: string, remove: string) => `await fetch(\`/api/v4/projects/\${p}/merge_requests\`, { method: "POST", body: JSON.stringify({\n  source_branch: "${source}", target_branch: "uat", remove_source_branch: ${remove},\n}) });`;
  expect(bashDenial(run(create("develop", "true")))).toContain("remove_source_branch: false");
  expect(bashDenial(run(create("develop", "false")))).toBeNull();
  expect(bashDenial(run(create("gamo/fix-x", "true")))).toBeNull();
  expect(bashDenial(run(create("gamo/fix-x", "true"), create("develop", "false")))).toBeNull();
});
