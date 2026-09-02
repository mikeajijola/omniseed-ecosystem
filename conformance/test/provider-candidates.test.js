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
  assert.equal(catalogue.candidates.length, 9);
  assert.equal(new Set(catalogue.candidates.map(candidate => candidate.id)).size, 9);
  assert.deepEqual(catalogue.candidates.map(candidate => candidate.issue).sort((a, b) => a - b), [34, 35, 36, 37, 38, 39, 40, 41, 42]);
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
  assert.deepEqual(catalogue.candidates.filter(candidate => candidate.disposition === "prototype").map(candidate => candidate.id).sort(), ["clerk", "inngest", "temporal"]);
});
