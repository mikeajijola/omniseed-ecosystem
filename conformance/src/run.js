#!/usr/bin/env node
import { runConformance } from "./index.js";

const args = process.argv.slice(2);
const options = { providers: {} };
for (let index = 0; index < args.length; index += 1) {
  const name = args[index];
  if (!["--omniform", "--engine", "--os", "--company", "--github-provider", "--vercel-provider", "--provider", "--output", "--certified-report", "--fail-on", "--report-kind", "--freshness"].includes(name)) usage(`Unknown option: ${name}`);
  const value = args[index + 1];
  if (!value || value.startsWith("--")) usage(`Missing value for ${name}`);
  if (name === "--freshness") {
    if (value !== "current") usage("--freshness is deprecated; only 'current' is accepted and it is verified rather than asserted");
  } else if (name === "--provider") {
    const separator = value.indexOf("=");
    if (separator < 1 || separator === value.length - 1) usage("--provider requires name=path");
    options.providers[value.slice(0, separator)] = value.slice(separator + 1);
  } else options[name.slice(2).replace("fail-on", "failOn").replace("github-provider", "githubProvider").replace("vercel-provider", "vercelProvider").replace("report-kind", "reportKind").replace("certified-report", "certifiedReport")] = value;
  index += 1;
}

try {
  const report = await runConformance(options);
  console.log(JSON.stringify({ ...report.summary, reportKind: report.reportKind, freshness: report.freshness, subjectStateDigest: report.subjectState.digest }));
  report.findings.filter(item => item.status !== "passed").forEach(item => {
    console.log(`${item.status.toUpperCase()} ${item.invariant} (${item.repository}): ${item.evidence}`);
  });
  const threshold = options.failOn ?? "failed";
  if (report.summary.failed || (threshold === "warning" && report.summary.warnings)) process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 2;
}

function usage(message) {
  console.error(message);
  console.error("Usage: omniseed-conformance [--omniform path] [--engine path] [--os path] [--company path] [--github-provider path] [--vercel-provider path] [--provider name=path] [--output path] [--certified-report path] [--report-kind mainline|candidate] [--fail-on failed|warning]");
  process.exit(2);
}
