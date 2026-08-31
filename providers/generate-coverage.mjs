#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { parse } from "yaml";

export const primitiveFamilies = ["agents", "inference", "skills", "connectors", "workflows", "schedules", "policies", "observations", "memory", "identity", "machines"];

export async function providerCoverage({ providerPaths = [], companyPath = null }) {
  const providers = [];
  for (const path of providerPaths) {
    const manifest = JSON.parse(await readFile(resolve(path, "provider-package.json"), "utf8"));
    providers.push({ id: manifest.id, organisation: manifest.organisation, packageVersion: manifest.version, protocol: manifest.engineCompatibility, claims: manifest.implementations.map(item => ({ family: item.family, products: item.products, conformance: "manifest_valid", liveAcceptanceEvidence: false })) });
  }
  providers.sort((a, b) => a.id.localeCompare(b.id));
  const selected = [];
  if (companyPath) {
    const company = parse(await readFile(resolve(companyPath, "omniform.yaml"), "utf8"));
    for (const [family, choice] of Object.entries(company.spec.providers ?? {})) selected.push({ family, providerId: choice.provider, source: "family_default" });
    for (const [family, resources] of Object.entries(company.spec.resources ?? {})) for (const resource of resources) if (resource.provider) selected.push({ family, providerId: resource.provider, resourceId: resource.id, source: "resource_override" });
  }
  const claim = new Set(providers.flatMap(provider => provider.claims.map(item => `${provider.id}:${item.family}`)));
  const gaps = selected.filter(item => !claim.has(`${item.providerId}:${item.family}`)).map(item => ({ ...item, status: "no_compatible_implementation_claim" }));
  return { coverageVersion: "1", scope: "ecosystem_claims_not_runtime_health", primitiveFamilies, providers, selected, gaps };
}

export function coverageMarkdown(report) {
  const heading = `# Provider coverage\n\nEcosystem claims only. This report does not assert installation, configuration, connection, or runtime health.\n\n`;
  const table = `| Provider | ${primitiveFamilies.join(" | ")} | Protocol |\n| --- | ${primitiveFamilies.map(() => "---").join(" | ")} | --- |\n${report.providers.map(provider => `| ${provider.organisation} (\`${provider.id}\`) | ${primitiveFamilies.map(family => provider.claims.some(item => item.family === family) ? "claim" : "—").join(" | ")} | ${provider.protocol} |`).join("\n")}\n`;
  const gaps = `\n## Selected-family gaps\n\n${report.gaps.length ? report.gaps.map(item => `- \`${item.providerId}\` / \`${item.family}\`${item.resourceId ? ` for \`${item.resourceId}\`` : ""}: ${item.status}`).join("\n") : "No selected-family gaps were found among the supplied manifests."}\n`;
  return heading + table + gaps;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const values = flagValues(process.argv.slice(2));
  const report = await providerCoverage({ providerPaths: values.provider ?? [], companyPath: values.company?.[0] });
  const jsonPath = resolve(values.output?.[0] ?? "reports/providers/coverage.json"), markdownPath = resolve(values.markdown?.[0] ?? "reports/providers/coverage.md");
  await mkdir(dirname(jsonPath), { recursive: true }); await mkdir(dirname(markdownPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`); await writeFile(markdownPath, coverageMarkdown(report));
  console.log(JSON.stringify({ providers: report.providers.length, selections: report.selected.length, gaps: report.gaps.length }));
  if (values["fail-on-gap"] && report.gaps.length) process.exitCode = 1;
}

function flagValues(args) {
  const output = {};
  for (let i = 0; i < args.length; i += 1) { const key = args[i].replace(/^--/, ""); if (key === "fail-on-gap") { output[key] = ["true"]; continue; } (output[key] ??= []).push(args[++i]); }
  return output;
}
