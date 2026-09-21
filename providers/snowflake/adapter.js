import { createHash } from "node:crypto";
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export const digest = value => `sha256:${createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex")}`;
const result = (outcome, reason, evidence) => ({ result: outcome, reason, evidence });
const identity = object => `${object.database}.${object.schema}.${object.name}`;

export function plan(config, operation) {
  const object = config.objects.find(item => identity(item) === operation.objectId);
  if (!object || !operation.expectedRevision || !operation.change) return result("fail", "policy_failure");
  if (!config.authority.mutate || config.environment === "production") return result("fail", "authorization_failure");
  const exact = { providerId: "snowflake", account: config.account, cloud: config.cloud, region: config.region, objectId: operation.objectId, expectedRevision: operation.expectedRevision, change: operation.change, operationId: operation.operationId };
  return { result: "pass", plan: exact, planDigest: digest(exact) };
}

export function observe(config, response, now) {
  if (!config.authority.observe) return result("fail", "authorization_failure");
  if (response.error) return failure(response.error);
  if (response.account !== config.account || response.cloud !== config.cloud || response.region !== config.region || response.edition !== config.edition) return result("fail", "selection_failure");
  if (config.complianceArtifacts.some(item => item.cloud !== config.cloud || item.region !== config.region || item.edition !== config.edition)) return result("fail", "compliance_scope_failure");
  const object = config.objects.find(item => identity(item) === response.objectId);
  if (!object) return result("fail", "policy_failure");
  const freshnessMs = Date.parse(now) - Date.parse(response.observedAt);
  if (!response.accessHistoryId || !Number.isFinite(freshnessMs) || freshnessMs < 0 || freshnessMs > response.maxAgeMs) return result("indeterminate", "stale_audit_evidence");
  if (response.creditsUsed > config.creditLimit) return result("fail", "cost_guardrail_exceeded");
  return result("pass", "observed", { providerId: "snowflake", account: config.account, cloud: config.cloud, region: config.region, edition: config.edition, object: { id: response.objectId, type: object.type }, revision: response.revision, configurationDigest: response.configurationDigest, resultDigest: response.resultDigest, queryId: response.queryId, accessHistoryId: response.accessHistoryId, authorityDigest: config.authority.identityDigest, role: config.authority.role, creditsUsed: response.creditsUsed, observedAt: response.observedAt, freshnessMs, complianceArtifacts: config.complianceArtifacts });
}

export function invoke(config, request, response, now) {
  if (!config.authority.query) return result("fail", "authorization_failure");
  if (request.limit < 1 || request.limit > 1000 || !config.objects.some(item => identity(item) === request.objectId)) return result("fail", "policy_failure");
  return observe(config, response, now);
}

export function apply(config, approved, write, readback, now) {
  if (!approved?.plan || approved.approval?.planDigest !== digest(approved.plan)) return result("fail", "exact_approval_required");
  const proposed = plan(config, approved.plan); if (proposed.result !== "pass") return proposed;
  if (write.error) return failure(write.error);
  if (write.previousRevision !== approved.plan.expectedRevision) return result("fail", "concurrent_change");
  const observed = observe(config, readback, now); if (observed.result !== "pass") return observed;
  if (readback.changeDigest !== digest(approved.plan.change)) return result("fail", "read_after_write_mismatch", observed.evidence);
  return result("pass", "converged", { ...observed.evidence, operationId: approved.plan.operationId, planDigest: approved.approval.planDigest, approvalId: approved.approval.id, readAfterWriteResult: "matched" });
}

export function correlate(projections) { const keys = projections.map(item => `${item.account}:${item.objectId}:${item.revision}:${item.resultDigest}`); return keys.every(key => key === keys[0]) ? result("pass", "projections_agree") : result("fail", "multimodal_evidence_mismatch"); }
export function normalizeMemory(providerId, value) { return { providerId, resourceId: value.resourceId, schemaDigest: value.schemaDigest, resultDigest: value.resultDigest, revision: value.revision, observedAt: value.observedAt }; }
function failure(error) { if (["invalid_identity", "insufficient_role"].includes(error)) return result("fail", "authorization_failure"); if (["wrong_region", "wrong_account"].includes(error)) return result("fail", "selection_failure"); if (["warehouse_suspended", "timeout", "unavailable", "rate_limited"].includes(error)) return result("indeterminate", "provider_unavailable"); return result("indeterminate", "provider_error"); }
