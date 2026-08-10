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

