import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "yaml";
import { checkCatalogue, validateCatalogue } from "../../capabilities/generate.mjs";

const fixtures = join(import.meta.dirname, "fixtures/catalogue");
const schema = JSON.parse(await readFile(join(import.meta.dirname, "../../capabilities/catalogue.schema.json"), "utf8"));

async function fixture(name) {
  return parse(await readFile(join(fixtures, `${name}.yaml`), "utf8"));
}

test("the committed capability reference catalogue validates and its generated documentation is fresh", async () => {
  await checkCatalogue({ checkFreshness: true });
});

for (const [name, expected] of [
  ["schema-invalid", /schema validation failed.*required property.*outcome/i],
  ["duplicate-id", /duplicate capability reference catalogue ID/i],
  ["duplicate-name", /duplicate capability reference catalogue name/i],
  ["leaking-id", /field id leaks an actor, Provider, product, or implementation choice/i],
  ["leaking-name", /field name leaks an actor, Provider, product, or implementation choice/i],
  ["leaking-requirement", /field requirements leaks an actor, Provider, product, or implementation choice/i]
]) {
  test(`catalogue rejects fixture: ${name}`, async () => {
    const source = await fixture(name);
    assert.throws(() => validateCatalogue(source, schema), expected);
  });
}
