class PromptState {
  constructor() {
    this.drafts = new Map();
    this.pending = null;
  }

  key(target) {
    return JSON.stringify([target.session, target.paneId]);
  }

  read(target) {
    return this.drafts.get(this.key(target)) || "";
  }

  save(target, text) {
    this.drafts.set(this.key(target), text);
  }

  begin(target) {
    if (this.pending !== null || !this.read(target).trim()) return false;
    this.pending = this.key(target);
    return true;
  }

  finish(success) {
    if (success && this.pending !== null) this.drafts.delete(this.pending);
    this.pending = null;
  }

  get sending() {
    return this.pending !== null;
  }
}

function insertTranscript(text, start, end, transcript, limit = 4000) {
  const available = Math.max(0, limit - (text.length - (end - start)));
  const inserted = String(transcript).slice(0, available);
  return { text: text.slice(0, start) + inserted + text.slice(end), cursor: start + inserted.length };
}

if (typeof module !== "undefined") module.exports = { PromptState, insertTranscript };
