const { test } = require("node:test");
const assert = require("node:assert/strict");
const { themeVariables, resolveTheme, selectedTheme } = require("../renderer/theme.js");

test("theme variables preserve light colors and readable accent labels", () => {
  const variables = themeVariables({ colors: { background: "#eff1f5", text: "#4c4f69", accent: "#f5c2e7", blocked: "#111111" } });
  assert.equal(variables["--pet-background"], "#eff1f5");
  assert.equal(variables["--pet-text"], "#4c4f69");
  assert.equal(variables["--pet-on-accent"], "#000000");
  assert.equal(variables["--pet-on-blocked"], "#ffffff");
});

test("manual selection survives changing observed themes", () => {
  const chosen = resolveTheme("gruvbox-light", { name: "other", colors: { background: "#000000" } });
  assert.equal(chosen.name, "gruvbox-light");
  assert.deepEqual(resolveTheme("gruvbox-light", null), chosen);
  assert.deepEqual(resolveTheme("gruvbox-light", { name: "changed" }), chosen);
});

test("automatic themes fill unavailable colors without overwriting observed colors", () => {
  const fallback = resolveTheme("auto", null);
  const observed = resolveTheme("auto", { name: "custom", colors: { accent: "#123456", background: null } });
  assert.equal(observed.colors.accent, "#123456");
  assert.equal(observed.colors.background, fallback.colors.background);
  assert.equal(observed.name, "custom");
  assert.equal(selectedTheme("removed-theme"), "auto");
});

test("unavailable or invalid colors do not introduce stale theme variables", () => {
  assert.deepEqual(themeVariables(null), {});
  assert.deepEqual(themeVariables({ colors: { accent: "url(example)", text: null, background: "#xyzxyz", unexpected: "#ffffff" } }), {});
});

