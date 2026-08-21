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
  const requestedFreshness = options.freshness ?? (options.reportKind === "candidate" ? "candidate" : "current");
  const exactTree = governanceRecord.clean && Object.values(repositoryRecords).every(item => item.clean);
  const report = {
    ecosystemVersion: String(catalogue.version),
    generatedAt: new Date().toISOString(),
    reportKind: options.reportKind ?? "mainline",
    freshness: exactTree ? requestedFreshness : "unknown",
    governance: {
      repository: "mikeajijola/omniseed-ecosystem",
      commit: governanceRecord.commit,
      clean: governanceRecord.clean,
      constitutionVersion: String(catalogue.version),
      invariantsDigest: `sha256:${createHash("sha256").update(invariantsSource).digest("hex")}`,
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
    const canonicalMainline = resolve(join(root, "reports/main/latest.json"));
    if (report.reportKind === "candidate" && output === canonicalMainline) throw new Error("Candidate evidence cannot overwrite canonical mainline evidence");
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  }
  return report;
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
    if ([".git", ".eve", ".output", "node_modules", "coverage"].includes(entry.name)) continue;
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
