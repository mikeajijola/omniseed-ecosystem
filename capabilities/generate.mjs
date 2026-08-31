import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import Ajv2020 from "ajv/dist/2020.js";

const root = new URL("./", import.meta.url);
const forbiddenImplementationLanguage = /github|google|vercel|neon|provider|actor|agent|implementation|saas/i;

export function validateCatalogue(source, schema) {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  if (!validate(source)) throw new Error(`Capability reference catalogue schema validation failed: ${ajv.errorsText(validate.errors)}`);
  const ids = source.entries.map(item => item.id);
  const names = source.entries.map(item => item.name.toLocaleLowerCase("en"));
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate capability reference catalogue ID");
  if (new Set(names).size !== names.length) throw new Error("Duplicate capability reference catalogue name; semantic overlaps require review");
  for (const item of source.entries) {
    for (const [field, value] of Object.entries(item)) {
      const values = Array.isArray(value) ? value : [value];
      if (values.some(candidate => typeof candidate === "string" && forbiddenImplementationLanguage.test(candidate))) {
        throw new Error(`${item.id} field ${field} leaks an actor, Provider, product, or implementation choice`);
      }
    }
  }
  return source;
}

export function catalogueMarkdown(source) {
  const groups = Map.groupBy(source.entries, item => item.domain);
  return `# Company capability reference catalogue\n\nVersion ${source.catalogueVersion}. This governance-owned catalogue is reference knowledge, not canonical company desired state. Companies may record selected IDs as provenance while declaring and specialising their own capabilities in canonical Omniform; this repository is never a runtime dependency.\n\n${[...groups].map(([domain, entries]) => `## ${domain.replaceAll("_", " ")}\n\n${entries.map(item => `- **${item.id} — ${item.name}:** ${item.outcome}`).join("\n")}`).join("\n\n")}\n`;
}

export async function checkCatalogue({ checkFreshness = false } = {}) {
  const source = parse(await readFile(new URL("catalogue.yaml", root), "utf8"));
  const schema = JSON.parse(await readFile(new URL("catalogue.schema.json", root), "utf8"));
  validateCatalogue(source, schema);
  const markdown = catalogueMarkdown(source);
  const target = new URL("README.md", root);
  if (checkFreshness) {
    const current = await readFile(target, "utf8");
    if (current !== markdown) throw new Error("Generated capability reference catalogue documentation is stale; run npm run catalogue:generate");
  } else await writeFile(target, markdown);
  return markdown;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await checkCatalogue({ checkFreshness: process.argv.includes("--check") });
}
