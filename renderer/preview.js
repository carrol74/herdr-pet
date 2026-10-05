function previewText(text) {
  return String(text || "").split(/\r?\n/).map((line) => line.trim())
    .filter(Boolean).slice(-2).map((line) => Array.from(line).slice(0, 180).join("")).join("\n");
}

function insertTranscript(text, start, end, transcript, limit = 4000) {
  const available = Math.max(0, limit - (text.length - (end - start)));
  const inserted = String(transcript).slice(0, available);
  return { text: text.slice(0, start) + inserted + text.slice(end), cursor: start + inserted.length };
}

if (typeof module !== "undefined") module.exports = { previewText, insertTranscript };
