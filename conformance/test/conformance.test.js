import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runConformance } from "../src/index.js";

const workspace = resolve(new URL("../..", import.meta.url).pathname);
const products = existsSync(join(workspace, "omniform")) ? workspace : resolve(workspace, "..");

test("current ecosystem emits a valid report with no deterministic failures", async () => {
  const report = await runConformance({ output: false });
  assert.equal(report.summary.failed, 0);
  assert.ok(report.summary.passed >= 15);
  assert.ok(report.summary.notAutomated >= 1);
  assert.equal(report.findings.length, 28);
});

test("reverse runtime dependency fails ARCH-001 with inspectable evidence", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "omniseed-conformance-"));
  const form = join(fixture, "omniform");
  await cp(join(products, "omniform"), form, { recursive: true, filter: source => !source.includes("/.git") && !source.includes("/node_modules") });
  const manifestPath = join(form, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.dependencies["@omniseed/engine"] = "1.0.0-alpha.2";
  await writeFile(manifestPath, JSON.stringify(manifest));
  execFileSync("git", ["init", "-q", form]);
  execFileSync("git", ["-C", form, "add", "."]);
  execFileSync("git", ["-C", form, "-c", "user.name=Conformance Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "fixture"]);
  const report = await runConformance({ omniform: form, output: false });
  const finding = report.findings.find(item => item.invariant === "ARCH-001");
  assert.equal(finding.status, "failed");
  assert.match(finding.evidence, /@omniseed\/engine/);
});

test("every catalogue ID is unique and every deterministic test is registered", async () => {
  const { parse } = await import("yaml");
  const { ruleTests } = await import("../src/rules/index.js");
  const catalogue = parse(await readFile(join(workspace, "constitution/invariants.yaml"), "utf8"));
  const ids = catalogue.invariants.map(item => item.id);
  assert.equal(new Set(ids).size, ids.length);
  catalogue.invariants.filter(item => item.deterministic).forEach(item => assert.equal(typeof ruleTests[item.test], "function", `${item.id} has no test`));
});

test("missing exact governed Company Change boundary fails ENGINE-010", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "omniseed-company-change-conformance-"));
  const engine = join(fixture, "omniseed");
  await cp(join(products, "omniseed"), engine, { recursive: true, filter: source => !source.includes("/.git") && !source.includes("/node_modules") });
  const companyChangePath = join(engine, "src/engine.js");
  await writeFile(companyChangePath, (await readFile(companyChangePath, "utf8")).replaceAll("company_change_stale", "removed_stale_guard"));
  execFileSync("git", ["init", "-q", engine]);
  execFileSync("git", ["-C", engine, "add", "."]);
  execFileSync("git", ["-C", engine, "-c", "user.name=Conformance Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "fixture"]);
  const report = await runConformance({ engine, output: false });
  const finding = report.findings.find(item => item.invariant === "ENGINE-010");
  assert.equal(finding.status, "failed");
  assert.match(finding.evidence, /stale/i);
});

test("missing GitHub Provider manifest fails PROVIDER-001", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "omniseed-provider-conformance-"));
  await writeFile(join(fixture, "package.json"), JSON.stringify({ name: "fixture-provider", version: "0.0.0" }));
  execFileSync("git", ["init", "-q", fixture]);
  execFileSync("git", ["-C", fixture, "add", "."]);
  execFileSync("git", ["-C", fixture, "-c", "user.name=Conformance Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "fixture"]);
  const report = await runConformance({ githubProvider: fixture, output: false });
  const finding = report.findings.find(item => item.invariant === "PROVIDER-001");
  assert.equal(finding.status, "failed");
  assert.match(finding.evidence, /manifest/i);
});
