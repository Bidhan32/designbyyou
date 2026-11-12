import test from "node:test";
import assert from "node:assert/strict";
import { requestSession } from "../src/context/sessionRequest.js";

function storage() {
  const values = new Map([["token", "original"], ["user", '{"id":"owner"}']]);
  return { getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
}
for (const status of [undefined, 429, 500, 503]) {
  test(`temporary failure ${status} retains credentials`, async () => {
    const saved = storage();
    await assert.rejects(requestSession({ get: async () => { throw { response: { status } }; } }, saved));
    assert.equal(saved.getItem("token"), "original");
    assert.equal(saved.getItem("user"), '{"id":"owner"}');
  });
}
test("rejected credentials clear the session", async () => {
  const saved = storage();
  assert.equal(await requestSession({ get: async () => { throw { response: { status: 401 } }; } }, saved), null);
  assert.equal(saved.getItem("token"), null);
  assert.equal(saved.getItem("user"), null);
});
test("malformed success does not destroy credentials", async () => {
  const saved = storage();
  await assert.rejects(requestSession({ get: async () => ({ data: {} }) }, saved));
  assert.equal(saved.getItem("token"), "original");
});
test("suspension clears credentials", async () => {
  const saved = storage();
  const user = await requestSession({ get: async () => {
    throw { response: { status: 403, data: { code: "ACCOUNT_SUSPENDED" } } };
  } }, saved);
  assert.equal(user, null);
  assert.equal(saved.getItem("token"), null);
  assert.equal(saved.getItem("user"), null);
});
test("a stale failure cannot clear a newer login", async () => {
  const saved = storage();
  assert.equal(await requestSession({ get: async () => {
    saved.setItem("token", "new-login");
    throw { response: { status: 401 } };
  } }, saved), undefined);
  assert.equal(saved.getItem("token"), "new-login");
});
test("a stale response cannot overwrite a newer login", async () => {
  const saved = storage();
  const result = await requestSession({ get: async () => {
    saved.setItem("token", "new-login");
    return { data: { status: "success", data: { id: "old-user" } } };
  } }, saved);
  assert.equal(result, undefined);
  assert.equal(saved.getItem("token"), "new-login");
  assert.equal(saved.getItem("user"), '{"id":"owner"}');
});
test("a successful retry restores the verified profile", async () => {
  const saved = storage();
  const user = { id: "verified-user", role: "creator" };
  assert.deepEqual(await requestSession({ get: async () => ({ data: { status: "success", data: user } }) }, saved), user);
  assert.deepEqual(JSON.parse(saved.getItem("user")), user);
});
