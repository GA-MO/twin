import { z } from "zod";

const Input = z.looseObject({ hook_event_name: z.string(), session_id: z.string().optional(), transcript_path: z.string().optional(), tool_input: z.record(z.string(), z.unknown()).optional() });

try {
  const input = Input.parse(JSON.parse(await Bun.stdin.text()));
  const { lendMode, promptCard } = await import("./mode.ts");
  if (input.hook_event_name === "PreToolUse" && input.tool_input) {
    const lent = lendMode(input.tool_input);
    if (lent) console.log(JSON.stringify(lent));
  }
  if (input.hook_event_name === "UserPromptSubmit") {
    const card = promptCard(input.session_id, input.transcript_path);
    if (card) console.log(card);
  }
} catch {}
