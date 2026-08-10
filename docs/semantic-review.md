# Semantic architecture review

Semantic review asks questions that static checks cannot answer safely:

- Is a new Omniform idea portable across unrelated companies?
- Is vendor behavior leaking into the shared language?
- Is an actor or department being mistaken for a Capability?
- Is OmniSeed OS creating its own runtime truth?
- Is a new primitive truly fundamental?

A human or AI reviewer should cite principles and invariants, show evidence, state uncertainty, and propose a governed next action. The reviewer does not gain mutation authority.

Test proposed portable semantics against at least three unrelated domains. If an idea does not generalise, prefer a Provider package or resource `spec`.

