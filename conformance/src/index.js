import { execFileSync } from "node:child_process";
import { readFile, readdir, mkdir, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { createHash } from "node:crypto";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { parse } from "yaml";
import { ruleTests } from "./rules/index.js";

const root = resolve(new URL("../..", import.meta.url).pathname);

export async function runConformance(options = {}) {
  if (Object.hasOwn(options, "freshness")) throw new Error("Freshness is derived from observed subject state and cannot be supplied");
  const repositoryConfiguration = parse(await readFile(join(root, "conformance/repositories.yaml"), "utf8"));
  const suppliedProviders = Object.fromEntries(Object.entries(options.providers ?? {}).map(([name, path]) => {
    if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new Error(`Invalid Provider repository key: ${name}`);
    return [`provider_${name}`, resolve(path)];
  }));
  const governedProviders = repositoryConfiguration.governed_providers ?? [];
  validateGovernedProviders(governedProviders, repositoryConfiguration.repositories ?? {});
  const governedIds = new Set(governedProviders.map(item => item.id));
  for (const id of Object.keys(suppliedProviders)) if (!governedIds.has(id)) throw new Error(`Provider ${id} is not in the authoritative governed Provider set`);
  const configuredProviders = Object.fromEntries(governedProviders.filter(item => item.status !== "excluded").flatMap(item => {
    const explicit = item.id === "githubProvider" ? options.githubProvider : item.id === "vercelProvider" ? options.vercelProvider : suppliedProviders[item.id];
    const configured = repositoryConfiguration.repositories[item.repository];
    const path = explicit ? resolve(explicit) : configured ? resolve(root, configured) : null;
    return path && existsSync(path) ? [[item.id, path]] : [];
  }));
  const roots = {
    omniform: resolve(options.omniform ?? defaultRepository("omniform")),
    omniseed: resolve(options.engine ?? defaultRepository("omniseed")),
    omniseedos: resolve(options.os ?? defaultRepository("omniseedos")),
    ...(companyRepository(options.company) ? { company: companyRepository(options.company) } : {}),
    ...configuredProviders,
  };
  const invariantsSource = await readFile(join(root, "constitution/invariants.yaml"), "utf8");
  const invariantDigest = `sha256:${createHash("sha256").update(invariantsSource).digest("hex")}`;
  const catalogue = parse(invariantsSource);
  const runner = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const compatibility = parse(await readFile(join(root, "compatibility/packages.yaml"), "utf8"));
  const before = await createSubjectIdentity({ repositoryRecords: recordsFor(roots), roots, governanceRecord: repositoryRecord(root, root), invariantDigest, governedProviders });
  const context = await buildContext(roots, compatibility);
  const findings = [];

  for (const invariant of catalogue.invariants) {
    if (!invariant.deterministic) {
      findings.push(finding(invariant, "not_automated", invariant.scope.join(","), "This invariant requires semantic or future behavioral review."));
      continue;
    }
    const test = ruleTests[invariant.test];
    if (!test) {
      findings.push(finding(invariant, "warning", invariant.scope.join(","), `No deterministic implementation is registered for ${invariant.test}.`));
      continue;
    }
    try {
      const result = await test(context, invariant);
      findings.push(finding(invariant, result.status ?? "passed", result.repository ?? invariant.scope.join(","), result.evidence));
    } catch (error) {
      findings.push(finding(invariant, "failed", invariant.scope.join(","), `Rule error: ${error.message}`));
    }
  }

  const repositoryRecords = recordsFor(roots);
  const governanceRecord = repositoryRecord(root, root);
  const exactTree = governanceRecord.clean && Object.values(repositoryRecords).every(item => item.clean);
  const after = await createSubjectIdentity({ repositoryRecords, roots, governanceRecord, invariantDigest, governedProviders });
  const subjectState = createSubjectState(before, after);
  const reportKind = options.reportKind ?? "mainline";
  const canonicalMainline = resolve(join(root, "reports/main/latest.json"));
  const certifiedReportPath = resolve(options.certifiedReport ?? canonicalMainline);
  const certifiedSubjectState = reportKind === "mainline" ? await readCertifiedSubjectState(certifiedReportPath) : null;
  const report = {
    ecosystemVersion: String(catalogue.version),
    generatedAt: new Date().toISOString(),
    reportKind,
    freshness: deriveFreshness(certifiedSubjectState, subjectState, reportKind, exactTree),
    subjectState,
    governance: {
      repository: "mikeajijola/omniseed-ecosystem",
      commit: governanceRecord.commit,
      clean: governanceRecord.clean,
      constitutionVersion: String(catalogue.version),
      invariantsDigest: invariantDigest,
      runnerVersion: runner.version
    },
    repositories: repositoryRecords,
    summary: {
      passed: findings.filter(item => item.status === "passed").length,
      failed: findings.filter(item => item.status === "failed").length,
      warnings: findings.filter(item => item.status === "warning").length,
      notAutomated: findings.filter(item => item.status === "not_automated").length
    },
    findings
  };
  await validateReport(report);
  if (options.requiredFreshness && report.freshness !== options.requiredFreshness) throw new Error(`Required derived freshness ${options.requiredFreshness}, observed ${report.freshness}`);
  if (options.output !== false) {
    if (report.reportKind === "candidate" && !options.output) throw new Error("Candidate reports require an explicit candidate output path");
    const output = resolve(options.output ?? join(root, "reports/main/latest.json"));
    if (report.reportKind === "candidate" && output === canonicalMainline) throw new Error("Candidate evidence cannot overwrite canonical mainline evidence");
    await mkdir(dirname(output), { recursive: true });
    const temporaryOutput = `${output}.tmp-${process.pid}`;
    await writeFile(temporaryOutput, `${JSON.stringify(report, null, 2)}\n`);
    await rename(temporaryOutput, output);
  }
  return report;
}

async function readCertifiedSubjectState(path) {
  try {
    const report = JSON.parse(await readFile(path, "utf8"));
    await validateReport(report);
    if (report.reportKind !== "mainline" || report.freshness !== "current" || !report.governance.clean || Object.values(report.repositories).some(item => !item.clean)) return null;
    const { digest, beforeDigest, afterDigest, observationStable, ...identity } = report.subjectState;
    if (digest !== subjectStateDigest(identity)) return null;
    if (afterDigest !== digest || !observationStable) return null;
    return report.subjectState;
  } catch {
    return null;
  }
}

async function createSubjectIdentity({ repositoryRecords, roots, governanceRecord, invariantDigest, governedProviders }) {
  let complete = true;
  const subjects = [{ id: "governance", kind: "governance", revision: governanceRecord.commit }];
  for (const [id, record] of Object.entries(repositoryRecords).filter(([id]) => !governedProviders.some(provider => provider.id === id))) {
    const subject = { id, kind: id.toLowerCase().includes("provider") ? "provider" : id === "company" ? "company" : "core", revision: record.commit };
    subjects.push(subject);
  }
  for (const provider of governedProviders) {
    if (provider.status === "excluded") {
      subjects.push({ id: provider.id, kind: "provider", providerId: provider.provider_id, status: "excluded", rationale: provider.rationale });
      continue;
    }
    const record = repositoryRecords[provider.id];
    const subject = { id: provider.id, kind: "provider", providerId: provider.provider_id, expectedRevision: provider.revision };
    if (!record) {
      complete = false;
      subject.status = "unavailable";
      subject.rationale = "The governed Provider repository was not supplied for observation.";
    }
    else {
      subject.revision = record.commit;
      if (record.commit !== provider.revision) complete = false;
      const manifestPath = join(roots[provider.id], "provider-package.json");
      try {
        const manifestSource = await readFile(manifestPath, "utf8");
        const manifest = JSON.parse(manifestSource);
        subject.providerId = manifest.id;
        subject.packageVersion = manifest.version;
        subject.packageDigest = `sha256:${createHash("sha256").update(manifestSource).digest("hex")}`;
        if (!subject.providerId || !subject.packageVersion) complete = false;
        if (manifest.id !== provider.provider_id) complete = false;
      } catch { complete = false; }
    }
    subjects.push(subject);
  }
  subjects.sort((a, b) => a.id.localeCompare(b.id));
  const governedProviderSet = subjects.filter(item => item.kind === "provider").map(item => ({ id: item.id, status: item.status === "excluded" ? "excluded" : "included", providerId: item.providerId ?? null, revision: item.expectedRevision ?? null, rationale: item.status === "excluded" ? item.rationale : null }));
  const identity = { complete, invariantDigest, subjects, governedProviderSet };
  return { ...identity, digest: subjectStateDigest(identity) };
}

function createSubjectState(before, after) {
  return { ...after, beforeDigest: before.digest, afterDigest: after.digest, observationStable: before.digest === after.digest };
}

export function deriveFreshness(certified, observed, reportKind = "mainline", exactTree = true) {
  if (reportKind === "candidate") return "candidate";
  if (!certified || !observed || !exactTree || !certified.complete || !observed.complete || observed.observationStable === false || !certified.digest || !observed.digest) return "indeterminate";
  return certified.digest === observed.digest ? "current" : "stale";
}

export function subjectStateDigest(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function defaultRepository(name) {
  const configuredRoot = process.env.OMNISEED_PRODUCTS_ROOT;
  if (configuredRoot) return resolve(configuredRoot, name);
  const nested = join(root, name);
  return existsSync(nested) ? nested : resolve(root, "..", name);
}

function companyRepository(explicit) {
  if (explicit) return resolve(explicit);
  if (process.env.OMNISEED_COMPANY_REPOSITORY) return resolve(process.env.OMNISEED_COMPANY_REPOSITORY);
  const candidate = resolve(root, "..", "omniseed-ecosystem-company");
  return existsSync(candidate) ? candidate : null;
}

function recordsFor(roots) {
  return Object.fromEntries(Object.entries(roots).map(([name, path]) => [name, repositoryRecord(path, root)]));
}

function validateGovernedProviders(providers, repositories) {
  const ids = new Set();
  for (const provider of providers) {
    if (!provider.id || ids.has(provider.id)) throw new Error(`Invalid or duplicate governed Provider id: ${provider.id}`);
    ids.add(provider.id);
    if (!provider.provider_id || !provider.repository || !repositories[provider.repository]) throw new Error(`Governed Provider ${provider.id} has no authoritative repository`);
    if (provider.status === "excluded") {
      if (!provider.rationale || provider.revision) throw new Error(`Excluded Provider ${provider.id} requires rationale and no revision`);
    } else if (!/^[0-9a-f]{40}$/.test(provider.revision ?? "")) throw new Error(`Included Provider ${provider.id} requires an exact revision`);
  }
}

async function buildContext(roots, compatibility) {
  const repositories = {};
  for (const [name, path] of Object.entries(roots)) {
    repositories[name] = {
      name,
      path,
      manifest: existsSync(join(path, "package.json")) ? JSON.parse(await readFile(join(path, "package.json"), "utf8")) : null,
      read: file => readFile(join(path, file), "utf8"),
      files: await sourceFiles(path)
    };
  }
  return { root, repositories, compatibility };
}

async function sourceFiles(directory, base = directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if ([".git", ".eve", ".output", ".vercel", "node_modules", "coverage"].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await sourceFiles(path, base));
    else output.push(relative(base, path));
  }
  return output.sort();
}

function repositoryRecord(path, relativeTo) {
  return {
    commit: execFileSync("git", ["-C", path, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    clean: execFileSync("git", ["-C", path, "status", "--porcelain"], { encoding: "utf8" }).trim() === "",
    path: relative(relativeTo, path) || "."
  };
}

function finding(invariant, status, repository, evidence) {
  return { invariant: invariant.id, status, severity: invariant.severity, repository, evidence, test: invariant.test };
}

async function validateReport(report) {
  const schema = JSON.parse(await readFile(join(root, "conformance/schemas/conformance-report.schema.json"), "utf8"));
  const ajv = new Ajv2020({ allErrors: true });
  addFormats(ajv);
  if (!ajv.validate(schema, report)) throw new Error(`Generated report is invalid: ${ajv.errorsText(ajv.errors)}`);
}
