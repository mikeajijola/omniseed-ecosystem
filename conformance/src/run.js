#!/usr/bin/env node
import { runConformance } from "./index.js";

const args = process.argv.slice(2);
const options = {};
for (let index = 0; index < args.length; index += 1) {
  const name = args[index];
  if (!["--omniform", "--engine", "--os", "--company", "--github-provider", "--vercel-provider", "--output", "--fail-on"].includes(name)) usage(`Unknown option: ${name}`);
  const value = args[index + 1];
  if (!value || value.startsWith("--")) usage(`Missing value for ${name}`);
  options[name.slice(2).replace("fail-on", "failOn").replace("github-provider", "githubProvider").replace("vercel-provider", "vercelProvider")] = value;
  index += 1;
}

try {
  const report = await runConformance(options);
  console.log(JSON.stringify(report.summary));
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
  console.error("Usage: omniseed-conformance [--omniform path] [--engine path] [--os path] [--company path] [--github-provider path] [--vercel-provider path] [--output path] [--fail-on failed|warning]");
  process.exit(2);
}
