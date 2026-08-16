# Provider semantics

This document is the authoritative ecosystem definition of **Provider**.

> A Provider represents the supplying organisation/provider boundary. Products, services, frameworks and SDKs offered by that organisation are implementation choices beneath the Provider; they are not Providers themselves.

A Provider answers: **Who supplies this implementation capability?** A product, service, or framework answers: **What are we using from that Provider?**

The complete hierarchy remains:

`Capability → requirement → Realisation → primitive instance → primitive family → Provider → Provider product/service/framework → observed resource → evidence`

Providers never realise arbitrary business Capabilities directly. A Provider may implement several primitive-family contracts through different products, while the company selects Provider bindings below each primitive participant in a Realisation.

## Examples

Vercel is the Provider organisation. Eve, Functions, AI Gateway, and deployment services are Vercel products, services, or frameworks.

`Lily → Agent primitive → implementation/framework: Eve → Provider: Vercel → selected Vercel runtime/services`

It is invalid to model this as `Lily → Eve Provider`. Lily is the organisational Agent actor; Eve is its current framework; Vercel is the supplier boundary. Replacing Eve need not replace Lily or the Company Stewardship Capability.

GitHub is the Provider organisation. Repositories, Actions, Checks, Rulesets, and Apps/API are GitHub products or features. They may implement different primitive-family responsibilities, but that does not create GitHub Actions, GitHub Checks, or GitHub Rulesets Providers.

## Invalid product-shaped Provider identities

Unless the supplying organisational boundary is genuinely distinct, these are invalid:

- `provider-eve`
- `provider-github-actions`
- `provider-vercel-functions`
- `provider-azure-openai`
- `provider-github-checks`

Before creating a Provider, identify the supplying organisation. If the proposed Provider is merely a product, service, framework, SDK, or feature of an existing Provider organisation, do not create a new Provider. Model it as an implementation/product beneath that Provider.

Names alone cannot prove organisational ownership. Semantic review must inspect explicit declarations and evidence; deterministic rules must not guess legal entities from package names.

## Required authoring declaration and schema gap

Until the manifest contract is versioned to carry this distinction, every Provider package README and review submission must state:

- Provider organisation/legal or supplying entity;
- canonical Provider ID;
- supported primitive families;
- products, services, frameworks, or SDKs used for each family.

`provider-package.schema.json` v1 has no fields for supplying organisation or per-family implementation products. Adding required fields to v1 would be a breaking contract change. The smallest future extension is a versioned manifest revision with an `organisation` identity and an `implementations` map keyed by primitive family. Until that revision is coordinated across producers, consumers, examples, and conformance, this distinction is enforced by authoring requirements and semantic review rather than unreliable name inference.
