// PostToolUse hook: runs Prettier on the file Claude just wrote or edited.
// Reads the hook payload from stdin; exits 0 no matter what so it can never
// block an edit. Registered in .claude/settings.json.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let file;
  try {
    const payload = JSON.parse(raw);
    file = payload?.tool_response?.filePath ?? payload?.tool_input?.file_path;
  } catch {
    process.exit(0);
  }
  if (!file || !existsSync(file)) process.exit(0);

  const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  const bin = path.join(root, "node_modules", "prettier", "bin", "prettier.cjs");
  if (!existsSync(bin)) process.exit(0);

  spawnSync(process.execPath, [bin, "--write", "--ignore-unknown", file], {
    cwd: root,
    stdio: "ignore",
  });
  process.exit(0);
});
