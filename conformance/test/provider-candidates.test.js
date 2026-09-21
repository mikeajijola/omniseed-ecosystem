import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";

const root = join(import.meta.dirname, "../..");
const catalogue = JSON.parse(await readFile(join(root, "providers/candidates.json"), "utf8"));
const schema = JSON.parse(await readFile(join(root, "providers/candidates.schema.json"), "utf8"));
const keys = value => value && typeof value === "object" ? Object.entries(value).flatMap(([key, nested]) => [key, ...keys(nested)]) : [];

test("coordinated Provider candidates satisfy the strict contract catalogue", () => {
  const validate = new Ajv2020({ allErrors: true }).compile(schema);
  assert.equal(validate(catalogue), true, JSON.stringify(validate.errors));
  assert.equal(catalogue.candidates.length, 19);
  assert.equal(new Set(catalogue.candidates.map(candidate => candidate.id)).size, 19);
  assert.deepEqual(catalogue.candidates.map(candidate => candidate.issue).sort((a, b) => a - b), [34, 35, 36, 37, 38, 39, 40, 41, 42, 45, 46, 47, 48, 49, 50, 51, 52, 55, 56]);
});

test("candidate declarations preserve authority and evidence boundaries", () => {
  for (const candidate of catalogue.candidates) {
    assert.ok(candidate.permissions.observe.length, `${candidate.id} has separate observation authority`);
    assert.ok(candidate.evidence.includes("observed_at"), `${candidate.id} evidence is timestamped`);
    assert.ok(candidate.policyGuards.length, `${candidate.id} has an explicit boundary guard`);
    assert.ok(!keys(candidate).some(key => /api[_-]?key|password|secret|credential[_-]?value/i.test(key)), `${candidate.id} contains no secret-bearing field`);
  }
});

test("portable families have reciprocal candidate peers", () => {
  const byId = new Map(catalogue.candidates.map(candidate => [candidate.id, candidate]));
  for (const candidate of catalogue.candidates) {
    for (const peerId of candidate.portabilityPeers.filter(peerId => byId.has(peerId))) {
      const peer = byId.get(peerId);
      assert.ok(candidate.primitiveFamilies.some(family => peer.primitiveFamilies.includes(family)), `${candidate.id} and ${peerId} share a family`);
      assert.ok(peer.portabilityPeers.includes(candidate.id), `${candidate.id}/${peerId} candidate portability is reciprocal`);
    }
  }
});

test("prototype disposition cannot imply governed or live status", () => {
  assert.match(catalogue.statusSemantics.prototype, /not governed\/current/i);
  assert.match(catalogue.statusSemantics.add_now, /not installed.*live-accepted/i);
  assert.deepEqual(catalogue.candidates.filter(candidate => candidate.disposition === "prototype").map(candidate => candidate.id).sort(), ["cerbos", "clerk", "inngest", "microsoft", "styra", "temporal", "workos"]);
});

test("second-wave candidates retain issue-authorized family boundaries", () => {
  const actual = Object.fromEntries(catalogue.candidates.filter(candidate => candidate.issue >= 45 && candidate.issue <= 52).map(candidate => [candidate.id, candidate.primitiveFamilies]));
  assert.deepEqual(actual, {
    aws: ["workflows", "schedules"],
    salesforce: ["connectors"],
    twilio: ["connectors"],
    pinecone: ["memory"],
    styra: ["policies"],
    microsoft: ["agents"],
    workos: ["identity"],
    cerbos: ["policies"]
  });
});

test("ServiceNow remains a bounded connectors implementation candidate", () => {
  const candidate = catalogue.candidates.find(candidate => candidate.id === "servicenow");
  assert.ok(candidate);
  assert.equal(candidate.issue, 55);
  assert.equal(candidate.organisation, "ServiceNow");
  assert.equal(candidate.disposition, "add_now");
  assert.deepEqual(candidate.primitiveFamilies, ["connectors"]);
  assert.deepEqual(candidate.operations, ["plan", "apply", "observe"]);
  assert.ok(candidate.permissions.observe.includes("instance_evidence.read"));
  assert.deepEqual(candidate.permissions.mutate, ["sandbox_allowlisted_field.manage"]);
  assert.ok(candidate.evidence.includes("compliance_artifact_provenance"));
  assert.ok(candidate.evidence.includes("read_after_write_result"));
  assert.ok(candidate.failureCases.includes("insufficient_role_or_acl"));
  assert.ok(candidate.failureCases.includes("company_capability_semantic_leakage"));
  assert.ok(candidate.policyGuards.includes("observation_and_mutation_authority_separate"));
  assert.ok(candidate.policyGuards.includes("provider_workflow_does_not_authorize_mutation"));
  assert.ok(candidate.policyGuards.includes("workflows_not_advertised"));
});
