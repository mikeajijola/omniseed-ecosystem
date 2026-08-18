# Adding a Provider package

Read the authoritative [Provider semantics](provider-semantics.md) first. A Provider is the supplying organisation boundary, not one of its products, services, frameworks, SDKs, or features.

Before creating a Provider, identify the supplying organisation. If the proposed Provider is merely a product, service, framework, SDK, or feature of an existing Provider organisation, do not create a new Provider. Model it as an implementation/product beneath that Provider.

Include additional Provider repositories in ecosystem conformance with
`--provider canonical_id=/absolute/path`. The option is repeatable; it keeps
the governance runner extensible without adding product-specific CLI flags.

A Provider is a replaceable way to realise part of a company. A package name or vendor is not the Capability itself.

Every Provider package publishes a static manifest that validates against [`providers/provider-package.schema.json`](../providers/provider-package.schema.json). The manifest declares the supplying organisation, canonical Provider ID, supported primitive families, and the products/services used beneath each family. It contains no credentials, tenant settings, runtime health, installation claim, or current connection state.

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

- Provider organisation/legal or supplying entity
- Canonical Provider ID
- Primitive family
- Semantic responsibility
- Product/service/framework/SDK used for the implementation
- Authority/authentication
- Plan behaviour
- Apply behaviour
- Observe behaviour
- Evidence produced
- Persistent state recorded
- Failure/drift behaviour

If those answers are not clean and testable, do not advertise the family. Start narrow. Vendor APIs, persistent external objects, and general usefulness do not create primitive families.

Semantic review fails when the declared Provider identity is only a product or framework belonging to an already-modelled supplying organisation. Do not infer this from a name alone: require the explicit authoring declaration and inspect ownership evidence.

Do not choose a Provider family based on where data happens to reside. Choose it based on the primitive responsibility being manifested. A retrieval/ranking implementation may realise `skills`; durable organisational continuity may realise `memory`; governed federation to external sources may realise `connectors`. None of those Provider claims turns the `company_search` Capability into that primitive.

The canonical families are `agents`, `skills`, `connectors`, `workflows`, `schedules`, `policies`, `observations`, `memory`, `identity`, and `machines`. New manifests using the removed alpha families `systems` or `company_search` fail conformance. Historical evidence keeps its recorded vocabulary for auditability.
