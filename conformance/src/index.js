import { execFileSync } from "node:child_process";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
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
  const configuredProviders = Object.fromEntries(Object.entries(repositoryConfiguration.repositories ?? {})
    .filter(([name, path]) => name.endsWith("_provider") && !["github_provider", "vercel_provider"].includes(name) && existsSync(resolve(root, path)))
    .map(([name, path]) => [`provider_${name.slice(0, -"_provider".length)}`, resolve(root, path)]));
  const additionalProviders = Object.fromEntries(Object.entries(options.providers ?? {}).map(([name, path]) => {
    if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new Error(`Invalid Provider repository key: ${name}`);
    return [`provider_${name}`, resolve(path)];
  }));
  const roots = {
    omniform: resolve(options.omniform ?? defaultRepository("omniform")),
    omniseed: resolve(options.engine ?? defaultRepository("omniseed")),
    omniseedos: resolve(options.os ?? defaultRepository("omniseedos")),
    ...(companyRepository(options.company) ? { company: companyRepository(options.company) } : {}),
    ...(providerRepository("omniseed-provider-github", options.githubProvider) ? { githubProvider: providerRepository("omniseed-provider-github", options.githubProvider) } : {}),
    ...(providerRepository("omniseed-provider-vercel", options.vercelProvider) ? { vercelProvider: providerRepository("omniseed-provider-vercel", options.vercelProvider) } : {}),
    ...configuredProviders,
    ...additionalProviders
  };
  const invariantsSource = await readFile(join(root, "constitution/invariants.yaml"), "utf8");
  const catalogue = parse(invariantsSource);
  const runner = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const compatibility = parse(await readFile(join(root, "compatibility/packages.yaml"), "utf8"));
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

  const repositoryRecords = Object.fromEntries(Object.entries(roots).map(([name, path]) => [name, repositoryRecord(path, root)]));
  const governanceRecord = repositoryRecord(root, root);
  const exactTree = governanceRecord.clean && Object.values(repositoryRecords).every(item => item.clean);
  const invariantDigest = `sha256:${createHash("sha256").update(invariantsSource).digest("hex")}`;
  const subjectState = await createSubjectState({ repositoryRecords, roots, governanceRecord, invariantDigest, exclusions: options.providerExclusions ?? repositoryConfiguration.provider_exclusions ?? [] });
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
  if (options.output !== false) {
    if (report.reportKind === "candidate" && !options.output) throw new Error("Candidate reports require an explicit candidate output path");
    const output = resolve(options.output ?? join(root, "reports/main/latest.json"));
    if (report.reportKind === "candidate" && output === canonicalMainline) throw new Error("Candidate evidence cannot overwrite canonical mainline evidence");
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  }
  return report;
}

async function readCertifiedSubjectState(path) {
  try {
    const report = JSON.parse(await readFile(path, "utf8"));
    await validateReport(report);
    if (report.reportKind !== "mainline") return null;
    const { digest, ...identity } = report.subjectState;
    if (digest !== subjectStateDigest(identity)) return null;
    return report.subjectState;
  } catch {
    return null;
  }
}

async function createSubjectState({ repositoryRecords, roots, governanceRecord, invariantDigest, exclusions }) {
  let complete = true;
  const subjects = [{ id: "governance", kind: "governance", revision: governanceRecord.commit }];
  for (const [id, record] of Object.entries(repositoryRecords)) {
    const subject = { id, kind: id.toLowerCase().includes("provider") ? "provider" : id === "company" ? "company" : "core", revision: record.commit };
    if (subject.kind === "provider") {
      const manifestPath = join(roots[id], "provider-package.json");
      try {
        const manifestSource = await readFile(manifestPath, "utf8");
        const manifest = JSON.parse(manifestSource);
        subject.providerId = manifest.id;
        subject.packageVersion = manifest.version;
        subject.packageDigest = `sha256:${createHash("sha256").update(manifestSource).digest("hex")}`;
        if (!subject.providerId || !subject.packageVersion) complete = false;
      } catch { complete = false; }
    }
    subjects.push(subject);
  }
  const includedProviderIds = new Set(subjects.filter(item => item.kind === "provider").flatMap(item => [item.id, item.providerId]));
  for (const exclusion of exclusions) if (!includedProviderIds.has(exclusion.id)) subjects.push({ id: exclusion.id, kind: "provider", status: "excluded", rationale: exclusion.rationale });
  subjects.sort((a, b) => a.id.localeCompare(b.id));
  const governedProviderSet = subjects.filter(item => item.kind === "provider").map(item => ({ id: item.id, status: item.status ?? "included", providerId: item.providerId ?? null, rationale: item.rationale ?? null }));
  const identity = { complete, invariantDigest, subjects, governedProviderSet };
  return { ...identity, digest: subjectStateDigest(identity) };
}

export function deriveFreshness(certified, observed, reportKind = "mainline", exactTree = true) {
  if (reportKind === "candidate") return "candidate";
  if (!certified || !observed || !exactTree || !certified.complete || !observed.complete || !certified.digest || !observed.digest) return "indeterminate";
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

function providerRepository(name, explicit) {
  if (explicit) return resolve(explicit);
  const configured = name === "omniseed-provider-github" ? process.env.OMNISEED_GITHUB_PROVIDER : process.env.OMNISEED_VERCEL_PROVIDER;
  if (configured) return resolve(configured);
  if (process.env.OMNISEED_PRODUCTS_ROOT) {
    const candidate = resolve(process.env.OMNISEED_PRODUCTS_ROOT, name === "omniseed-provider-github" ? "provider-github" : name);
    if (existsSync(candidate)) return candidate;
  }
  const candidate = resolve(root, "..", name);
  return existsSync(candidate) ? candidate : null;
}

function companyRepository(explicit) {
  if (explicit) return resolve(explicit);
  if (process.env.OMNISEED_COMPANY_REPOSITORY) return resolve(process.env.OMNISEED_COMPANY_REPOSITORY);
  const candidate = resolve(root, "..", "omniseed-ecosystem-company");
  return existsSync(candidate) ? candidate : null;
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
