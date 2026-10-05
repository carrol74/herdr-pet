const { test } = require("node:test");
const assert = require("node:assert/strict");
const { previewText, insertTranscript } = require("../renderer/preview.js");

test("preview keeps the final nonempty terminal lines without HTML interpretation", () => {
  assert.equal(previewText("Earlier\n\n  最新输出  \r\n <script>text</script>\n\n"), "最新输出\n<script>text</script>");
  assert.equal(previewText("\n  \n"), "");
  assert.equal(Array.from(previewText("🙂".repeat(200))).length, 180);
});

test("dictation replaces the original selection and preserves surrounding draft", () => {
  assert.deepEqual(insertTranscript("Please FIX now", 7, 10, "修复这个问题"), { text: "Please 修复这个问题 now", cursor: 13 });
  assert.deepEqual(insertTranscript("abc", 1, 1, "XYZ", 5), { text: "aXYbc", cursor: 3 });
});
