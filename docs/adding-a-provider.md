# Adding a Provider package

A Provider is a replaceable way to realise part of a company. A package name or vendor is not the Capability itself.

Every Provider package publishes a static manifest that validates against [`providers/provider-package.schema.json`](../providers/provider-package.schema.json). The manifest declares what the package can support. It contains no credentials, tenant settings, runtime health, installation claim, or current connection state.

Discovery means that a candidate exists. It does not install, configure, approve, or trust that candidate.

The intended lifecycle is:

```text
discovered → selected → installed → configured → connected → healthy → capable
```

These states never collapse into one boolean. A Provider may be requested in Omniform while no implementation is installed. OmniSeed must show that as a truthful gap.

Provider test tooling will validate manifest honesty, family and operation boundaries, plan purity, apply context, evidence provenance, company isolation, and failure behavior.

## Start from the primitive responsibility

Ask: “Which existing primitive family does this implementation truthfully realise?” Do not begin with a vendor feature catalogue. A package may support one or many families, but every family is independently selected by the company and every claim needs implementation evidence.

For each advertised family, document:

- Primitive family
- Semantic responsibility
- Provider implementation
- Authority/authentication
- Plan behaviour
- Apply behaviour
- Observe behaviour
- Evidence produced
- Persistent state recorded
- Failure/drift behaviour

If those answers are not clean and testable, do not advertise the family. Start narrow. Vendor APIs, persistent external objects, and general usefulness do not create primitive families.

Do not choose a Provider family based on where data happens to reside. Choose it based on the primitive responsibility being manifested. A retrieval/ranking implementation may realise `skills`; durable organisational continuity may realise `memory`; governed federation to external sources may realise `connectors`. None of those Provider claims turns the `company_search` Capability into that primitive.

The canonical families are `agents`, `skills`, `connectors`, `workflows`, `schedules`, `policies`, `observations`, `memory`, `identity`, and `machines`. New manifests using the removed alpha families `systems` or `company_search` fail conformance. Historical evidence keeps its recorded vocabulary for auditability.
