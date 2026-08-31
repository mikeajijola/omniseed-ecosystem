import { readFile, writeFile } from "node:fs/promises";
import { parse } from "yaml";
import Ajv2020 from "ajv/dist/2020.js";

const root = new URL("./", import.meta.url), source = parse(await readFile(new URL("catalogue.yaml", root), "utf8"));
const schema = JSON.parse(await readFile(new URL("catalogue.schema.json", root), "utf8"));
const validate = new Ajv2020({ allErrors: true }).compile(schema);
if (!validate(source)) throw new Error(validate.errorsText(validate.errors));
const ids = source.entries.map(item => item.id), names = source.entries.map(item => item.name.toLowerCase());
if (new Set(ids).size !== ids.length) throw new Error("Duplicate capability ID");
if (new Set(names).size !== names.length) throw new Error("Duplicate capability name; semantic overlaps require review");
for (const item of source.entries) if (/github|google|vercel|neon|provider|agent|saas/i.test(`${item.outcome} ${item.requirements.join(" ")}`)) throw new Error(`${item.id} leaks an actor, Provider, or product`);
const groups = Map.groupBy(source.entries, item => item.domain);
const markdown = `# Business capability catalogue\n\nVersion ${source.catalogueVersion}. This is reference knowledge, not a running company's desired state. Companies copy selected IDs and specialise their requirements in canonical Omniform; this repository is never a runtime dependency.\n\n${[...groups].map(([domain, entries]) => `## ${domain.replaceAll("_", " ")}\n\n${entries.map(item => `- **${item.id} — ${item.name}:** ${item.outcome}`).join("\n")}`).join("\n\n")}\n`;
const target = new URL("README.md", root);
if (process.argv.includes("--check")) {
  const current = await readFile(target, "utf8");
  if (current !== markdown) throw new Error("Generated catalogue documentation is stale; run npm run catalogue:generate");
} else await writeFile(target, markdown);
