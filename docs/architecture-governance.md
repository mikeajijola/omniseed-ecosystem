# Architecture governance

The ecosystem constitution is a versioned statement of what must remain true across Omniform, OmniSeed, and OmniSeed OS.

The governance repository observes those products. It is never imported by their runtime packages.

## Two kinds of review

Deterministic conformance reports only what code can prove. Examples include dependency direction, forbidden package dependencies, the presence of stale-plan checks, and delegation from OS routes to engine methods.

Semantic review covers questions that require judgment. Examples include whether a proposed Omniform idea is portable, whether a new abstraction is too vendor-specific, or whether a UI is becoming a second source of company state.

Never report semantic judgment as a deterministic failure. A semantic reviewer may recommend a proposal. It may not silently change the constitution or mutate product repositories.

## Change flow

```text
finding
  → proposal
  → architecture decision
  → candidate change
  → deterministic conformance
  → review and approval
  → merge or apply
  → observation and evidence
```

Principle and invariant changes are governed changes themselves. Permanent invariant IDs make reports and history comparable over time.

## Primitive-family architecture

Capabilities express company intent. Primitive requirements express the fundamental company building blocks that must be manifested. Providers are replaceable ways to realise those families. Deployed state records what concretely exists; observations and evidence establish what reality says; reconciliation closes the gap.

The canonical manifestation vocabulary is `agents`, `skills`, `connectors`, `workflows`, `schedules`, `policies`, `observations`, `memory`, `identity`, and `machines`. Provider selection is independent per family even when one package implements several. Capabilities compose primitives and never bind directly to vendors.

`systems` and `company_search` are removed alpha ontology, not aliases. Persistence belongs to state and does not justify a catch-all primitive. Search remains ordinary replaceable retrieval functionality composed from operations and appropriate primitives. Agent means agency and does not privilege AI: people, software, services, teams, organisations, machines with agency, and AI systems may all be governed realisations.

Company Search is the canonical layer test: `company_search` is a Company Capability, `search_company` is its authorized operation, and the selected strategy composes whichever skills, memory, connectors, identity, policies, observations, or agents it actually requires. A Capability must not be silently reduced to one implementation primitive: Company Search is neither memory nor skills; software development is not workflows; customer support is not agents.

## Two governed loops

A Realisation Plan changes reality to match the company definition. A Company Change Proposal proposes changing the company definition itself.

Semantic systems such as Lily may recommend either path and cite evidence. They do not directly mutate canonical company truth or Provider state. OmniSeed validates and governs the exact proposal; applying it recompiles desired state, after which the existing realisation loop detects and handles new gaps.
