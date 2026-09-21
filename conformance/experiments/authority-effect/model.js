// Conformance-only model. No production credential, Provider, or schema is changed.
import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { authorize } from "@omniseed/engine";

export function canonical(value) {
  if (typeof value === "number" && !Number.isFinite(value)) throw Error("Non-finite fixture value");
  if (typeof value === "string" && !value.isWellFormed()) throw Error("Malformed fixture string");
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    if (Object.getPrototypeOf(value) !== Object.prototype) throw Error("Non-JSON fixture object");
    return `{${Object.keys(value).sort().map(key => `${canonical(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  if (!["string", "number", "boolean"].includes(typeof value) && value !== null) throw Error("Non-JSON fixture value");
  return JSON.stringify(value);
}
export const digest = value => createHash("sha256").update(canonical(value)).digest("hex");
const hashBytes = value => createHash("sha256").update(value).digest("base64url");
const encoded = value => Buffer.from(canonical(value)).toString("base64url");
const deny = reason => ({ verdict: "DENY", reason });

// Public deterministic test seeds: never use these keys outside this fixture.
export function fixtureKey(actor) {
  const seed = createHash("sha256").update(`PUBLIC TEST KEY: ${actor}`).digest();
  const privateKey = createPrivateKey({ key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]), format: "der", type: "pkcs8" });
  return { privateKey, publicKey: createPublicKey(privateKey) };
}

function holderThumbprint(actor) {
  const { crv, kty, x } = fixtureKey(actor).publicKey.export({ format: "jwk" });
  return hashBytes(canonical({ crv, kty, x }));
}

export function makeChain(actors = ["owner", "agent_a", "tool_b", "executor"]) {
  return actors.map((actor, depth) => ({
    id: `grant_${depth}`, actor, issuer: depth ? actors[depth - 1] : "root_authority",
    permissions: depth ? ["resource.update"] : ["resource.read", "resource.update"],
    targets: depth ? ["fixture:record"] : ["fixture:record", "fixture:other"],
    providers: ["fixture_provider"], maxActions: 5 - depth, maxSpend: 10 - depth,
    issuedAt: 100, expiresAt: 1000 - depth, maxDepth: 4, depth,
  }));
}

export function encodeChain(chain) {
  const tokens = [];
  for (const grant of chain) {
    const payload = {
      iss: grant.issuer, sub: grant.actor, aud: "fixture_effect_boundary", iat: grant.issuedAt, exp: grant.expiresAt, jti: grant.id,
      del_depth: grant.depth, del_max_depth: grant.maxDepth, cnf: { jkt: holderThumbprint(grant.actor) },
      authorization_details: [{ type: "agent_delegation", scopes: grant.permissions, constraints: [
        { key: "targets", one_of: grant.targets }, { key: "providers", one_of: grant.providers },
        { key: "actions", max: grant.maxActions }, { key: "spend", max: grant.maxSpend },
      ] }],
      ...(tokens.length ? { par_hash: hashBytes(tokens.at(-1).split(".").slice(0, 2).join(".")) } : {}),
    };
    const input = `${encoded({ alg: "Ed25519", typ: "at+jwt", c14n: "JCS" })}.${encoded(payload)}`;
    tokens.push(`${input}.${sign(null, Buffer.from(input), fixtureKey(grant.issuer).privateKey).toString("base64url")}`);
  }
  return tokens;
}

export function decodeChain(tokens) {
  return tokens.map((token, depth) => {
    const parts = token.split(".");
    if (parts.length !== 3) throw Error("token_shape");
    const header = JSON.parse(Buffer.from(parts[0], "base64url"));
    const p = JSON.parse(Buffer.from(parts[1], "base64url"));
    if (encoded(header) !== parts[0] || encoded(p) !== parts[1]) throw Error("noncanonical_token");
    if (header.alg !== "Ed25519" || header.typ !== "at+jwt" || header.c14n !== "JCS") throw Error("token_algorithm");
    if (!verify(null, Buffer.from(parts.slice(0, 2).join(".")), fixtureKey(p.iss).publicKey, Buffer.from(parts[2], "base64url"))) throw Error("token_signature");
    if (p.aud !== "fixture_effect_boundary" || p.del_depth !== depth ||
      (depth === 0 ? p.par_hash !== undefined : p.par_hash !== hashBytes(tokens[depth - 1].split(".").slice(0, 2).join(".")))) throw Error("parent_linkage");
    if (p.cnf?.jkt !== holderThumbprint(p.sub)) throw Error("holder_binding");
    if (p.authorization_details?.length !== 1 || p.authorization_details[0].type !== "agent_delegation") throw Error("authority_type");
    const detail = p.authorization_details[0], constraints = detail.constraints;
    if (!Array.isArray(constraints) || constraints.length !== 4 ||
      new Set(constraints.map(c => c.key)).size !== 4) throw Error("constraints");
    const values = Object.fromEntries(constraints.map(c => {
      const type = ["targets", "providers"].includes(c.key) ? "one_of" : ["actions", "spend"].includes(c.key) ? "max" : null;
      if (!type || Object.keys(c).sort().join() !== ["key", type].sort().join()) throw Error("constraint_type");
      return [c.key, c[type]];
    }));
    return { id: p.jti, actor: p.sub, issuer: p.iss, permissions: detail.scopes, targets: values.targets, providers: values.providers,
      maxActions: values.actions, maxSpend: values.spend, issuedAt: p.iat, expiresAt: p.exp, maxDepth: p.del_max_depth, depth: p.del_depth };
  });
}

export function fixtureOperation(actor = "executor") {
  return { id: "operation_1", actor, permission: "resource.update", provider: "fixture_provider", target: "fixture:record", value: 3, expectedVersion: 1, actions: 1, spend: 1 };
}

export function holderProof(operation, actor = operation.actor) {
  return sign(null, Buffer.from(canonical(operation)), fixtureKey(actor).privateKey).toString("base64url");
}

export function verifyLineage(tokens, operation, policy) {
  try {
    const chain = decodeChain(tokens);
    if (!chain.length || digest(chain[0]) !== policy.rootDigest) return deny("untrusted_root");
    if (!Number.isFinite(policy.now) || !Number.isFinite(policy.observedAt) || policy.observedAt > policy.now || policy.now - policy.observedAt > 30) return { verdict: "INDETERMINATE", reason: "policy_stale" };
    if (!Array.isArray(policy.revoked) || policy.state !== "enabled") return deny("policy_disabled");
    for (let i = 0; i < chain.length; i++) {
      const grant = chain[i], parent = chain[i - 1];
      if (![grant.maxActions, grant.maxSpend, grant.issuedAt, grant.expiresAt, grant.maxDepth].every(n => Number.isSafeInteger(n) && n >= 0)) return deny("invalid_bound");
      if (grant.issuedAt > policy.now || grant.expiresAt <= policy.now || policy.revoked.includes(grant.id)) return deny("expired_or_revoked");
      if (chain.length > grant.maxDepth) return deny("depth_exceeded");
      for (const field of ["permissions", "targets", "providers"]) {
        if (!Array.isArray(grant[field]) || !grant[field].length || grant[field].some(x => typeof x !== "string" || !x)) return deny("invalid_scope");
        if (parent && grant[field].some(x => !parent[field].includes(x))) return deny(`${field}_widened`);
      }
      if (parent && (grant.issuer !== parent.actor || grant.expiresAt > parent.expiresAt || grant.issuedAt < parent.issuedAt ||
          grant.maxDepth > parent.maxDepth || grant.maxActions > parent.maxActions || grant.maxSpend > parent.maxSpend)) return deny("bound_widened");
    }
    const leaf = chain.at(-1);
    if (operation.actor !== leaf.actor || !verify(null, Buffer.from(canonical(operation)), fixtureKey(leaf.actor).publicKey, Buffer.from(policy.holderProof ?? "", "base64url"))) return deny("holder_binding");
    if (!leaf.permissions.includes(operation.permission) || !leaf.targets.includes(operation.target) || !leaf.providers.includes(operation.provider) ||
      !Number.isSafeInteger(operation.actions) || operation.actions < 0 || operation.actions > leaf.maxActions ||
      !Number.isSafeInteger(operation.spend) || operation.spend < 0 || operation.spend > leaf.maxSpend) return deny("operation_outside_grant");
    return { verdict: "ALLOW", reason: "attenuated", lineageDigest: digest(chain), operationDigest: digest(operation) };
  } catch (error) { return deny(error.message); }
}

export function centralPermissionDecision(chain, operation) {
  try { authorize({ actorId: operation.actor, permissions: chain.at(-1)?.permissions ?? [] }, [operation.permission]); return "ALLOW"; }
  catch { return "DENY"; }
}

export function policyFor(chain, operation, overrides = {}) {
  return { rootDigest: digest(chain[0]), now: 200, observedAt: 200, state: "enabled", revoked: [], holderProof: holderProof(operation), ...overrides };
}

export class SimulatedBoundary {
  constructor({ embodied = false } = {}) {
    this.state = { value: 0, version: 1, sensorValue: 0, sensorAt: 200 };
    this.embodied = embodied;
    this.receipts = new Map();
    this.effects = 0;
  }
  execute({ approved, pending = approved, tokens, policy, observable = true, partial = false, readback = null, beforeCommit = null }) {
    const identity = digest(approved), pendingIdentity = digest(pending);
    const authority = verifyLineage(tokens, pending, policy);
    const base = { operationDigest: identity, pendingDigest: pendingIdentity, authority, target: pending.target, provider: pending.provider, actor: pending.actor, embodied: this.embodied };
    const result = (verdict, reason, extra = {}) => ({ ...base, verdict, reason, effects: this.effects, ...extra });
    if (authority.verdict !== "ALLOW") return result(authority.verdict === "INDETERMINATE" ? "INDETERMINATE" : "FAIL", authority.reason);
    if (identity !== pendingIdentity) return result("FAIL", "pending_operation_changed");
    if (this.receipts.has(pending.id)) {
      const receipt = this.receipts.get(pending.id);
      return receipt.operationDigest === identity ? result(receipt.verdict, "idempotent_replay", { receipt: structuredClone(receipt) }) : result("FAIL", "replay_identity_changed");
    }
    if (pending.expectedVersion !== this.state.version) return result("FAIL", "version_conflict");
    if (!Number.isFinite(pending.value)) return result("FAIL", "invalid_material_value");
    if (this.embodied && (![this.state.sensorValue, this.state.sensorAt, this.state.value].every(Number.isFinite))) return result("INDETERMINATE", "sensor_missing");
    if (this.embodied && (Math.abs(this.state.sensorValue - this.state.value) > 0.1 || Math.abs(pending.value) > 5)) return result("FAIL", "unsafe_simulated_state");
    if (this.embodied && (policy.now - this.state.sensorAt > 5 || this.state.sensorAt > policy.now)) return result("INDETERMINATE", "sensor_stale");
    const verified = { operationDigest: pendingIdentity, version: this.state.version, sensorValue: this.state.sensorValue, sensorAt: this.state.sensorAt };
    beforeCommit?.({ pending, state: this.state });
    if (digest(pending) !== verified.operationDigest || this.state.version !== verified.version ||
        (this.embodied && (this.state.sensorValue !== verified.sensorValue || this.state.sensorAt !== verified.sensorAt))) return result("FAIL", "boundary_state_changed_before_commit");
    // Synchronous compare-and-commit in an isolated in-memory simulation only.
    this.state.value = partial ? pending.value / 2 : pending.value;
    this.state.version++;
    this.state.sensorValue = this.state.value;
    this.effects++;
    const observed = observable ? { value: readback ?? this.state.value, version: this.state.version, operationDigest: pendingIdentity } : null;
    const verdict = !observed ? "INDETERMINATE" : observed.value === approved.value ? "PASS" : "FAIL";
    const receipt = result(verdict, !observed ? "accepted_unobserved" : verdict === "PASS" ? "effect_observed" : "effect_diverged", { observed, reconciliation: verdict === "PASS" ? "none" : "reobserve_before_retry" });
    this.receipts.set(pending.id, structuredClone(receipt));
    return receipt;
  }
}
