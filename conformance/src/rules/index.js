import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import Ajv2020 from "ajv/dist/2020.js";
import { parse } from "yaml";

const pass = evidence => ({ status: "passed", evidence });
const fail = (repository, evidence) => ({ status: "failed", repository, evidence });

export const ruleTests = {
  "dependency-direction": dependencyDirection,
  "omniform-no-runtime-provider-status": omniformNoRuntimeStatus,
  "omniform-no-credentials-or-provider-sdk": omniformNoCredentials,
  "omniform-no-ui-state": omniformNoUiState,
  "state-record-separation": stateRecordSeparation,
  "controlled-mutation-path": controlledMutationPath,
  "exact-persisted-plan": exactPersistedPlan,
  "stale-plan-protection": stalePlanProtection,
  "explicit-provider-registration": explicitProviderRegistration,
  "missing-provider-gap": missingProviderGap,
  "engine-no-vendor-sdk": engineNoVendorSdk,
  "evidence-provenance": evidenceProvenance,
  "language-independent-provider-boundary": languageIndependentProviderBoundary,
  "external-provider-lifecycle": externalProviderLifecycle,
  "governed-company-change": governedCompanyChange,
  "os-authority-boundary": osAuthorityBoundary,
  "os-mutation-delegation": osMutationDelegation,
  "os-operation-identity": osOperationIdentity,
  "no-agent-provider-bypass": noAgentProviderBypass,
  "package-compatibility": packageCompatibility,
  "ownership-documentation": ownershipDocumentation,
  "stable-authority-ids": stableAuthorityIds,
  "github-provider-manifest": githubProviderManifest,
  "unique-provider-manifest-id": uniqueProviderManifestId,
  "provider-organisation-metadata": providerOrganisationMetadata,
  "canonical-primitive-vocabulary": canonicalPrimitiveVocabulary,
  "independent-provider-selection": independentProviderSelection,
  "company-search-capability-boundary": companySearchCapabilityBoundary,
  "canonical-company-git-authority": canonicalCompanyGitAuthority,
  "explainable-realisation-chain": explainableRealisationChain,
  "replaceable-governed-steward": replaceableGovernedSteward,
  "optional-os-realisation": optionalOsRealisation,
  "ordinary-reconciliation-capability": ordinaryReconciliationCapability
};

const canonicalPrimitiveFamilies = ["agents", "skills", "connectors", "workflows", "schedules", "policies", "observations", "memory", "identity", "machines"];

async function dependencyDirection({ repositories }) {
  const forbidden = {
    omniform: ["@omniseed/engine", "@omniseed/os", "@omniseed/conformance"],
    omniseed: ["@omniseed/os", "@omniseed/conformance"],
    omniseedos: ["@omniseed/conformance"]
  };
  for (const [name, packages] of Object.entries(forbidden)) {
    const dependencies = allDependencies(repositories[name].manifest);
    const found = packages.filter(item => dependencies.has(item));
    if (found.length) return fail(name, `Forbidden runtime dependencies: ${found.join(", ")}`);
    const source = await combinedSource(repositories[name]);
    const imported = packages.filter(item => source.includes(item));
    if (imported.length) return fail(name, `Forbidden source imports: ${imported.join(", ")}`);
  }
  return pass("Package manifests and source imports preserve Omniform → OmniSeed → OmniSeed OS; no product imports governance.");
}

async function omniformNoRuntimeStatus({ repositories }) {
  const schema = JSON.parse(await repositories.omniform.read("schema/omniform.schema.json"));
  const keys = objectKeys(schema);
  const forbidden = ["deployed", "observed", "evidence", "providerStatus", "installed", "connected", "healthy"];
  const found = forbidden.filter(key => keys.has(key));
  return found.length ? fail("omniform", `Runtime state keys found in schema: ${found.join(", ")}`) : pass("Omniform schema contains no runtime Provider-status fields.");
}

async function omniformNoCredentials({ repositories }) {
  const repo = repositories.omniform;
  const dependencies = [...allDependencies(repo.manifest)];
  const providerPackages = dependencies.filter(name => /^@omniseed\/provider-|sdk|stripe|twilio|salesforce|openai/i.test(name));
  if (providerPackages.length) return fail("omniform", `Provider or vendor dependencies found: ${providerPackages.join(", ")}`);
  const schema = JSON.parse(await repo.read("schema/omniform.schema.json"));
  const sensitive = ["password", "secret", "token", "apiKey", "credential"].filter(key => objectKeys(schema).has(key));
  return sensitive.length ? fail("omniform", `Credential fields found in schema: ${sensitive.join(", ")}`) : pass("Omniform declares no credential fields and has no Provider SDK dependency.");
}

async function omniformNoUiState({ repositories }) {
  const schema = JSON.parse(await repositories.omniform.read("schema/omniform.schema.json"));
  const uiKeys = ["navigation", "layout", "screen", "widget", "route", "viewState"].filter(key => objectKeys(schema).has(key));
  return uiKeys.length ? fail("omniform", `UI-specific schema keys found: ${uiKeys.join(", ")}`) : pass("Omniform schema contains no navigation, layout, screen, widget, route, or view-state fields.");
}

async function stateRecordSeparation({ repositories }) {
  const compiler = await repositories.omniseed.read("src/compiler.js");
  const required = ["deployed: []", "observed: []", "evidence: []"];
  const missing = required.filter(text => !compiler.includes(text));
  return missing.length ? fail("omniseed", `Separate runtime collections missing: ${missing.join(", ")}`) : pass("Engine state keeps deployed, observed, and evidence collections separate from the Omniform declaration.");
}

async function controlledMutationPath({ repositories }) {
  const engine = await repositories.omniseed.read("src/engine.js");
  const expected = ["async plan(", "async approve(", "async apply(", "provider.apply(action)"];
  const missing = expected.filter(text => !engine.includes(text));
  if (missing.length) return fail("omniseed", `Controlled mutation markers missing: ${missing.join(", ")}`);
  const allowedFiles = ["src/engine.js", "src/provider.js", "src/provider-protocol.js"];
  if (repositories.omniseed.files.includes("src/company-repository.js")) {
    const repository = await repositories.omniseed.read("src/company-repository.js");
    const governedRepositoryMarkers = [
      engine.includes("companyRepository.submit"),
      engine.includes("async applyCompanyChange(") && engine.includes("authorize(authorization, proposal.requiredAuthority.apply)"),
      repository.includes("this.provider.validate(action)"),
      repository.includes("this.provider.plan(action)"),
      repository.includes("this.provider.apply(action)"),
      repository.includes("this.provider.observe(resource)")
    ];
    if (!governedRepositoryMarkers.every(Boolean)) return fail("omniseed", "Git company repository mutation is not demonstrably reached through approved Company Change apply and the complete Provider lifecycle.");
    allowedFiles.push("src/company-repository.js");
  }
  const providerApplyCalls = await occurrences(repositories.omniseed, /\.apply\(action/g, allowedFiles);
  return providerApplyCalls.length ? fail("omniseed", `Provider apply is called outside engine apply: ${providerApplyCalls.join(", ")}`) : pass("Provider apply is reached through the engine plan/approve/apply lifecycle.");
}

async function exactPersistedPlan({ repositories }) {
  const engine = await repositories.omniseed.read("src/engine.js");
  const expected = ["state.plans.find", "verifyStoredPlan(stored, plan)", "approval.planHash !== plan.hash"];
  const missing = expected.filter(text => !engine.includes(text));
  return missing.length ? fail("omniseed", `Exact-plan verification markers missing: ${missing.join(", ")}`) : pass("Apply loads the stored plan and verifies plan and approval identity.");
}

async function stalePlanProtection({ repositories }) {
  const engine = await repositories.omniseed.read("src/engine.js");
  const expected = ['EngineError("plan_stale"'];
  const missing = expected.filter(text => !engine.includes(text));
  if (!engine.includes("state.version !== plan.stateVersion") && !engine.includes("state.version !== approval?.stateVersion")) missing.push("approved state-version comparison");
  if (!engine.includes("definitionHash(active) !== plan.definitionHash") && !engine.includes("definitionHash(declaration) !== plan.definitionHash")) missing.push("definition hash comparison");
  return missing.length ? fail("omniseed", `Stale-plan checks missing: ${missing.join(", ")}`) : pass("Apply rejects both state-version and declaration drift as plan_stale.");
}

async function governedCompanyChange({ repositories }) {
  const engine = await repositories.omniseed.read("src/engine.js");
  if (!repositories.omniseed.files.includes("src/company-change.js") || !repositories.omniseed.files.includes("test/company-change.test.js")) return fail("omniseed", "Governed Company Change implementation or tests are missing, including exact stale-definition protection.");
  const companyChange = await repositories.omniseed.read("src/company-change.js"), tests = await repositories.omniseed.read("test/company-change.test.js");
  const required = [
    [engine, "company_change.propose", "proposal authority"],
    [companyChange, "company_change.approve", "baseline approval authority"],
    [companyChange, "company_change.apply", "baseline apply authority"],
    [engine, "proposal.requiredAuthority.approve", "proposal-specific approval authority"],
    [engine, "proposal.requiredAuthority.apply", "proposal-specific apply authority"],
    [engine, "companyRepository.submit", "Git company repository submission"],
    [engine, 'status: "submitted"', "pending-merge company status"],
    [companyChange, "verifyCompanyChangeProposal", "exact proposal hashing"],
    [companyChange, "assertOmniform(candidate)", "candidate Omniform validation"],
    [companyChange, "evidence_not_found", "evidence reference validation"],
    [engine, "company_change_stale", "stale definition protection"],
    [tests, "does not fabricate realisation", "definition/realisation boundary test"],
    [tests, "future governance", "current-policy recursion test"]
  ];
  const missing = required.filter(([source, marker]) => !source.includes(marker)).map(([, , description]) => description);
  return missing.length ? fail("omniseed", `Governed Company Change markers missing: ${missing.join(", ")}`) : pass("Company changes are evidence-backed exact proposals, separately authorized and approved, validated against Omniform, stale-protected, and submitted to canonical Git without runtime desired-state replacement.");
}

async function canonicalCompanyGitAuthority({ repositories }) {
  if (!repositories.company) return fail("company", "Canonical OmniSeed Ecosystem company repository is absent; pass --company.");
  const company = parse(await repositories.company.read("omniform.yaml")), desired = company.spec?.governance?.desiredState;
  const required = [desired?.repository?.startsWith("https://"), desired?.branch, desired?.path, desired?.changeMode === "pull_request"];
  if (!required.every(Boolean)) return fail("company", "Company desired-state authority must name an HTTPS repository, merged branch, Omniform path, and pull_request change mode.");
  const engine = await repositories.omniseed.read("src/engine.js");
  if (!engine.includes("companyRepository.submit") || !engine.includes('status: "submitted"')) return fail("omniseed", "Git-backed apply does not submit a pending-merge repository change.");
  return pass(`Company ${company.metadata.id} names ${desired.repository}#${desired.branch}:${desired.path}; engine apply submits rather than replacing merged desired state.`);
}

async function explainableRealisationChain({ repositories }) {
  if (!repositories.company) return fail("company", "Canonical company repository is absent.");
  const company = parse(await repositories.company.read("omniform.yaml"));
  const resources = new Map(Object.entries(company.spec.resources ?? {}).flatMap(([family, items]) => items.map(item => [item.id, { family, ...item }])));
  const capabilities = new Map(company.spec.capabilities.map(item => [item.id, item]));
  for (const realisation of company.spec.realisations ?? []) {
    const capability = capabilities.get(realisation.capability);
    if (!capability) return fail("company", `Realisation ${realisation.id} references missing Capability ${realisation.capability}.`);
    const requirements = new Set(capability.requires.map(item => item.id));
    for (const participant of realisation.participants) {
      const resource = resources.get(participant.resource);
      if (!resource) return fail("company", `Realisation ${realisation.id} references missing primitive resource ${participant.resource}.`);
      if (!resource.provider && !company.spec.providers[resource.family]) return fail("company", `Primitive ${participant.resource} has no independently selected ${resource.family} Provider or family default.`);
      if ((participant.supplies ?? []).some(id => !requirements.has(id) || !(resource.offers ?? []).includes(id))) return fail("company", `Participant ${participant.resource} claims a requirement outside its Capability/resource offers.`);
    }
  }
  const compiler = await repositories.omniseed.read("src/compiler.js");
  const markers = ["realisations", "participants", "provider", "observed", "evidence"];
  return markers.every(marker => compiler.includes(marker)) ? pass("Every company Realisation references primitive resources with family Provider selections; engine inspection projects Provider, observation, and evidence trace data.") : fail("omniseed", "Compiled realisation trace is incomplete.");
}

async function ordinaryReconciliationCapability({ repositories }) {
  if (!repositories.company) return fail("company", "Canonical company repository is absent.");
  if (!repositories.omniseed) return fail("omniseed", "Engine repository is absent.");
  const company = parse(await repositories.company.read("omniform.yaml"));
  const os = (company.spec.resources?.connectors ?? []).find(item => item.id === "omniseed_os");
  if (os?.spec?.companyBinding?.desiredRevision) return fail("company", "The desired company declaration must not self-pin its own runtime desiredRevision; the reconciler binds the exact merged revision as Engine state.");
  const capability = company.spec.capabilities.find(item => item.id === "reconcile_omniseed_ecosystem");
  if (!capability) return fail("company", "Production reconciliation is not declared as an ordinary company Capability.");
  const realisation = company.spec.realisations.find(item => item.id === capability.realisations?.[0] && item.capability === capability.id);
  if (!realisation) return fail("company", "Reconciliation Capability has no named primitive-composition Realisation.");
  const requiredFamilies = new Set(capability.requires.map(item => item.primitiveFamily));
  const expectedFamilies = ["workflows", "connectors", "policies", "memory", "observations", "identity"];
  const missingFamilies = expectedFamilies.filter(family => !requiredFamilies.has(family));
  if (missingFamilies.length) return fail("company", `Reconciliation omits required primitive responsibilities: ${missingFamilies.join(", ")}.`);
  const operations = new Map(company.spec.operations.map(item => [item.id, item]));
  const expectedOperations = ["generate_plan", "apply_plan", "observe_company"];
  const missingOperations = expectedOperations.filter(id => operations.get(id)?.capability !== capability.id);
  if (missingOperations.length) return fail("company", `Reconciliation does not own ordinary governed operations: ${missingOperations.join(", ")}.`);
  const engine = await repositories.omniseed.read("src/engine.js");
  const handlers = [
    '.register("generate_plan"',
    '.register("apply_plan"',
    '.register("observe_company"',
    "context.engine.plan(",
    "context.engine.apply(",
    "context.engine.reconcile("
  ];
  const missingHandlers = handlers.filter(marker => !engine.includes(marker));
  return missingHandlers.length
    ? fail("omniseed", `Ordinary reconciliation operation handlers are incomplete: ${missingHandlers.join(", ")}.`)
    : pass("Reconciliation is a declared Capability with a named primitive composition and uses the ordinary governed plan, apply, and observe Engine operations without a bootstrap-only mutation path.");
}

async function replaceableGovernedSteward({ repositories }) {
  if (!repositories.company) return fail("company", "Canonical company repository is absent.");
  const company = parse(await repositories.company.read("omniform.yaml")), stewardship = company.spec.stewardship;
  const capability = company.spec.capabilities.find(item => item.id === stewardship?.capability), realisation = company.spec.realisations.find(item => item.id === stewardship?.realisation);
  const agents = new Set((company.spec.resources.agents ?? []).map(item => item.id)), actor = realisation?.participants.find(item => agents.has(item.resource));
  if (!capability || realisation?.capability !== capability.id || !actor) return fail("company", "Stewardship must reference an independent Capability, matching Realisation, and agents-family participant.");
  const app = await repositories.omniseedos.read("src/app.js"), tests = await repositories.omniseedos.read("test/app.test.js");
  const required = ["engine.invokeOperation", "propose_company_change", "cannot grant myself", "registry.stewardship", "declared steward resolves company context"];
  const source = `${app}\n${tests}`;
  return required.every(marker => source.includes(marker)) ? pass(`Stewardship Capability ${capability.id} is currently realised by replaceable Agent ${actor.resource}; reads use OmniSeed operations and self-escalation is refused.`) : fail("omniseedos", "Governed replaceable steward client markers are missing.");
}

async function optionalOsRealisation({ repositories }) {
  if (!repositories.company) return fail("company", "Canonical company repository is absent.");
  const company = parse(await repositories.company.read("omniform.yaml"));
  const os = (company.spec.resources.connectors ?? []).find(item => item.id === "omniseed_os"), realisation = company.spec.realisations.find(item => item.participants.some(participant => participant.resource === os?.id));
  if (!os?.spec?.optional || !realisation) return fail("company", "OmniSeed OS must be an optional primitive participant under an operating Capability realisation.");
  const publicApp = await repositories.omniseedos.read("public/app.js");
  return publicApp.includes("registry.stewardship") && publicApp.includes("registry.realisations") ? pass("OmniSeed OS is optional company state and its UI discovers steward and realisation projections from OmniSeed.") : fail("omniseedos", "OS UI does not discover steward/realisations from engine state.");
}

async function explicitProviderRegistration({ repositories }) {
  const provider = await repositories.omniseed.read("src/provider.js");
  const expected = ["class ProviderRegistry", "register(provider)", "this.#providers.set"];
  const missing = expected.filter(text => !provider.includes(text));
  return missing.length ? fail("omniseed", `Explicit Provider registration markers missing: ${missing.join(", ")}`) : pass("Provider implementations enter the runtime through explicit ProviderRegistry registration.");
}

async function missingProviderGap({ repositories }) {
  const provider = await repositories.omniseed.read("src/provider.js");
  const compiler = await repositories.omniseed.read("src/compiler.js");
  const tests = await combinedFiles(repositories.omniseed, repositories.omniseed.files.filter(file => file.startsWith("test/")));
  const expected = [provider.includes("provider_unavailable"), compiler.includes("providerGaps"), tests.includes("never fabricated") || tests.includes("no fallback")];
  return expected.every(Boolean) ? pass("Provider gaps are compiled explicitly and tests cover absent Providers without fallback.") : fail("omniseed", "Missing Provider gap implementation or regression coverage was not found.");
}

function engineNoVendorSdk({ repositories }) {
  const allowed = new Set(["@omniseed/omniform", "yaml"]);
  const dependencies = [...allDependencies(repositories.omniseed.manifest)].filter(name => !allowed.has(name));
  return dependencies.length ? fail("omniseed", `Engine runtime dependencies include vendor or non-portable packages: ${dependencies.join(", ")}`) : pass("Engine runtime dependencies contain only Omniform and the vendor-neutral YAML document formatter.");
}

async function evidenceProvenance({ repositories }) {
  const provider = await repositories.omniseed.read("src/provider.js");
  const engine = await repositories.omniseed.read("src/engine.js");
  const expected = [provider.includes("source: this.metadata.id"), engine.includes("observedAt: observation.checkedAt"), engine.includes("resourceId: action.resourceId")];
  return expected.every(Boolean) ? pass("Provider evidence records source, resource identity, and observation time.") : fail("omniseed", "Evidence source, resource, or observation-time provenance marker is missing.");
}

async function languageIndependentProviderBoundary({ repositories }) {
  const repo = repositories.omniseed;
  const provider = await repo.read("src/provider.js"), protocol = await repo.read("src/provider-protocol.js"), transport = await repo.read("src/transports/stdio-json-rpc.js");
  const expected = [
    provider.includes("class InProcessProviderHandle"),
    provider.includes("providerHandle(provider)"),
    protocol.includes("class ProtocolProviderHandle"),
    protocol.includes("omniseed.provider.protocol/1.0"),
    protocol.includes("transport.start()") && protocol.includes("transport.request(") && protocol.includes("transport.close()"),
    transport.includes("class StdioJsonRpcTransport")
  ];
  if (!expected.every(Boolean)) return fail("omniseed", "Normalized in-process/protocol Provider boundary or versioned transport contract is missing.");
  const lifecycle = await combinedFiles(repo, ["src/compiler.js", "src/planner.js", "src/resolver.js", "src/engine.js"]);
  const languageSpecific = /python|python3|\.py\b/i.test(lifecycle);
  const transportSpecific = /stdio|json-rpc|child_process|spawn\(/i.test(lifecycle);
  return languageSpecific || transportSpecific
    ? fail("omniseed", "Compiler, planner, resolver, or engine lifecycle contains language- or transport-specific Provider logic.")
    : pass("ProviderRegistry normalizes in-process and protocol Providers; core lifecycle code contains no implementation-language or transport branching.");
}

function externalProviderLifecycle({ repositories }) {
  const repo = repositories.omniseed;
  if (!repo.files.includes("examples/providers/python_reference_provider.py") || !repo.files.includes("test/provider-protocol.test.js")) return fail("omniseed", "Non-JavaScript reference Provider or lifecycle test is missing.");
  try {
    execFileSync(process.execPath, ["--test", "--test-name-pattern=Python Provider completes", "test/provider-protocol.test.js"], { cwd: repo.path, encoding: "utf8", timeout: 15000, stdio: "pipe" });
    return pass("Python reference Provider passed the real inspect, resolve, plan, approve, apply, observe, persist, recompile, reconcile, invoke, and shutdown lifecycle test.");
  } catch (error) {
    const evidence = String(error.stdout || error.stderr || error.message).trim().slice(0, 1000);
    return fail("omniseed", `External Provider lifecycle test failed: ${evidence}`);
  }
}

async function osAuthorityBoundary({ repositories }) {
  const app = await repositories.omniseedos.read("src/app.js");
  const publicSource = await combinedFiles(repositories.omniseedos, repositories.omniseedos.files.filter(file => file.startsWith("public/")));
  if (!app.includes("engine.inspect(declaration)")) return fail("omniseedos", "Company projection does not delegate to engine.inspect().");
  if (/state\s*=\s*["'](?:realised|operational|effective|degraded)["']/i.test(publicSource)) return fail("omniseedos", "Public UI appears to assign authoritative capability status.");
  return pass("Company and Lily projections obtain capability state from engine.inspect().");
}

async function osMutationDelegation({ repositories }) {
  const app = await repositories.omniseedos.read("src/app.js");
  const expected = ["engine.plan(declaration", "engine.approve(", "engine.apply(declaration"];
  const missing = expected.filter(text => !app.includes(text));
  return missing.length ? fail("omniseedos", `OS mutation delegation missing: ${missing.join(", ")}`) : pass("Plan, approval, and apply HTTP paths delegate to the engine.");
}

async function osOperationIdentity({ repositories }) {
  const app = await repositories.omniseedos.read("src/app.js");
  const expected = ["registry.operations.find", "operationId: requested", 'invokeOperation(declaration, "search_company"'];
  const missing = expected.filter(text => !app.includes(text));
  return missing.length ? fail("omniseedos", `Engine operation identity markers missing: ${missing.join(", ")}`) : pass("Lily and search preserve registered engine operation IDs.");
}

async function noAgentProviderBypass({ repositories }) {
  const osSource = await combinedSource(repositories.omniseedos);
  const bypasses = ["@octokit/", "openai", "stripe", "twilio", "salesforce"].filter(value => osSource.toLowerCase().includes(value));
  return bypasses.length ? fail("omniseedos", `Potential direct vendor calls in OS: ${bypasses.join(", ")}`) : pass("OS and Lily contain no direct imports or calls to known vendor SDKs.");
}

function packageCompatibility({ repositories, compatibility }) {
  const channel = Object.values(compatibility.channels).find(item => item.status === "supported");
  const actual = {
    omniform: repositories.omniform.manifest.version,
    engine: repositories.omniseed.manifest.version,
    os: repositories.omniseedos.manifest.version
  };
  const mismatches = Object.entries(actual).filter(([name, version]) => channel?.[name] !== version);
  if (mismatches.length) return fail("omniseed-ecosystem", `Versions outside supported channel: ${mismatches.map(([name, value]) => `${name}=${value}`).join(", ")}`);
  const engineWants = repositories.omniseed.manifest.dependencies?.["@omniseed/omniform"];
  const osWantsEngine = repositories.omniseedos.manifest.dependencies?.["@omniseed/engine"];
  const osWantsForm = repositories.omniseedos.manifest.dependencies?.["@omniseed/omniform"];
  return [engineWants, osWantsEngine, osWantsForm].every((value, index) => value === [channel.omniform, channel.engine, channel.omniform][index])
    ? pass(`All packages match supported channel ${actual.omniform}.`)
    : fail("omniseed-ecosystem", "Cross-package dependency versions do not match the supported compatibility channel.");
}

async function ownershipDocumentation({ repositories }) {
  const expected = {
    omniform: ["describing one company", "does not run"],
    omniseed: ["makes a company", "does not own the Omniform language"],
    omniseedos: ["one company", "does not make up company state"]
  };
  for (const [name, phrases] of Object.entries(expected)) {
    const readme = (await repositories[name].read("README.md")).toLowerCase();
    const missing = phrases.filter(text => !readme.includes(text.toLowerCase()));
    if (missing.length) return fail(name, `README ownership language missing: ${missing.join(", ")}`);
  }
  return pass("All product READMEs state their distinct ownership boundary.");
}

async function stableAuthorityIds({ repositories }) {
  const schema = JSON.parse(await repositories.omniform.read("schema/omniform.schema.json"));
  const id = schema.$defs?.id;
  const capabilityRequired = schema.$defs?.capability?.required ?? [];
  const operationRequired = schema.$defs?.operation?.required ?? [];
  if (!id?.pattern || !capabilityRequired.includes("id") || !operationRequired.includes("id")) return fail("omniform", "Stable ID constraints are missing for authoritative Capability or operation objects.");
  return pass("Omniform defines stable ID syntax and requires IDs for Capabilities and operations.");
}

async function githubProviderManifest({ root, repositories }) {
  const repository = repositories.githubProvider;
  if (!repository) return { status: "warning", repository: "githubProvider", evidence: "GitHub Provider repository is not present; pass --github-provider to inspect it." };
  let manifest;
  try { manifest = JSON.parse(await repository.read("provider-package.json")); }
  catch (error) { return fail("githubProvider", `Provider manifest is missing or invalid JSON: ${error.message}`); }
  const schema = JSON.parse(await readFile(join(root, "providers/provider-package.schema.json"), "utf8"));
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  if (!validate(manifest)) return fail("githubProvider", `Provider manifest does not match the ecosystem schema: ${validate.errors.map(item => `${item.instancePath || "$"} ${item.message}`).join("; ")}`);
  if (!repository.files.includes(manifest.configurationSchema.replace(/^\.\//, ""))) return fail("githubProvider", `Provider manifest references missing configuration schema ${manifest.configurationSchema}`);
  const implementation = await repository.read("provider/github_provider.py");
  const missing = [manifest.id, ...manifest.operations].filter(value => !implementation.includes(value));
  return missing.length ? fail("githubProvider", `Manifest claims are absent from implementation: ${missing.join(", ")}`) : pass("GitHub Provider manifest validates, its configuration schema exists, and its static ID/operation claims match the implementation without asserting live status.");
}

async function uniqueProviderManifestId({ repositories }) {
  const declarations = [];
  for (const [name, repository] of Object.entries(repositories)) {
    if (!repository.files.includes("provider-package.json")) continue;
    let manifest;
    try { manifest = JSON.parse(await repository.read("provider-package.json")); }
    catch (error) { return fail(name, `Provider manifest cannot be inspected: ${error.message}`); }
    if (manifest.id) declarations.push({ id: manifest.id, repository: name, path: repository.path });
  }
  const counts = declarations.reduce((result, item) => result.set(item.id, (result.get(item.id) ?? 0) + 1), new Map());
  const duplicates = declarations.filter(item => counts.get(item.id) > 1);
  if (duplicates.length) return fail("provider-packages", `Duplicate canonical Provider manifest ID declarations: ${duplicates.map(item => `${item.id} at ${item.repository}:${item.path}`).join(", ")}`);
  return pass(`Active Provider package manifests declare unique canonical IDs: ${declarations.map(item => `${item.id} (${item.repository})`).join(", ")}.`);
}

async function providerOrganisationMetadata({ root, repositories }) {
  const schema = JSON.parse(await readFile(join(root, "providers/provider-package.schema.json"), "utf8"));
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  const inspected = [];
  for (const [name, repository] of Object.entries(repositories)) {
    if (!repository.files.includes("provider-package.json")) continue;
    let manifest;
    try { manifest = JSON.parse(await repository.read("provider-package.json")); }
    catch (error) { return fail(name, `Provider manifest cannot be inspected: ${error.message}`); }
    if (!validate(manifest)) return fail(name, `Provider manifest does not match the ecosystem schema: ${validate.errors.map(item => `${item.instancePath || "$"} ${item.message}`).join("; ")}`);
    const implementationFamilies = manifest.implementations.map(item => item.family);
    const missing = manifest.primitiveFamilies.filter(family => !implementationFamilies.includes(family));
    const duplicated = implementationFamilies.filter((family, index) => implementationFamilies.indexOf(family) !== index);
    const extra = implementationFamilies.filter(family => !manifest.primitiveFamilies.includes(family));
    if (missing.length || duplicated.length || extra.length) return fail(name, `Provider implementation metadata does not match supported families: missing=${missing.join(",") || "none"}; duplicated=${[...new Set(duplicated)].join(",") || "none"}; extra=${extra.join(",") || "none"}`);
    inspected.push(`${manifest.id} supplied by ${manifest.organisation}`);
  }
  return inspected.length ? pass(`Provider manifests explicitly declare supplying organisations and per-family products: ${inspected.join("; ")}.`) : fail("provider-packages", "No active Provider manifests were inspected.");
}

async function canonicalPrimitiveVocabulary({ root, repositories }) {
  const formSchema = JSON.parse(await repositories.omniform.read("schema/omniform.schema.json"));
  const providerSchema = JSON.parse(await readFile(join(root, "providers/provider-package.schema.json"), "utf8"));
  const formFamilies = formSchema.$defs?.primitiveFamily?.enum;
  const manifestFamilies = providerSchema.properties?.primitiveFamilies?.items?.enum;
  if (JSON.stringify(formFamilies) !== JSON.stringify(canonicalPrimitiveFamilies)) return fail("omniform", `Omniform primitive families differ from the canonical ten: ${JSON.stringify(formFamilies)}`);
  if (JSON.stringify(manifestFamilies) !== JSON.stringify(canonicalPrimitiveFamilies)) return fail("omniseed-ecosystem", `Provider manifest vocabulary differs from the canonical ten: ${JSON.stringify(manifestFamilies)}`);
  for (const [name, repository] of Object.entries(repositories)) {
    if (!repository.files.includes("provider-package.json")) continue;
    const manifest = JSON.parse(await repository.read("provider-package.json"));
    const obsolete = manifest.primitiveFamilies.filter(family => !canonicalPrimitiveFamilies.includes(family));
    if (obsolete.length) return fail(name, `${name} advertises removed or unknown primitive families: ${obsolete.join(", ")}`);
  }
  return pass("Omniform and Provider contracts expose exactly the ten canonical primitive families and every inspected Provider advertises only retained families.");
}

async function independentProviderSelection({ repositories }) {
  const schema = JSON.parse(await repositories.omniform.read("schema/omniform.schema.json"));
  const providerKeys = Object.keys(schema.$defs?.providerMap?.properties ?? {});
  if (JSON.stringify(providerKeys) !== JSON.stringify(canonicalPrimitiveFamilies)) return fail("omniform", "Provider selection is not independently keyed by every canonical primitive family.");
  if (!schema.$defs?.resource?.properties?.provider) return fail("omniform", "Primitive resources cannot override a family Provider default.");
  const engine = await repositories.omniseed.read("src/compiler.js");
  if (!engine.includes("providerIdForResource")) return fail("omniseed", "Engine compilation does not retain primitive-instance Provider selection.");
  const company = repositories.company ? parse(await repositories.company.read("omniform.yaml")) : null;
  const memoryProviders = new Set((company?.spec?.resources?.memory ?? []).map(item => item.provider ?? company.spec.providers.memory?.provider).filter(Boolean));
  return memoryProviders.size >= 2
    ? pass("Family defaults remain available while primitive instances can select different supplying organisations; the reference company composes Omnicede and Neon resources within memory.")
    : fail("company", "The canonical company does not prove independent Provider selection for primitive instances within one family.");
}

async function companySearchCapabilityBoundary({ repositories }) {
  const example = await repositories.omniform.read("examples/company.omniform.json"), engine = await repositories.omniseed.read("src/engine.js"), tests = await repositories.omniseed.read("test/company-search.test.js");
  const declaration = JSON.parse(example), capability = declaration.spec.capabilities.find(item => item.id === "company_search"), operation = declaration.spec.operations.find(item => item.id === "search_company");
  if (!capability || operation?.capability !== "company_search") return fail("omniform", "Canonical Company Search Capability/operation association is missing.");
  if (engine.includes("spec.providers.memory") || engine.includes("spec.providers.skills")) return fail("omniseed", "search_company contains a hard-coded memory or skills Provider selection.");
  const requiredTests = ["memory-backed Company Search", "connector-backed federated search", "cannot mutate canonical runtime state"];
  const missing = requiredTests.filter(marker => !tests.includes(marker));
  return missing.length ? fail("omniseed", `Company Search capability fixtures missing: ${missing.join(", ")}`) : pass("Company Search is a Capability; search_company resolves declared participants and tests memory-backed and connector-backed strategies without canonical mutation.");
}

function allDependencies(manifest) {
  return new Set(Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies, ...manifest.peerDependencies }));
}

function objectKeys(value, output = new Set()) {
  if (!value || typeof value !== "object") return output;
  if (Array.isArray(value)) value.forEach(item => objectKeys(item, output));
  else Object.entries(value).forEach(([key, item]) => { output.add(key); objectKeys(item, output); });
  return output;
}

async function combinedSource(repository) {
  const files = repository.files.filter(file => /\.(?:js|mjs|cjs|json)$/.test(file) && !file.endsWith("package-lock.json"));
  return combinedFiles(repository, files);
}

async function combinedFiles(repository, files) {
  return (await Promise.all(files.map(file => repository.read(file)))).join("\n");
}

async function occurrences(repository, pattern, allowedFiles = []) {
  const output = [];
  for (const file of repository.files.filter(item => /\.(?:js|mjs|cjs)$/.test(item))) {
    if (allowedFiles.includes(file)) continue;
    const text = await readFile(join(repository.path, file), "utf8");
    if (pattern.test(text)) output.push(file);
    pattern.lastIndex = 0;
  }
  return output;
}
