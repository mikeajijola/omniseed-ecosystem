import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { digest, makeChain, encodeChain, fixtureOperation, policyFor, verifyLineage, centralPermissionDecision, SimulatedBoundary } from './model.js';

const output = resolve(process.argv[2] ?? 'reports/authority-effect');
const engine = JSON.parse(await readFile(new URL('../../../node_modules/@omniseed/engine/package.json', import.meta.url)));
const scenarios = [];
function record(id, mode, configure = () => {}) {
  const actors = mode === 'human' ? ['owner', 'operator'] : mode === 'embodied' ? ['owner', 'agent_a', 'tool_b', 'robot'] : ['owner', 'agent_a', 'tool_b', 'executor'];
  const chain = makeChain(actors), approved = fixtureOperation(actors.at(-1));
  const boundary = new SimulatedBoundary({ embodied: mode === 'embodied' });
  const input = { chain, approved, boundary, policyOverrides: {}, options: {} };
  configure(input);
  const tokens = encodeChain(chain), policy = policyFor(chain, approved, input.policyOverrides);
  const before = structuredClone(boundary.state);
  const result = boundary.execute({ approved, tokens, policy, ...input.options });
  scenarios.push({ id, mode, chain, lineageDigest: digest(chain), approved, policy, centralPermissionDecision: centralPermissionDecision(chain, approved), independentAuthority: verifyLineage(tokens, approved, policy), trace: { before, presented: input.options.pending ?? approved, after: structuredClone(boundary.state), effectCount: boundary.effects }, result });
}
for (const mode of ['human', 'machine', 'hybrid', 'delegated', 'embodied']) record(`exact_${mode}`, mode);
record('widened_target', 'delegated', x => x.chain[2].targets.push('fixture:other'));
record('revoked_intermediate', 'delegated', x => x.policyOverrides.revoked = ['grant_1']);
record('stale_policy', 'delegated', x => x.policyOverrides.observedAt = 1);
record('changed_value', 'machine', x => x.options.pending = { ...x.approved, value: 4 });
record('version_conflict', 'machine', x => x.boundary.state.version = 2);
record('accepted_unobserved', 'machine', x => x.options.observable = false);
record('partial_effect', 'machine', x => x.options.partial = true);
record('sensor_divergence', 'embodied', x => x.boundary.state.sensorValue = 2);
record('sensor_stale', 'embodied', x => x.boundary.state.sensorAt = 1);
const report = { schemaVersion: 1, kind: 'experimental-authority-effect', governanceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), engine: { name: engine.name, version: engine.version }, simulationOnly: true, productionConformance: 'NOT_EVALUATED', scenarios };
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const cards = scenarios.map(s => `<article><h2>${escape(s.id)}</h2><p>Actor ${escape(s.approved.actor)} · ${escape(s.approved.provider)} · ${escape(s.approved.target)}</p><p>Permission gate: <b>${s.centralPermissionDecision}</b> · independent authority: <b>${s.independentAuthority.verdict}</b> · effect eval: <b>${s.result.verdict}</b></p><p>${escape(s.result.reason)} · effects ${s.trace.effectCount}</p><p>Operation <code>${s.result.operationDigest}</code><br>Lineage <code>${s.lineageDigest}</code></p>${s.mode === 'embodied' ? `<svg viewBox="0 0 340 75" role="img" aria-label="Simulated actuator position ${s.trace.after.value}; sensor ${s.trace.after.sensorValue}"><path d="M20 35H320" stroke="#8698b4"/><circle cx="${170 + s.trace.after.value * 25}" cy="35" r="10" fill="#80dfb6"/><text x="20" y="70" fill="currentColor">Actuator ${s.trace.after.value} · sensor ${s.trace.after.sensorValue} · sensor time ${s.trace.after.sensorAt}</text></svg>` : ''}<details><summary>Exact machine evidence</summary><pre>${escape(JSON.stringify(s, null, 2))}</pre></details></article>`).join('\n');
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Authority and effect experiment</title><style>body{font:16px/1.5 system-ui;background:#101a29;color:#e9eff8;margin:0 auto;padding:24px;max-width:1100px}h1{font-size:2rem}article{border:1px solid #53617a;border-radius:8px;padding:18px;margin:20px 0}code{overflow-wrap:anywhere;font-size:12px}pre{white-space:pre-wrap;overflow-wrap:anywhere}svg{max-width:420px;width:100%}a{color:#80dfb6}</style><h1>Authority and effect experiment</h1><p>Simulation only. Production conformance: <b>NOT EVALUATED</b>. Permission, delegated authority, effect and observed outcome remain separate.</p><p>Engine ${escape(engine.version)} · <a href="report.json">Machine evidence</a> · <a href="trace.jsonl">CI / effect trace</a></p>${cards}</html>`;
await mkdir(output, { recursive: true });
await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
await writeFile(`${output}/index.html`, html);
await writeFile(`${output}/trace.jsonl`, scenarios.map(s => JSON.stringify(s)).join('\n') + '\n');
console.log(`Wrote ${scenarios.length} simulation scenarios to ${output}; production NOT_EVALUATED`);
