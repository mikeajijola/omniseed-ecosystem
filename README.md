# OmniSeed Ecosystem Governance

This repository checks whether the OmniSeed ecosystem still follows its own rules.

Company as Code means a company can run from its definition. That idea only works if the language, engine, and operating experience keep clear jobs.

- [Omniform](https://github.com/mikeajijola/omniform) describes the company.
- [OmniSeed](https://github.com/mikeajijola/omniseed) works out how to make the description true, carries out approved work, and checks what happened.
- [OmniSeed OS](https://github.com/mikeajijola/omniseedos) is where people and other actors see and operate the running company.

This repository is the shared rulebook and test bench. It is not a fourth runtime layer. None of the three products depend on it while running.

The rulebook covers both governed loops: realisation plans change reality to match Omniform, while Company Change Proposals change canonical desired Omniform before the ordinary realisation loop runs again. `ENGINE-010` protects the exact proposal, validation, approval, evidence, and staleness boundary.

## What lives here

- `constitution/` contains human- and machine-readable principles, invariants, and ownership boundaries.
- `conformance/` contains the runner, report schema, rules, and tests.
- `compatibility/` records compatible package lines.
- `providers/` defines provider-package and provider-registry data contracts.
- `capabilities/` contains the governance-owned company capability reference catalogue. It is discovery/provenance material, not canonical company desired state.
- `reports/latest.json` is the latest local conformance evidence.
- `docs/` explains how to change the architecture safely.

## Run it

Place the three product repositories beside this repository, or use the current parent workspace layout.

```sh
npm install
npm test
npm run conformance
```

Use explicit repository paths when they live elsewhere:

```sh
npx omniseed-conformance \
  --omniform ../omniform \
  --engine ../omniseed \
  --os ../omniseedos
```

The command writes `reports/latest.json`. A failed deterministic invariant exits with a non-zero status. Warnings remain visible without pretending that a judgment is a machine-proven failure.

The latest CI-generated report is published for machines at <https://mikeajijola.github.io/omniseed-ecosystem/conformance/latest.json> and for people at <https://mikeajijola.github.io/omniseed-ecosystem/conformance/>.

## Status

This is the Phase 1 foundation of the proposed ecosystem-governance programme. The first runner covers objective repository, dependency, mutation-boundary, Provider-truth, evidence, package, and documentation checks. Semantic architecture review remains a separate human or AI-assisted process.
