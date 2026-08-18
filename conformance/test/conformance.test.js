import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runConformance } from "../src/index.js";
import Ajv2020 from "ajv/dist/2020.js";

const workspace = resolve(new URL("../..", import.meta.url).pathname);
const detectedProducts = existsSync(join(workspace, "omniform")) ? workspace : resolve(workspace, "..");
const products = resolve(process.env.OMNISEED_PRODUCTS_ROOT ?? detectedProducts);
const defaultCompany = existsSync(join(products, "omniseed-ecosystem-company")) ? join(products, "omniseed-ecosystem-company") : join(products, "..", "omniseed-ecosystem-company");
const canonicalCompany = resolve(process.env.OMNISEED_COMPANY_REPOSITORY ?? defaultCompany);
const githubProvider = existsSync(join(products, "provider-github")) ? join(products, "provider-github") : join(products, "omniseed-provider-github");
const vercelProvider = resolve(process.env.OMNISEED_VERCEL_PROVIDER ?? join(products, "omniseed-provider-vercel"));

test("current ecosystem emits a valid report with no deterministic failures", async () => {
  const report = await runConformance({ omniform: join(products, "omniform"), engine: join(products, "omniseed"), os: join(products, "omniseedos"), company: canonicalCompany, githubProvider, vercelProvider, output: false });
  assert.equal(report.summary.failed, 0);
  assert.ok(report.summary.passed >= 15);
  assert.ok(report.summary.notAutomated >= 1);
  assert.equal(report.findings.length, 43);
  assert.equal(report.reportKind, "mainline");
  assert.equal(report.governance.commit.length, 40);
  assert.match(report.governance.invariantsDigest, /^sha256:[0-9a-f]{64}$/);
});

test("candidate evidence cannot overwrite canonical mainline evidence", async () => {
  await assert.rejects(runConformance({ reportKind: "candidate", freshness: "candidate", output: join(workspace, "reports/main/latest.json") }), /cannot overwrite canonical mainline evidence/);
});

test("company without PR-governed Git authority fails COMPANY-001", async () => {
  const fixture = await companyFixture("company-authority", source => source.replace(/  governance:\n[\s\S]*?(?=  stewardship:)/, ""));
  const finding = (await runConformance({ company: fixture, output: false })).findings.find(item => item.invariant === "COMPANY-001");
  assert.equal(finding.status, "failed"); assert.match(finding.evidence, /desired-state authority/i);
});

test("realisation participant outside primitive resources fails COMPANY-002", async () => {
  const fixture = await companyFixture("company-trace", source => source.replace("resource: lily, role: steward", "resource: invented_actor, role: steward"));
  const finding = (await runConformance({ company: fixture, output: false })).findings.find(item => item.invariant === "COMPANY-002");
  assert.equal(finding.status, "failed"); assert.match(finding.evidence, /missing primitive resource/i);
});

test("stewardship without an Agent participant fails COMPANY-003", async () => {
  const fixture = await companyFixture("company-steward", source => source.replace("resource: lily, role: steward", "resource: stewardship_skills, role: steward"));
  const finding = (await runConformance({ company: fixture, output: false })).findings.find(item => item.invariant === "COMPANY-003");
  assert.equal(finding.status, "failed"); assert.match(finding.evidence, /agents-family participant/i);
});

test("mandatory OmniSeed OS fails COMPANY-004", async () => {
  const fixture = await companyFixture("company-os", source => {
    const changed = source.replace(/(\n\s+optional:) true\b/, "$1 false");
    assert.notEqual(changed, source, "fixture must make OmniSeed OS mandatory");
    return changed;
  });
  const finding = (await runConformance({ company: fixture, output: false })).findings.find(item => item.invariant === "COMPANY-004");
  assert.equal(finding.status, "failed"); assert.match(finding.evidence, /optional primitive participant/i);
});

test("privileged or absent reconciliation path fails COMPANY-005", async () => {
  const fixture = await companyFixture("company-reconciliation", source => source.replace("id: reconcile_omniseed_ecosystem", "id: hidden_bootstrap_reconciliation"));
  const finding = (await runConformance({ company: fixture, engine: join(products, "omniseed"), output: false })).findings.find(item => item.invariant === "COMPANY-005");
  assert.equal(finding.status, "failed");
  assert.match(finding.evidence, /ordinary company capability/i);
});

test("company declaration self-pinning its runtime desired revision fails COMPANY-005", async () => {
  const fixture = await companyFixture("company-self-pin", source => source.replace("companyId: omniseed_ecosystem\n            path:", `companyId: omniseed_ecosystem\n            desiredRevision: ${"a".repeat(40)}\n            path:`));
  const finding = (await runConformance({ company: fixture, engine: join(products, "omniseed"), output: false })).findings.find(item => item.invariant === "COMPANY-005");
  assert.equal(finding.status, "failed");
  assert.match(finding.evidence, /self-pin/i);
});

test("reverse runtime dependency fails ARCH-001 with inspectable evidence", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "omniseed-conformance-"));
  const form = join(fixture, "omniform");
  await cp(join(products, "omniform"), form, { recursive: true, filter: source => !source.includes("/.git") && !source.includes("/node_modules") });
  const manifestPath = join(form, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.dependencies["@omniseed/engine"] = "1.0.0-alpha.3";
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

test("Provider apply outside the Engine and governed Git adapter fails ENGINE-001", async () => {
  const fixture = await engineFixture("uncontrolled-provider-apply");
  await writeFile(join(fixture, "src/backdoor.js"), "export async function mutate(provider, action) { return provider.apply(action); }\n");
  commitFixture(fixture);
  const finding = (await runConformance({ engine: fixture, output: false })).findings.find(item => item.invariant === "ENGINE-001");
  assert.equal(finding.status, "failed");
  assert.match(finding.evidence, /src\/backdoor\.js/);
});

test("vendor SDK dependency fails ENGINE-006 while portable YAML formatting remains allowed", async () => {
  const fixture = await engineFixture("vendor-engine-dependency");
  const manifestPath = join(fixture, "package.json"), manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.dependencies["@octokit/rest"] = "^22.0.0";
  await writeFile(manifestPath, JSON.stringify(manifest));
  commitFixture(fixture);
  const finding = (await runConformance({ engine: fixture, output: false })).findings.find(item => item.invariant === "ENGINE-006");
  assert.equal(finding.status, "failed");
  assert.match(finding.evidence, /@octokit\/rest/);
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

test("removed Provider primitive family fails PRIM-001", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "omniseed-provider-family-conformance-"));
  await cp(githubProvider, fixture, { recursive: true, filter: source => !source.includes("/.git") && !source.includes("/__pycache__") });
  const manifestPath = join(fixture, "provider-package.json"), manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.primitiveFamilies = ["systems"];
  await writeFile(manifestPath, JSON.stringify(manifest));
  execFileSync("git", ["init", "-q", fixture]);
  execFileSync("git", ["-C", fixture, "add", "."]);
  execFileSync("git", ["-C", fixture, "-c", "user.name=Conformance Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "fixture"]);
  const report = await runConformance({ githubProvider: fixture, output: false });
  const finding = report.findings.find(item => item.invariant === "PRIM-001");
  assert.equal(finding.status, "failed");
  assert.match(finding.evidence, /systems/);
});

test("hard-coded Company Search family selection fails CAP-003", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "omniseed-company-search-conformance-"));
  const engine = join(fixture, "omniseed"), form = join(fixture, "omniform");
  await cp(join(products, "omniseed"), engine, { recursive: true, filter: source => !source.includes("/.git") && !source.includes("/node_modules") });
  await cp(join(products, "omniform"), form, { recursive: true, filter: source => !source.includes("/.git") && !source.includes("/node_modules") });
  const enginePath = join(engine, "src/engine.js");
  await writeFile(enginePath, `${await readFile(enginePath, "utf8")}\n// regression fixture: spec.providers.memory\n`);
  await writeFile(join(form, "examples/company.omniform.json"), JSON.stringify({ spec: { capabilities: [{ id: "company_search" }], operations: [{ id: "search_company", capability: "company_search" }] } }));
  for (const repository of [engine, form]) {
    execFileSync("git", ["init", "-q", repository]);
    execFileSync("git", ["-C", repository, "add", "."]);
    execFileSync("git", ["-C", repository, "-c", "user.name=Conformance Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "fixture"]);
  }
  const report = await runConformance({ omniform: form, engine, output: false });
  const finding = report.findings.find(item => item.invariant === "CAP-003");
  assert.equal(finding.status, "failed");
  assert.match(finding.evidence, /hard-coded memory or skills Provider selection/i);
});

test("Provider manifest schema accepts multiple retained primitive families", async () => {
  const schema = JSON.parse(await readFile(join(workspace, "providers/provider-package.schema.json"), "utf8"));
  const validate = new Ajv2020({ strict: true }).compile(schema);
  const manifest = { manifestVersion: "1.0", id: "multi_family", version: "1.0.0", engineCompatibility: "omniseed.provider.protocol/1.0", primitiveFamilies: ["connectors", "workflows", "observations"], operations: [], configurationSchema: "./configuration.schema.json", observationTypes: [], evidenceTypes: [], permissions: [] };
  assert.equal(validate(manifest), true);
});

test("duplicate active Provider package manifests fail PROVIDER-003 with both paths", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "omniseed-provider-duplicate-"));
  await cp(vercelProvider, fixture, { recursive: true, filter: source => !source.includes("/.git") && !source.includes("/__pycache__") && !source.includes("/node_modules") });
  execFileSync("git", ["init", "-q", fixture]);
  execFileSync("git", ["-C", fixture, "add", "."]);
  execFileSync("git", ["-C", fixture, "-c", "user.name=Conformance Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "duplicate fixture"]);
  const report = await runConformance({ githubProvider: fixture, vercelProvider, output: false });
  const finding = report.findings.find(item => item.invariant === "PROVIDER-003");
  assert.equal(finding.status, "failed");
  assert.match(finding.evidence, /githubProvider/);
  assert.match(finding.evidence, /vercelProvider/);
});

test("additional Provider repositories participate in manifest identity and primitive-family conformance", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "omniseed-additional-provider-"));
  await writeFile(join(fixture, "provider-package.json"), JSON.stringify({
    manifestVersion: "1.0", id: "omnicede", version: "0.1.0",
    engineCompatibility: "omniseed.provider.protocol/1.0", primitiveFamilies: ["systems"],
    operations: [], configurationSchema: "./provider-configuration.schema.json",
    observationTypes: [], evidenceTypes: [], permissions: []
  }));
  await writeFile(join(fixture, "provider-configuration.schema.json"), JSON.stringify({ type: "object" }));
  execFileSync("git", ["init", "-q", fixture]);
  execFileSync("git", ["-C", fixture, "add", "."]);
  execFileSync("git", ["-C", fixture, "-c", "user.name=Conformance Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "fixture"]);
  const report = await runConformance({ providers: { omnicede: fixture }, output: false });
  assert.equal(report.repositories.provider_omnicede.path.endsWith("omniseed-additional-provider-"), false);
  const finding = report.findings.find(item => item.invariant === "PRIM-001");
  assert.equal(finding.status, "failed");
  assert.match(finding.evidence, /provider_omnicede/);
  assert.match(finding.evidence, /systems/);
});

async function companyFixture(name, mutate) {
  const fixture = await mkdtemp(join(tmpdir(), `${name}-`));
  await cp(canonicalCompany, fixture, { recursive: true, filter: source => !source.includes("/.git") });
  const path = join(fixture, "omniform.yaml"); await writeFile(path, mutate(await readFile(path, "utf8")));
  execFileSync("git", ["init", "-q", fixture]); execFileSync("git", ["-C", fixture, "add", "."]); execFileSync("git", ["-C", fixture, "-c", "user.name=Conformance Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "fixture"]);
  return fixture;
}

async function engineFixture(name) {
  const fixture = await mkdtemp(join(tmpdir(), `${name}-`));
  await cp(join(products, "omniseed"), fixture, { recursive: true, filter: source => !source.includes("/.git") && !source.includes("/node_modules") });
  return fixture;
}

function commitFixture(fixture) {
  execFileSync("git", ["init", "-q", fixture]);
  execFileSync("git", ["-C", fixture, "add", "."]);
  execFileSync("git", ["-C", fixture, "-c", "user.name=Conformance Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "fixture"]);
}
