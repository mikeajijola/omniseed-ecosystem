import test from "node:test";
import assert from "node:assert/strict";
import { compareAuthorities, observeAuthorities, resolveAuthority } from "../src/authority.js";

const authority = { url: "https://github.com/mikeajijola/omnicede.git", ref: "refs/heads/master" };
const revision = "a".repeat(40);
test("resolve the exact declared canonical ref, including master", () => {
  assert.equal(resolveAuthority(authority, (command, args) => {
    assert.equal(command, "git");
    assert.deepEqual(args, ["ls-remote", "--exit-code", authority.url, "refs/heads/master"]);
    return `${revision}\trefs/heads/master\n`;
  }), revision);
});
test("ambiguous, missing and substituted authority observations fail closed", () => {
  for (const output of ["", `${revision}\trefs/heads/main`, `${revision}\trefs/heads/master\n${revision}\trefs/heads/master`]) {
    assert.throws(() => resolveAuthority(authority, () => output));
  }
  assert.throws(() => resolveAuthority({ ...authority, url: "--upload-pack=unexpected" }));
  assert.deepEqual(observeAuthorities({ provider_omnicede: authority }, () => { throw Error("credential-bearing transport failure"); }), {
    provider_omnicede: { ...authority, status: "unavailable" }
  });
});
test("freshness requires every exact remote head before and after execution", () => {
  const subjects = [{ id: "provider_omnicede", revision }];
  const before = { provider_omnicede: { ...authority, revision } };
  assert.equal(compareAuthorities(subjects, before, before), "current");
  assert.equal(compareAuthorities(subjects, before, { provider_omnicede: { revision: "b".repeat(40) } }), "stale");
  assert.equal(compareAuthorities([{ ...subjects[0], revision: "b".repeat(40) }], before, before), "stale");
  assert.equal(compareAuthorities([...subjects, { id: "provider_google", revision }], before, before), "indeterminate");
  assert.equal(compareAuthorities(subjects, before, {}), "indeterminate");
  assert.equal(compareAuthorities(subjects, null, before), "indeterminate");
  assert.equal(compareAuthorities(subjects, before, { ...before, undeclared: { revision } }), "indeterminate");
});
