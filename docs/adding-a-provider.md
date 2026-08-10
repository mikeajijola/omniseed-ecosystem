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

