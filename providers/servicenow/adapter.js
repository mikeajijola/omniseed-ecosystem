import { createHash } from "node:crypto";

const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const digest = value => `sha256:${createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex")}`;
const outcome = (result, reason, evidence) => ({ result, reason, evidence });

export function plan(config, operation) {
  const resource = config.resources.find(item => item.table === operation.table && item.sysId === operation.sysId);
  if (!resource || !operation.fields || !Object.keys(operation.fields).length || Object.keys(operation.fields).some(field => !resource.fields.includes(field))) return outcome("fail", "policy_failure");
  if (!config.authority.mutate) return outcome("fail", "omniseed_authority_missing");
  const exact = { providerId: "servicenow", instance: config.instance, table: operation.table, sysId: operation.sysId, expectedRevision: operation.expectedRevision, fields: operation.fields, operationId: operation.operationId };
  return { result: "pass", plan: exact, planDigest: digest(exact) };
}

export function observe(config, response, now) {
  if (!config.authority.observe) return outcome("fail", "authorization_failure");
  if (response.error) return providerFailure(response.error);
  if (response.instance !== config.instance || response.region !== config.region || response.offering !== config.residencyOffering) return outcome("fail", "selection_failure");
  if (config.complianceArtifacts.some(artifact => artifact.offering !== config.residencyOffering)) return outcome("fail", "selection_failure");
  const resource = config.resources.find(item => item.table === response.table && item.sysId === response.record?.sys_id);
  if (!resource) return outcome("fail", "policy_failure");
  const observedAt = response.observedAt;
  const freshnessMs = Date.parse(now) - Date.parse(observedAt);
  if (!response.record.sys_updated_on || !Number.isFinite(freshnessMs) || freshnessMs < 0 || freshnessMs > response.maxAgeMs) return outcome("indeterminate", "stale_evidence");
  const selected = Object.fromEntries(resource.fields.map(field => [field, response.record[field]]));
  return outcome("pass", "observed", {
    providerId: "servicenow", instance: config.instance, environment: config.environment, region: config.region, residencyOffering: config.residencyOffering, customerConfigurationDigest: config.customerConfigurationDigest,
    resource: { type: response.table, id: response.record.sys_id }, normalizedStatus: response.record.state, allowlistedFieldDigest: digest(selected),
    revision: response.record.sys_mod_count ?? response.record.sys_updated_on, authorityDigest: config.authority.identityDigest,
    requestId: response.requestId, auditReference: response.auditReference, observedAt, freshnessMs,
    relatedReferences: response.relatedReferences ?? [], complianceArtifacts: config.complianceArtifacts
  });
}

export function apply(config, approved, writeResponse, readback, now) {
  if (!approved?.plan || approved.approval?.planDigest !== digest(approved.plan)) return outcome("fail", "exact_approval_required");
  const planned = plan(config, approved.plan);
  if (planned.result !== "pass") return planned;
  if (writeResponse.error) return providerFailure(writeResponse.error);
  if (writeResponse.previousRevision !== approved.plan.expectedRevision) return outcome("fail", "record_conflict");
  const observed = observe(config, readback, now);
  if (observed.result !== "pass") return observed;
  const mismatch = Object.entries(approved.plan.fields).some(([field, value]) => readback.record[field] !== value);
  if (mismatch) return outcome("fail", "read_after_write_mismatch", observed.evidence);
  return outcome("pass", "converged", { ...observed.evidence, operationId: approved.plan.operationId, planDigest: approved.approval.planDigest, approvalId: approved.approval.id, readAfterWriteResult: "matched" });
}

export function correlate(projections) {
  const identities = projections.map(item => `${item.instance}:${item.type}:${item.id}:${item.revision}`);
  return identities.every(identity => identity === identities[0]) ? outcome("pass", "projections_agree") : outcome("fail", "multimodal_evidence_mismatch");
}

export function normalizeConnector(providerId, record) {
  return { providerId, resourceId: record.id, resourceType: record.type, status: record.status, revision: record.revision, observedAt: record.observedAt };
}

function providerFailure(error) {
  if (["invalid_oauth", "acl_denied"].includes(error)) return outcome("fail", "authorization_failure");
  if (["timeout", "unavailable", "rate_limited"].includes(error)) return outcome("indeterminate", error === "rate_limited" ? "bounded_retry_exhausted" : "provider_unavailable");
  return outcome("indeterminate", "provider_error");
}

export { digest };
