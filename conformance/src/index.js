import { execFileSync } from "node:child_process";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { parse } from "yaml";
import { ruleTests } from "./rules/index.js";

const root = resolve(new URL("../..", import.meta.url).pathname);

export async function runConformance(options = {}) {
  const roots = {
    omniform: resolve(options.omniform ?? defaultRepository("omniform")),
    omniseed: resolve(options.engine ?? defaultRepository("omniseed")),
    omniseedos: resolve(options.os ?? defaultRepository("omniseedos")),
    ...(providerRepository(options.githubProvider) ? { githubProvider: providerRepository(options.githubProvider) } : {})
  };
  const catalogue = parse(await readFile(join(root, "constitution/invariants.yaml"), "utf8"));
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

  const report = {
    ecosystemVersion: String(catalogue.version),
    generatedAt: new Date().toISOString(),
    repositories: Object.fromEntries(Object.entries(roots).map(([name, path]) => [name, repositoryRecord(path, root)])),
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
    const output = resolve(options.output ?? join(root, "reports/latest.json"));
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  }
  return report;
}

function defaultRepository(name) {
  const nested = join(root, name);
  return existsSync(nested) ? nested : resolve(root, "..", name);
}

function providerRepository(explicit) {
  if (explicit) return resolve(explicit);
  const candidate = resolve(root, "..", "omniseed-provider-github");
  return existsSync(candidate) ? candidate : null;
}

async function buildContext(roots, compatibility) {
  const repositories = {};
  for (const [name, path] of Object.entries(roots)) {
    repositories[name] = {
      name,
      path,
      manifest: JSON.parse(await readFile(join(path, "package.json"), "utf8")),
      read: file => readFile(join(path, file), "utf8"),
      files: await sourceFiles(path)
    };
  }
  return { root, repositories, compatibility };
}

async function sourceFiles(directory, base = directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if ([".git", "node_modules", "coverage"].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await sourceFiles(path, base));
    else output.push(relative(base, path));
  }
  return output.sort();
}

function repositoryRecord(path, relativeTo) {
  return {
    commit: execFileSync("git", ["-C", path, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
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
