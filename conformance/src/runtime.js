import semver from "semver";

export function evaluateRuntimeCompatibility({ manifest, lockfile, runtimeVersion, revision }) {
  const packages = lockfile?.packages ?? {};
  const root = packages[""] ?? manifest;
  const queue = Object.keys(root.dependencies ?? {}).map(name => resolveDependency(packages, "", name));
  const visited = new Set();
  const governed = [];
  const errors = [];

  while (queue.length) {
    const path = queue.shift();
    if (!path || visited.has(path)) continue;
    visited.add(path);
    const entry = packages[path];
    if (!entry) continue;
    if (entry.engines?.node) governed.push(packageRuntime(path, entry));
    for (const name of Object.keys(entry.dependencies ?? {})) queue.push(resolveDependency(packages, path, name));
  }

  const rootRange = manifest?.engines?.node;
  const runner = semver.coerce(runtimeVersion)?.version ?? null;
  if (!rootRange || !semver.validRange(rootRange)) errors.push("OmniSeed OS has no valid engines.node range.");
  if (!runner) errors.push(`Conformance runner version is invalid: ${runtimeVersion}`);
  for (const dependency of governed) {
    if (!semver.validRange(dependency.range)) errors.push(`${dependency.name} has invalid engines.node range ${dependency.range}.`);
    else if (rootRange && semver.validRange(rootRange) && !semver.subset(rootRange, dependency.range)) errors.push(`OS range ${rootRange} advertises versions outside ${dependency.name} ${dependency.range}.`);
  }
  const subjects = [packageRuntime("", { ...manifest, version: manifest.version }), ...governed];
  if (runner) for (const subject of subjects) {
    if (subject.range && semver.validRange(subject.range) && !semver.satisfies(runner, subject.range)) errors.push(`Runner Node ${runner} is outside ${subject.name} ${subject.range}.`);
  }
  const effectiveRange = rootRange && semver.validRange(rootRange) && !errors.some(message => message.includes("advertises versions outside")) ? rootRange : null;
  return {
    status: errors.length ? "failed" : "passed",
    runner: { version: runner ?? String(runtimeVersion) },
    root: { repository: "omniseedos", revision, package: manifest.name, version: manifest.version, range: rootRange ?? null },
    effectiveRange,
    packages: subjects,
    errors
  };
}

function packageRuntime(path, entry) {
  return {
    name: path ? path.slice(path.lastIndexOf("node_modules/") + 13) : entry.name,
    version: entry.version ?? "source",
    range: entry.engines?.node ?? null,
    path: path || "."
  };
}

function resolveDependency(packages, fromPath, name) {
  let directory = fromPath;
  while (true) {
    const candidate = directory ? `${directory}/node_modules/${name}` : `node_modules/${name}`;
    if (packages[candidate]) return candidate;
    const marker = directory.lastIndexOf("/node_modules/");
    if (marker >= 0) directory = directory.slice(0, marker);
    else if (directory) directory = "";
    else return null;
  }
}
