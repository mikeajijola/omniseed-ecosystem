import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { apply, correlate, digest, normalizeConnector, observe, plan } from "../../providers/servicenow/adapter.js";

const root = join(import.meta.dirname, "../..");
const schema = JSON.parse(await readFile(join(root, "providers/servicenow/configuration.schema.json")));
const manifest = JSON.parse(await readFile(join(root, "providers/servicenow/provider-package.json")));
const manifestSchema = JSON.parse(await readFile(join(root, "providers/provider-package.schema.json")));
const status = JSON.parse(await readFile(join(root, "providers/servicenow/conformance-status.json")));
const hex = character => `sha256:${character.repeat(64)}`;
const config = {
  instance: "acme-test", environment: "non_production", region: "us-east", residencyOffering: "commercial-us",
  customerConfigurationDigest: hex("a"), authority: { identityDigest: hex("b"), observe: true, mutate: true },
  resources: [{ table: "incident", sysId: "1".repeat(32), fields: ["state", "short_description"] }],
  complianceArtifacts: [{ name: "SOC 2 Type 2", offering: "commercial-us", reportDate: "2026-06-30", source: "https://example.invalid/servicenow/soc2" }]
};
const now = "2026-09-04T12:00:10.000Z";
const response = (overrides = {}) => ({
  instance: "acme-test", region: "us-east", offering: "commercial-us", table: "incident", requestId: "req-1", auditReference: "audit-1",
  relatedReferences: [{ type: "change_request", id: "2".repeat(32) }],
  observedAt: "2026-09-04T12:00:09.000Z", maxAgeMs: 60_000,
  record: { sys_id: "1".repeat(32), state: "2", short_description: "fixture", sys_mod_count: "7", sys_updated_on: "2026-09-04T12:00:08.000Z" }, ...overrides
});

test("ServiceNow package and exact environment/compliance configuration validate", () => {
  assert.equal(new Ajv2020().compile(manifestSchema)(manifest), true);
  const ajv = new Ajv2020({ allErrors: true }); addFormats(ajv);
  const validate = ajv.compile(schema);
  assert.equal(validate(config), true, JSON.stringify(validate.errors));
  assert.deepEqual(manifest.primitiveFamilies, ["connectors"]);
});

test("observation emits stable current-state, authority and provenance evidence", () => {
  const result = observe(config, response(), now);
  assert.equal(result.result, "pass");
  assert.deepEqual(result.evidence.resource, { type: "incident", id: "1".repeat(32) });
  assert.equal(result.evidence.revision, "7");
  assert.deepEqual(result.evidence.relatedReferences, [{ type: "change_request", id: "2".repeat(32) }]);
  assert.equal(result.evidence.complianceArtifacts[0].offering, config.residencyOffering);
});

test("bounded exact-plan mutation converges only after authoritative readback", () => {
  const proposed = plan(config, { table: "incident", sysId: "1".repeat(32), expectedRevision: "7", fields: { state: "3" }, operationId: "op-1" });
  assert.equal(proposed.result, "pass");
  const approved = { plan: proposed.plan, approval: { id: "approval-1", planDigest: proposed.planDigest } };
  const result = apply(config, approved, { previousRevision: "7" }, response({ record: { ...response().record, state: "3", sys_mod_count: "8" } }), now);
  assert.equal(result.result, "pass");
  assert.equal(result.evidence.readAfterWriteResult, "matched");
  assert.equal(result.evidence.planDigest, digest(proposed.plan));
});

test("policy, authority, ACL, environment, stale, conflict, outage and mismatch failures are deterministic", () => {
  const operation = { table: "incident", sysId: "1".repeat(32), expectedRevision: "7", fields: { state: "3" }, operationId: "op-1" };
  assert.equal(plan(config, { ...operation, fields: { priority: "1" } }).reason, "policy_failure");
  assert.equal(observe(config, { error: "acl_denied" }, now).reason, "authorization_failure");
  assert.equal(observe(config, response({ instance: "wrong" }), now).reason, "selection_failure");
  assert.equal(observe({ ...config, complianceArtifacts: [{ ...config.complianceArtifacts[0], offering: "gov-community-cloud" }] }, response(), now).reason, "selection_failure");
  assert.equal(observe(config, response({ observedAt: "2026-09-04T11:00:00.000Z" }), now).result, "indeterminate");
  assert.equal(observe(config, { error: "rate_limited" }, now).reason, "bounded_retry_exhausted");
  assert.equal(observe(config, { error: "unavailable" }, now).result, "indeterminate");
  const proposed = plan(config, operation), approved = { plan: proposed.plan, approval: { id: "a", planDigest: proposed.planDigest } };
  assert.equal(apply(config, approved, { previousRevision: "6" }, response(), now).reason, "record_conflict");
  assert.equal(apply(config, approved, { previousRevision: "7" }, response(), now).reason, "read_after_write_mismatch");
  assert.equal(apply(config, { plan: proposed.plan, approval: { id: "a", planDigest: hex("f") } }, {}, response(), now).reason, "exact_approval_required");
});

test("UI, REST and OmniSeed evidence correlate and actor types share one contract", () => {
  const identity = { instance: "acme-test", type: "incident", id: "1".repeat(32), revision: "8" };
  assert.equal(correlate([identity, { ...identity, projection: "rest" }, { ...identity, projection: "omniseed" }]).result, "pass");
  assert.equal(correlate([identity, { ...identity, revision: "9" }]).reason, "multimodal_evidence_mismatch");
  for (const actorType of ["human", "machine", "hybrid", "delegated", "embodied"]) assert.equal(plan(config, { table: "incident", sysId: "1".repeat(32), expectedRevision: "7", fields: { state: "3" }, operationId: actorType }).result, "pass");
});

test("normalized connector semantics are portable between ServiceNow and Salesforce", () => {
  const record = { id: "external-1", type: "service_record", status: "open", revision: "4", observedAt: now };
  const serviceNow = normalizeConnector("servicenow", record), salesforce = normalizeConnector("salesforce", record);
  assert.deepEqual({ ...serviceNow, providerId: undefined }, { ...salesforce, providerId: undefined });
});

test("unavailable live evidence blocks governed/current promotion for the exact revision", () => {
  assert.equal(status.providerRevision, manifest.version);
  assert.equal(status.provenance.authorizationCommentId, 5668044515);
  assert.equal(status.liveNonProductionEvidence.available, false);
  assert.equal(status.promotion.governedCurrent, false);
  assert.ok(status.promotion.blockedUntil.includes("exact_provider_revision_conformance_passes"));
});
