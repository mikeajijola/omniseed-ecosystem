import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { providerCoverage, coverageMarkdown, primitiveFamilies } from "../../providers/generate-coverage.mjs";

const fixtures = join(import.meta.dirname, "fixtures/provider-coverage");

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "provider-coverage-")), provider = join(root, "provider"), company = join(root, "company");
  await mkdir(provider); await mkdir(company);
  await cp(join(fixtures, "valid-provider-package.json"), join(provider, "provider-package.json"));
  await writeFile(join(company, "omniform.yaml"), "spec:\n  providers:\n    workflows: { provider: github }\n    identity: { provider: github }\n  resources:\n    memory:\n      - { id: runtime, provider: neon }\n");
  return { provider, company };
}

test("coverage includes every canonical family and detects selected-family gaps", async () => {
  const { provider, company } = await fixture(), report = await providerCoverage({ providerPaths: [provider], companyPath: company });
  assert.equal(primitiveFamilies.length, 11);
  assert.equal(report.providers[0].claims[0].family, "workflows");
  assert.deepEqual(report.gaps.map(item => `${item.providerId}:${item.family}`).sort(), ["github:identity", "neon:memory"]);
});

test("implementation claims never become runtime-health assertions", async () => {
  const { provider } = await fixture(), report = await providerCoverage({ providerPaths: [provider] });
  assert.equal(report.providers[0].claims[0].conformance, "manifest_valid");
  assert.equal(report.providers[0].claims[0].liveAcceptanceEvidence, false);
  assert.match(coverageMarkdown(report), /does not assert installation.*runtime health/i);
});

test("coverage explicitly rejects a schema-invalid Provider manifest before consuming claims", async () => {
  const root = await mkdtemp(join(tmpdir(), "provider-coverage-invalid-"));
  await cp(join(fixtures, "invalid-provider-package.json"), join(root, "provider-package.json"));
  await assert.rejects(providerCoverage({ providerPaths: [root] }), /Invalid Provider manifest.*organisation|required property/i);
});

test("coverage explicitly rejects a non-canonical primitive family before consuming claims", async () => {
  const root = await mkdtemp(join(tmpdir(), "provider-coverage-family-"));
  await cp(join(fixtures, "non-canonical-family-provider-package.json"), join(root, "provider-package.json"));
  await assert.rejects(providerCoverage({ providerPaths: [root] }), /Invalid Provider manifest.*systems.*allowed values/i);
});
