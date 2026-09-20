import { execFileSync } from "node:child_process";

// The governed catalogue owns membership. Branches are observed, never inferred
// from a checkout's (potentially historical) HEAD or origin/HEAD cache.
export function resolveAuthority(authority, run = execFileSync) {
  if (!/^https:\/\/github\.com\/mikeajijola\/[a-z0-9-]+\.git$/.test(authority?.url ?? "") ||
      !/^refs\/heads\/[a-zA-Z0-9._/-]+$/.test(authority?.ref ?? "")) {
    throw new Error("Invalid governed repository authority");
  }
  const output = run("git", ["ls-remote", "--exit-code", authority.url, authority.ref], {
    encoding: "utf8", timeout: 30000, stdio: ["ignore", "pipe", "pipe"]
  }).trim().split("\n");
  if (output.length !== 1) throw new Error("Ambiguous governed revision");
  const [revision, ref] = output[0].split(/\s+/);
  if (!/^[a-f0-9]{40}$/.test(revision) || ref !== authority.ref) throw new Error("Unresolved governed revision");
  return revision;
}

export function observeAuthorities(authorities, resolveRevision = resolveAuthority) {
  return Object.fromEntries(Object.entries(authorities).map(([id, authority]) => {
    try { return [id, { ...authority, revision: resolveRevision(authority) }]; }
    catch { return [id, { ...authority, status: "unavailable" }]; }
  }));
}

export function compareAuthorities(subjects, before, after) {
  if (!before || !after) return "indeterminate";
  const required = subjects.filter(item => item.status !== "excluded");
  if (required.some(item => !before[item.id]?.revision || !after[item.id]?.revision)) return "indeterminate";
  if (required.some(item => before[item.id].revision !== after[item.id].revision ||
      item.revision !== after[item.id].revision)) return "stale";
  if (Object.keys(before).sort().join() !== Object.keys(after).sort().join() ||
      Object.keys(after).sort().join() !== required.map(item => item.id).sort().join()) return "indeterminate";
  return "current";
}
