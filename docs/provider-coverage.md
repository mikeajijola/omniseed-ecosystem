# Provider coverage reporting

Run `npm run providers:coverage -- --provider ../provider-a --provider ../provider-b --company ../omniseed-ecosystem-company`. Each Provider directory must contain a schema-conformant `provider-package.json`. The JSON and Markdown projections are generated from the same normalized data.

A manifest is an implementation claim, not runtime truth. `manifest_valid` means only that the claim passed ecosystem conformance. Live acceptance evidence must be attached by an evidence-producing acceptance process and is never inferred. Runtime assembly and health belong to Engine/runtime diagnostics.

Use `--fail-on-gap` for reference-company CI when every selected Provider repository is supplied. A gap says no compatible claim was found; it does not require every Provider to implement every primitive family. Contributors must list only implemented families, keep product names beneath the supplying organisation, and state the compatible Engine Provider protocol.
