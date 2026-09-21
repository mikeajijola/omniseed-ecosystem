# Authority lineage and exact-effect experiment

Conformance-only evidence for [#62](https://github.com/mikeajijola/omniseed-ecosystem/issues/62) and [#65](https://github.com/mikeajijola/omniseed-ecosystem/issues/65). No production credentials, physical actuation, canonical schema changes or runtime dependency on this repository. Deterministic keys are **public test keys**.

Run `npm ci`, `npm run experiment:authority-effect`, and open `reports/authority-effect/index.html`. The same scenario records produce machine JSON, human HTML (with a simulated actuator/sensor graphic), and CI JSONL traces. Unit tests run under ordinary `npm test`. Assertions use permanent experimental IDs `EXP-AUTH-001` through `005` and `EXP-EFFECT-001` through `005`; they do not certify production Providers.

## Mapping and findings

| Existing concept | Experimental representation | Evidence / limitation |
| --- | --- | --- |
| Authenticated actor and required permissions | Neutral grant actor, issuer, permission list | Calls the actual published `@omniseed/engine@1.0.0-alpha.21` `authorize` gate. It accepts no delegation chain. |
| Bounded stewardship | Expiry, depth, actions, spend, current policy/revocations | Test-only bounds; does not replace Engine stewardship, leases, budgets, protected-category decisions or approvals. |
| Provider and resource selection | Exact provider/target allowlists | Credentials never imply delegated authority. |
| Plan / approval / apply | Stable operation digest and separately pinned root grant | Engine `src/planner.js` hashes the sorted plan body (company, definition hash, state version, actions and gaps); `src/engine.js` binds approval to plan hash/action IDs and checks state version/definition before apply. This fixture's per-operation hash is **not** a new Engine approval format. |
| Provider mutation / observation | Conditional in-memory write, idempotency receipt, independent state read | Engine invokes Provider validate/plan/apply/observe. Its state-store CAS is not proof of atomic external effects. No universal Provider-side atomic commit or replay contract was established by this experiment. |
| Evidence and capability evaluation | Authority decision, effect trace and observed outcome are separate | Accepted-but-unobserved is INDETERMINATE. Partial/divergent effect is FAIL. These are simulated outcome assertions, not live capability evals. |

The positive fixture agrees with the real Engine permission gate. Widened intermediate authority, expiry, revocation, stale policy and missing lineage can leave that **permission-only gate** ALLOW while independent verification rejects/holds. This proves a missing input/portable evidence contract in that gate, **not** a production authorization bypass: the full Engine has other policy and approval checks. Propose any portable lineage contract separately after review; do not silently broaden this experiment into a production security implementation.

## Draft mapping assumptions

The exact sources are [delegation draft -01](https://www.ietf.org/archive/id/draft-asor-wimse-agent-delegation-chain-01.html) and [execution-finality draft -02](https://www.ietf.org/ietf-ftp/internet-drafts/draft-das-execution-finality-enforcement-profiles-02.html). Both are work in progress; neither is adopted as OmniSeed ontology.

The selected wire subset uses canonical JSON, Ed25519 signatures, JWT issuer/subject/audience/time/ID fields, RFC 7638 OKP public-key thumbprints, RAR `agent_delegation` details, depth and SHA-256 parent **signing-input** links. Targets/providers use `one_of`; actions/spend use `max`. Literal permission membership is tested; wildcard scopes, other constraint operators, general JWT interoperability, issuer key discovery and complete draft test vectors are outside this subset. Canonical token round-trips reject duplicate/noncanonical input; non-finite numbers and malformed Unicode are rejected. Fixture holder proof signs the exact operation; it is **not a complete DPoP implementation**. Pinned test root/key derivation and a 30-second policy observation window are explicit fixture assumptions, not production trust/revocation infrastructure.

## Effect and reconciliation boundaries

The isolated software resource uses a version precondition and operation-ID receipt. Verification and mutation are synchronous, without a yield, in one simulated process. The simulated actuator uses the same contract with position limited to ±5 units, sensor tolerance 0.1 and freshness 5 seconds. It is not a robot safety controller. The boundary consumes the presented operation independently of the approved snapshot; target, provider, arguments or version substitution cannot reuse that approval. Readback is from resulting simulation state; fault injection can withhold or contradict it.

Replays never cause a second effect, including after unobserved/partial results. Stored receipts are copied before returning so a caller cannot rewrite history. Changed authority is checked even on replay. Non-convergence requires re-observation before considering a retry; this fixture does not claim compensation or recovery has occurred.

## Remaining acceptance evidence

This is a bounded first experiment, not closure of either issue. A non-production external Provider conditional-write/readback trial, audit of each reference Provider's actual preconditions, full central stewardship comparison, explicit protected-category/narrowing and TOCTOU fault-injection cases, and an independent semantic review remain. Human/hybrid scenarios model actor identities; they do not prove a human approval UI. Draft terminology has not been introduced into Company capabilities. No conclusion here certifies portable production authority or physical safety.
