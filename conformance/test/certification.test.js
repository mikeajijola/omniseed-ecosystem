import test from "node:test";
import assert from "node:assert/strict";
import { canCertifyCandidate, subjectStateDigest } from "../src/index.js";

function fixture(kind) {
  const revision = "a".repeat(40);
  const identity = { complete: true, subjects: [{ id: "governance", revision }], invariantDigest: "sha256:test", governedProviderSet: [] };
  const digest = subjectStateDigest(identity);
  const authority = { governance: { revision } };
  return {
    reportKind: kind, summary: { failed: 0, warnings: 0, passed: 1 }, findings: [{ status: "passed" }],
    governance: { clean: true }, repositories: { core: { clean: true } },
    subjectState: { ...identity, digest, beforeDigest: digest, afterDigest: digest, observationStable: true },
    authorityObservation: { before: authority, after: authority }
  };
}
test("only a passing candidate independently rechecked against exact canonical heads can certify", () => {
  assert.equal(canCertifyCandidate(fixture("candidate"), fixture("mainline")), true);
  for (const mutate of [
    x => { x.summary.failed = 1; }, x => { x.summary.warnings = 1; },
    x => { x.findings = [{ status: "failed" }]; }, x => { x.findings = []; },
    x => { x.governance.clean = false; }, x => { x.repositories.core.clean = false; },
    x => { x.subjectState.complete = false; }, x => { x.subjectState.observationStable = false; },
    x => { x.subjectState.digest = "sha256:forged"; }, x => { x.subjectState.beforeDigest = "sha256:changed"; }
  ]) {
    const candidate = fixture("candidate"); mutate(candidate);
    assert.equal(canCertifyCandidate(candidate, fixture("mainline")), false);
    const mainline = fixture("mainline"); mutate(mainline);
    assert.equal(canCertifyCandidate(fixture("candidate"), mainline), false);
  }
  const moved = fixture("mainline"); moved.authorityObservation.after = { governance: { revision: "b".repeat(40) } };
  assert.equal(canCertifyCandidate(fixture("candidate"), moved), false);
  const unavailable = fixture("mainline"); unavailable.authorityObservation.before = null;
  assert.equal(canCertifyCandidate(fixture("candidate"), unavailable), false);
  assert.equal(canCertifyCandidate(fixture("mainline"), fixture("mainline")), false);
  assert.equal(canCertifyCandidate(fixture("candidate"), fixture("candidate")), false);
});
