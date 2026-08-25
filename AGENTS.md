# Working on OmniSeed Ecosystem Governance

When you work here, protect the boundaries that let Company as Code stay truthful.

## What must stay true

- Capability is the stable statement of what must be possible.
- Actors, interfaces, Providers, and technical implementations can change.
- Omniform describes one company. It does not contain live state.
- OmniSeed owns controlled runtime work and evidence.
- OmniSeed OS shows and operates engine-owned state. It does not create another truth.
- A requested Provider is not automatically installed, connected, healthy, or capable.
- A Provider is the supplying organisation boundary. Never create a Provider for one of that organisation's products, services, frameworks, SDKs, or features; model those beneath the Provider.
- “We asked for it” is not the same as “it exists.”
- AI systems may inspect and propose. They do not bypass plan, approval, apply, and observation.
- This repository tests the ecosystem. It must never become a runtime dependency of the products.

## How the code protects this

- Give every invariant a permanent ID. Do not reuse an old ID for a new meaning.
- A deterministic rule may fail only on something the runner can prove.
- Put uncertain architectural judgment in a semantic finding, not a deterministic failure.
- Every finding must name its invariant and include inspectable evidence.
- Keep generated reports reproducible apart from time and Git commit metadata.
- Add a failing fixture before adding or changing a deterministic rule.
- Do not silently weaken a critical rule to make a report green.
- Keep repository paths configurable. Never assume a developer's home directory.
- Never read or print credentials while inspecting repositories.
- Always visually inspect every produced user-facing artifact in its rendered or deployed form before reporting it complete. Automated tests and HTTP status checks do not replace this review.

Run `npm test` and `npm run conformance` before proposing a change. See [`docs/adding-an-invariant.md`](docs/adding-an-invariant.md) and [`docs/architecture-governance.md`](docs/architecture-governance.md).
