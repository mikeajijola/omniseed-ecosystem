# ServiceNow Provider contract

- Supplying organisation: ServiceNow
- Canonical Provider ID: `servicenow`
- Primitive family: `connectors`
- Products beneath the Provider: Table REST API, OAuth, platform audit and instance evidence

This bounded contract normalizes governed record observation and exact-plan mutation. ServiceNow tables, workflows, approvals, and `sys_id` values remain implementation details and provenance; they do not become Company Capability semantics or independently authorize an OmniSeed mutation.

The checked-in tests use deterministic non-production fixtures. No live ServiceNow instance or credentials were supplied, so `conformance-status.json` records live evidence as unavailable and blocks governed/current promotion until live acceptance evidence and exact revision conformance both pass.
