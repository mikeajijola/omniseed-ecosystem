import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { providerCoverage, coverageMarkdown, primitiveFamilies } from "../../providers/generate-coverage.mjs";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "provider-coverage-")), provider = join(root, "provider"), company = join(root, "company");
  await mkdir(provider); await mkdir(company);
  await writeFile(join(provider, "provider-package.json"), JSON.stringify({ id: "github", organisation: "GitHub", version: "1.0.0", engineCompatibility: "omniseed.provider.protocol/1.0", implementations: [{ family: "workflows", products: ["Actions"] }] }));
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
