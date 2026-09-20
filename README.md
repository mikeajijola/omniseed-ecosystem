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
- `providers/` defines provider-package and provider-registry data contracts, plus the non-runtime candidate contract catalogue.
- `capabilities/` contains the governance-owned company capability reference catalogue. It is discovery/provenance material, not canonical company desired state.
- `reports/main/latest.json` is the canonical mainline conformance evidence; candidate evidence must use a separate path.
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

The command writes the mainline report under `reports/main/latest.json`. Provider membership and canonical authority refs are declared in `conformance/repositories.yaml`, including Google and Omnicede's `master` branch. CI checks out exact resolved revisions from that catalogue. `--observe-remotes` independently observes every canonical ref before and after the checks; historical local checkouts cannot establish canonical freshness. Failed resolution is `indeterminate`, and an observed head advance is `stale`.

`--certified-report path` reads the previous published certification from a separate location. A baseline with failed checks, warnings, missing authority evidence, or inconsistent subject identity cannot certify a new result. Matching local evidence without canonical remote observation is always `indeterminate`. The compatibility flag `--freshness current` remains a gate, never an assertion. A successful test run alone does not create a new certification. After the canonical workflow passes its tests and candidate evaluation, `--certify-candidate path` reruns all checks and observes canonical heads again. Only a clean, complete, unchanged exact candidate with independently passing checks may become current; failure leaves the earlier observation visible. Pull requests cannot take this publication path.

CI publishes failed/indeterminate mainline evidence as well as successful evidence, preserving the failing check's exit status and showing the same verdict in JSON, HTML, and logs. PR reports remain candidates and cannot publish Pages. Hourly canonical observations bound detection delay for changes in other repositories; reports are timestamped observations, not a guarantee that upstream heads have not changed since then. Package compatibility remains independently enforced: do not relabel the supported channel merely to make source conformance green.

The latest CI-generated report is published for machines at <https://mikeajijola.github.io/omniseed-ecosystem/conformance/latest.json> and for people at <https://mikeajijola.github.io/omniseed-ecosystem/conformance/>.

## Status

This is the Phase 1 foundation of the proposed ecosystem-governance programme. The first runner covers objective repository, dependency, mutation-boundary, Provider-truth, evidence, package, and documentation checks. Semantic architecture review remains a separate human or AI-assisted process.
