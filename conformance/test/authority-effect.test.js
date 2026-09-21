import test from 'node:test';
import assert from 'node:assert/strict';
import { canonical, digest, makeChain, encodeChain, decodeChain, fixtureOperation, policyFor, verifyLineage, centralPermissionDecision, SimulatedBoundary } from '../experiments/authority-effect/model.js';
import { evaluateStewardshipProposal } from '@omniseed/engine';

test('EXP-AUTH-001: canonical identities preserve lexicographic keys and reject ambiguous values', () => {
  assert.equal(canonical({ 2: 'two', 10: 'ten' }), '{"10":"ten","2":"two"}');
  for (const value of [NaN, undefined, { ['\ud800']: 1 }, '\ud800']) assert.throws(() => canonical(value));
});

for (const [mode, actors] of Object.entries({ human: ['owner', 'operator'], machine: ['agent_a', 'tool_b'], hybrid: ['owner', 'agent_a', 'executor'], delegated: ['owner', 'agent_a', 'tool_b', 'executor'], embodied: ['owner', 'robot'] })) {
  test(`EXP-AUTH-002 / EXP-EFFECT-001: ${mode} preserves authority and separately observes outcome`, () => {
    const chain = makeChain(actors), operation = fixtureOperation(actors.at(-1)), tokens = encodeChain(chain), policy = policyFor(chain, operation);
    assert.deepEqual(decodeChain(tokens), chain);
    assert.equal(centralPermissionDecision(chain, operation), 'ALLOW');
    const authority = verifyLineage(tokens, operation, policy);
    assert.equal(authority.verdict, 'ALLOW');
    const boundary = new SimulatedBoundary({ embodied: mode === 'embodied' });
    const result = boundary.execute({ approved: operation, tokens, policy });
    assert.equal(result.verdict, 'PASS');
    assert.equal(result.authority.lineageDigest, digest(chain));
    assert.equal(result.operationDigest, result.pendingDigest);
    assert.equal(result.observed.operationDigest, result.operationDigest);
    assert.equal(boundary.execute({ approved: operation, tokens, policy }).effects, 1);
  });
}

for (const [name, mutate] of Object.entries({
  permission: c => c[2].permissions.push('resource.delete'),
  target: c => c[2].targets.push('fixture:other'),
  provider: c => c[2].providers.push('other_provider'),
  action: c => c[2].maxActions = 99,
  spend: c => c[2].maxSpend = 99,
  expiry: c => c[2].expiresAt = 2000,
  depth: c => c[2].maxDepth = 5,
  issuer: c => c[2].issuer = 'impostor',
  expired: c => c[2].expiresAt = 199,
  too_deep: c => c[0].maxDepth = 3,
})) test(`EXP-AUTH-003: rejects ${name} widening or invalid lineage`, () => {
  const chain = makeChain(), operation = fixtureOperation(); mutate(chain);
  const verdict = verifyLineage(encodeChain(chain), operation, policyFor(chain, operation));
  assert.equal(verdict.verdict, 'DENY');
  // The real Engine permission gate has no lineage input: record this gap, never call it equivalent.
  assert.equal(centralPermissionDecision(chain, operation), 'ALLOW');
});

test('EXP-AUTH-004: rejects splicing, tampering, missing lineage and wrong holder', () => {
  const chain = makeChain(), operation = fixtureOperation(), tokens = encodeChain(chain), policy = policyFor(chain, operation);
  const other = structuredClone(chain); other[1].id = 'different_parent';
  for (const invalid of [[], [tokens[0], encodeChain(other)[1], ...tokens.slice(2)], [...tokens.slice(0, 3), tokens[3].slice(0, -8) + 'AAAAAAAA']]) {
    assert.equal(verifyLineage(invalid, operation, policy).verdict, 'DENY');
  }
  assert.equal(verifyLineage(tokens, { ...operation, actor: 'impostor' }, policy).verdict, 'DENY');
  assert.equal(verifyLineage(tokens, operation, { ...policy, holderProof: '' }).verdict, 'DENY');
  assert.equal(centralPermissionDecision([{ permissions: [] }], operation), 'DENY');
});

test('EXP-AUTH-006: real Engine stewardship keeps protected categories and exact-head approval independent from delegation', () => {
  const profile = { state:'enabled', activeFrom:null, expiresAt:'2099-01-01T00:00:00.000Z', limits:{concurrency:2,dailyChanges:4,actions:8,repairRounds:2}, usage:{active:0,dailyChanges:0,actions:0,repairRounds:0}, protectedCategories:['authority'] };
  const proposal = { id:'proposal-1', digest:'a'.repeat(64), headSha:'b'.repeat(40), proposerActorId:'executor', categories:[], actionCount:1 };
  const approval = { proposalId:proposal.id, proposalDigest:proposal.digest, headSha:proposal.headSha, actorId:'reviewer' };
  assert.equal(evaluateStewardshipProposal(profile, proposal, { actorId:'executor', approval, checks:[{status:'successful'}], now:new Date('2026-09-21') }).allowed, true);
  assert.equal(evaluateStewardshipProposal(profile, {...proposal,categories:['authority']}, { actorId:'executor', approval, checks:[{status:'successful'}], now:new Date('2026-09-21') }).code, 'stewardship_owner_approval_required');
  assert.equal(evaluateStewardshipProposal(profile, proposal, { actorId:'executor', approval:{...approval,headSha:'c'.repeat(40)}, checks:[{status:'successful'}], now:new Date('2026-09-21') }).code, 'stewardship_changed_head');
});

for (const [name, override, expected] of [
  ['revoked', { revoked: ['grant_1'] }, 'DENY'], ['paused', { state: 'paused' }, 'DENY'],
  ['stale', { observedAt: 1 }, 'INDETERMINATE'], ['expired', { now: 1001, observedAt: 1001 }, 'DENY'],
]) test(`EXP-AUTH-005: current ${name} policy controls previously valid authority`, () => {
  const chain = makeChain(), operation = fixtureOperation(), tokens = encodeChain(chain);
  assert.equal(verifyLineage(tokens, operation, policyFor(chain, operation, override)).verdict, expected);
  const boundary = new SimulatedBoundary();
  assert.notEqual(boundary.execute({ approved: operation, tokens, policy: policyFor(chain, operation, override) }).verdict, 'PASS');
  assert.equal(boundary.effects, 0);
});

for (const [field, value] of [['target', 'fixture:other'], ['provider', 'substituted'], ['value', 4], ['expectedVersion', 2]]) {
  test(`EXP-EFFECT-002: ${field} substitution cannot reuse approval`, () => {
    const chain = makeChain(), approved = fixtureOperation(), pending = { ...approved, [field]: value }, boundary = new SimulatedBoundary();
    assert.equal(boundary.execute({ approved, pending, tokens: encodeChain(chain), policy: policyFor(chain, pending) }).verdict, 'FAIL');
    assert.equal(boundary.effects, 0);
  });
}

test('EXP-EFFECT-003: conditional write, replay identity and immutable evidence', () => {
  const chain = makeChain(), approved = fixtureOperation(), tokens = encodeChain(chain), policy = policyFor(chain, approved), boundary = new SimulatedBoundary();
  boundary.state.version = 2;
  assert.equal(boundary.execute({ approved, tokens, policy }).reason, 'version_conflict');
  boundary.state.version = 1;
  const result = boundary.execute({ approved, tokens, policy });
  result.verdict = 'FAIL';
  assert.equal(boundary.execute({ approved, tokens, policy }).verdict, 'PASS');
  const changed = { ...approved, value: 4, expectedVersion: 2 };
  assert.equal(boundary.execute({ approved: changed, tokens, policy: policyFor(chain, changed) }).reason, 'replay_identity_changed');
  assert.equal(boundary.effects, 1);
});

for (const [name, beforeCommit] of [['resource version', ({state}) => state.version++], ['pending operation', ({pending}) => pending.value = 4]]) test(`EXP-EFFECT-006: rejects ${name} TOCTOU between verification and commit`, () => {
  const chain=makeChain(), approved=fixtureOperation(), boundary=new SimulatedBoundary();
  const result=boundary.execute({approved,pending:structuredClone(approved),tokens:encodeChain(chain),policy:policyFor(chain,approved),beforeCommit});
  assert.equal(result.reason,'boundary_state_changed_before_commit');
  assert.equal(boundary.effects,0);
});

for (const [name, options, expected] of [['unobserved', { observable: false }, 'INDETERMINATE'], ['partial', { partial: true }, 'FAIL'], ['diverged', { readback: 99 }, 'FAIL']]) {
  test(`EXP-EFFECT-004: accepted ${name} effect is not capability success or retry permission`, () => {
    const chain = makeChain(), approved = fixtureOperation(), boundary = new SimulatedBoundary(), args = { approved, tokens: encodeChain(chain), policy: policyFor(chain, approved), ...options };
    const result = boundary.execute(args);
    assert.equal(result.authority.verdict, 'ALLOW');
    assert.equal(result.verdict, expected);
    assert.equal(result.reconciliation, 'reobserve_before_retry');
    assert.equal(boundary.execute(args).verdict, expected);
    assert.equal(boundary.effects, 1);
  });
}

for (const [name, change, expected] of [
  ['divergent', b => b.state.sensorValue = 2, 'FAIL'],
  ['stale', b => b.state.sensorAt = 100, 'INDETERMINATE'],
  ['missing', b => b.state.sensorValue = null, 'INDETERMINATE'],
]) test(`EXP-EFFECT-005: ${name} simulated sensor state prevents actuation`, () => {
  const chain = makeChain(), approved = fixtureOperation(), boundary = new SimulatedBoundary({ embodied: true }); change(boundary);
  assert.equal(boundary.execute({ approved, tokens: encodeChain(chain), policy: policyFor(chain, approved) }).verdict, expected);
  assert.equal(boundary.effects, 0);
});
