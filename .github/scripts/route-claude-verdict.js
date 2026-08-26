"use strict";

const { execFileSync } = require("node:child_process");

const allowed = new Set(["APPROVE", "CHANGES_REQUESTED", "HUMAN_GATE", "BLOCKED"]);
const routing = { APPROVE: "ready-for-human", CHANGES_REQUESTED: "needs-codex", HUMAN_GATE: "human-gate", BLOCKED: "agent-blocked" };
const exclusive = ["needs-claude", "needs-codex", "ready-for-human", "human-gate", "agent-blocked"];
const payload = JSON.parse(process.env.CLAUDE_STRUCTURED_OUTPUT || "{}");
const verdict = String(payload.verdict || "").trim();
let review = String(payload.review || "").trim();
const findingClass = String(payload.finding_class || "").trim();
const repo = process.env.GITHUB_REPOSITORY;
const pr = process.env.PR_NUMBER;

if (!allowed.has(verdict)) throw new Error(`Invalid or missing Claude verdict: ${verdict || "<empty>"}`);
const lines = review.split(/\r?\n/).filter(Boolean);
if (lines.at(-1) !== `AGENT_VERDICT: ${verdict}`) throw new Error("Claude review must end with its exact AGENT_VERDICT line");
if (!repo || !/^\d+$/.test(pr || "")) throw new Error("A valid repository and PR number are required");
if (!new Set(["NONE", "MECHANICAL", "SUBSTANTIVE", "HUMAN", "BLOCKED"]).has(findingClass)) throw new Error(`Invalid finding_class: ${findingClass || "<empty>"}`);
review = review.replace(/\nAGENT_VERDICT: ([A-Z_]+)\s*$/, `\nAGENT_FINDING_CLASS: ${findingClass}\n\nAGENT_VERDICT: $1`);

const gh = (args) => execFileSync("gh", args, { encoding: "utf8", stdio: "pipe" });
gh(["api", `repos/${repo}/issues/${pr}/comments`, "-f", `body=${review}`]);
for (const label of exclusive) {
  try { gh(["api", "-X", "DELETE", `repos/${repo}/issues/${pr}/labels/${encodeURIComponent(label)}`]); } catch (_) {}
}
gh(["api", `repos/${repo}/issues/${pr}/labels`, "-f", `labels[]=${routing[verdict]}`]);
process.stdout.write(`Routed PR #${pr} to ${routing[verdict]}\n`);

