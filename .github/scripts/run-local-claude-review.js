"use strict";

const { appendFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");

const prompt = process.env.CLAUDE_REVIEW_PROMPT || "";
const schema = process.env.CLAUDE_REVIEW_SCHEMA || "";
const outputFile = process.env.GITHUB_OUTPUT || "";
if (!prompt || !schema || !outputFile) throw new Error("Claude prompt, schema, and GITHUB_OUTPUT are required");

const allowedTools = [
  "Read", "Grep", "Glob",
  "Bash(git diff:*)", "Bash(git show:*)", "Bash(git log:*)",
  "Bash(git status:*)", "Bash(git rev-parse:*)", "Bash(git grep:*)",
  "Bash(gh pr view:*)", "Bash(gh pr diff:*)", "Bash(gh pr checks:*)",
  "Bash(gh run view:*)",
].join(",");

const result = spawnSync("flock", [
  "-x", "/root/.local/state/omniseed-claude.lock", "claude",
  "-p", "--output-format", "json", "--json-schema", schema,
  "--tools", "Read,Grep,Glob,Bash", "--allowedTools", allowedTools,
  "--permission-mode", "dontAsk", "--no-session-persistence", prompt,
], {
  cwd: process.cwd(), encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
  timeout: 45 * 60 * 1000, env: process.env,
});
if (result.error) throw result.error;
if (result.status !== 0) {
  const diagnostic = String(result.stderr || "").slice(-4000);
  throw new Error(`Claude review exited ${result.status}: ${diagnostic}`);
}
const envelope = JSON.parse(result.stdout || "{}");
const structured = envelope.structured_output;
if (!structured || typeof structured !== "object") throw new Error("Claude did not return structured_output");
const delimiter = `CLAUDE_${randomUUID().replaceAll("-", "")}`;
appendFileSync(outputFile, `structured_output<<${delimiter}\n${JSON.stringify(structured)}\n${delimiter}\n`, { encoding: "utf8", mode: 0o600 });
process.stdout.write("Claude returned a validated structured review\n");
