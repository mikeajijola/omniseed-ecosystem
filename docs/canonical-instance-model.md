# Canonical OmniSeed instance model

An OmniSeed instance is a particular company definition, its desired state, governed history, realisations, Provider bindings, and observed state being managed and reconciled by OmniSeed.

The company is the durable identity. An engine process, OS deployment, URL, steward session, and hosting project are replaceable realisations or interfaces.

## Authority and state

Every production company declares one HTTPS Git repository, merged branch, Omniform path, and pull-request change mode. The merged declaration is approved desired state. OmniSeed stores plans, proposals, deployed resources, observations, evidence, and activity separately. For a Git-backed company, applying an approved Company Change submits a branch and pull request; it does not replace desired state in runtime storage.

## Explainable realisation

The required trace is:

`Capability → requirement → named Realisation → primitive resource → primitive family → selected Provider → Provider product/service/framework → observed resource → evidence`

Providers advertise primitive-family contracts. They never directly claim arbitrary business Capabilities. Actors, including people, AI agents, software, machines, and external organisations, participate through primitive resources and remain replaceable.

Provider identity means the supplying organisation, as defined by [Provider semantics](provider-semantics.md). Thus Lily is an Agent primitive participant implemented using Vercel's Eve framework; Vercel is the Provider. GitHub Actions and Checks are products beneath the GitHub Provider, not separate Providers.

Provisioned model inference is independently inspectable through the `inference` primitive family. For a direct Gemini binding, Lily remains the Agent actor, Google is the inference Provider, Gemini API and the selected model remain implementation choices, and LiteLLM remains a framework. Replacing any of those lower-level choices does not redefine Company Stewardship or Lily's organisational identity.

## Steward and interfaces

Company Stewardship is a company Capability. Lily is the first declared Agent participant for the OmniSeed Ecosystem company, with organisational identity separate from runtime Provider/model configuration. A governed steward resolves company context and invokes the same declared OmniSeed operations as OS, CLI, API, or another actor. It cannot self-escalate.

OmniSeed OS is an optional human-interface realisation. It discovers the declared steward and projects engine state; it does not create company truth. A headless company remains valid.

## Reference company boundary

`omniseed-ecosystem` continues to own cross-repository constitution and conformance. `omniseed-ecosystem-company` owns the desired definition for the real OmniSeed Ecosystem company. This keeps reusable public machinery independent of the company that consumes it.
