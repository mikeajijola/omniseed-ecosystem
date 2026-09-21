#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse } from "yaml";
import { resolveAuthority } from "./authority.js";

const root = resolve(new URL("../..", import.meta.url).pathname);
const configuration = parse(await readFile(resolve(root, "conformance/repositories.yaml"), "utf8"));
const paths = { omniform: "../omniform", omniseed: "../omniseed", omniseedos: "../omniseedos", company: configuration.repositories.ecosystem_company };
for (const provider of configuration.governed_providers) {
  if (provider.status !== "excluded") paths[provider.id] = configuration.repositories[provider.repository];
}
for (const [id, path] of Object.entries(paths)) {
  const authority = configuration.authorities[id];
  const revision = resolveAuthority(authority);
  const target = resolve(root, path);
  execFileSync("git", ["clone", "--no-checkout", "--depth", "1", "--branch", authority.ref.slice("refs/heads/".length), authority.url, target], { stdio: "inherit" });
  execFileSync("git", ["-C", target, "fetch", "--depth", "1", "origin", revision], { stdio: "inherit" });
  execFileSync("git", ["-C", target, "checkout", "--detach", revision], { stdio: "inherit" });
  console.log(`${id}: ${revision}`);
}
