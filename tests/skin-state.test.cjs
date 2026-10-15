const { test } = require("node:test");
const assert = require("node:assert/strict");
const { skinStateKey } = require("../renderer/skins.js");

test("list selection does not restart the aggregate waiting animation", () => {
  const snapshot = {
    connection: "online", mood: "attention", session: "default",
    agents: [
      { paneId: "waiting", status: "blocked", statusSinceMs: 10 },
      { paneId: "idle", status: "idle", statusSinceMs: 20 },
    ],
  };
  const key = skinStateKey({ ...snapshot, subject: snapshot.agents[0] });
  assert.equal(skinStateKey({ ...snapshot, subject: snapshot.agents[1] }), key);
  assert.equal(skinStateKey({ ...snapshot, agents: [snapshot.agents[0], { ...snapshot.agents[1], statusSinceMs: 30 }] }), key);
  assert.notEqual(skinStateKey({ ...snapshot, agents: [...snapshot.agents, { paneId: "new", status: "blocked", statusSinceMs: 40 }] }), key);
});
