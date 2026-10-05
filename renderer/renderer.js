const GAP = 8;
const MARGIN = 6;
const HOVER_EXIT_DELAY = 160;
const DEFAULT_LAYOUT = { petLeft: 12, petTop: Math.max(0, innerHeight - document.getElementById("pet").offsetHeight - 12) };

let currentTheme = null;
let themeSelection = selectedTheme(localStorage.getItem("herdr-pet-theme"));

function applyTheme(observed) {
  const theme = resolveTheme(themeSelection, observed);
  const signature = JSON.stringify(theme || null);
  if (signature === currentTheme) return;
  currentTheme = signature;
  document.documentElement.style.colorScheme = themeContrast(theme.colors.background) === "#000000" ? "light" : "dark";
  for (const role of [...PET_THEME_ROLES, "on-accent", "on-blocked"]) {
    document.documentElement.style.removeProperty(`--pet-${role}`);
  }
  for (const [property, color] of Object.entries(themeVariables(theme))) {
    document.documentElement.style.setProperty(property, color);
  }
}

let language = petLanguage(localStorage.getItem("herdr-pet-language"), navigator.language);
const t = (key) => PET_TRANSLATIONS[language][key];
const errorLabel = (error) => petError(error, language);

const pet = document.getElementById("pet");
let skinSelection = selectedSkin(localStorage.getItem("herdr-pet-skin"));
const petSkin = new PetSkin(pet, skinSelection);
const bubble = document.getElementById("bubble");
const bubbleContent = document.getElementById("bubble-content");
const offline = document.getElementById("offline");
const attentionCount = document.getElementById("attention-count");
const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

let state = {
  connection: "offline",
  mood: "offline",
  subject: null,
  agents: [],
  blockedCount: 0,
  session: "default",
  sessions: [],
  offlineReason: null,
};
let layout = { ...DEFAULT_LAYOUT };
let hovered = false;
let bubbleHovered = false;
let hideTimer = null;
let dragging = false;
let promptTarget = null;
let actionError = null;
let actionNotice = false;
const composer = new PromptState();
let voice = null;
let voiceSequence = 0;
let previewPane = null;
let preview = { key: null, phase: "idle", text: "", updatedAt: 0 };
let previewPending = false;


function updateLanguage() {
  document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  bubble.setAttribute("aria-label", t("region"));
  pet.setAttribute("aria-label", t("pet"));
  attentionCount.setAttribute("aria-label", t("attention"));
  offline.textContent = t("offline");
}

function bubbleHeader(title, withBack = false) {
  const header = document.createElement("div");
  header.className = "bubble-header";
  if (withBack) {
    const back = document.createElement("button");
    back.type = "button";
    back.className = "bubble-back";
    back.textContent = "<";
    back.title = t("back");
    back.setAttribute("aria-label", t("back"));
    back.disabled = composer.sending;
    back.addEventListener("click", closePrompt);
    header.append(back);
  }
  header.append(createLine(title, "bubble-title"));
  const menu = document.createElement("button");
  menu.type = "button";
  menu.className = "bubble-menu";
  menu.textContent = "⋯";
  menu.title = t("settings");
  menu.setAttribute("aria-label", t("settings"));
  menu.disabled = composer.sending || voice !== null;
  menu.addEventListener("click", () => {
    const rect = menu.getBoundingClientRect();
    invoke("show_settings_menu", {
      english: language === "en",
      theme: themeSelection,
      skin: skinSelection,
      menuX: rect.left,
      menuY: rect.bottom,
    }).catch((error) => {
      actionError = String(error);
      showBubble();
    });
  });
  header.append(menu);
  return header;
}

function draw() {
  petSkin.update(state);
  offline.classList.toggle("hidden", state.connection !== "offline");
  attentionCount.classList.toggle("hidden", !state.blockedCount);
  attentionCount.textContent = state.blockedCount > 9 ? "9+" : String(state.blockedCount || "");
}

function applyLayout(next) {
  layout = {
    petLeft: clamp(Number.isFinite(next?.petLeft) ? next.petLeft : DEFAULT_LAYOUT.petLeft, 0, Math.max(0, innerWidth - pet.offsetWidth)),
    petTop: clamp(Number.isFinite(next?.petTop) ? next.petTop : DEFAULT_LAYOUT.petTop, 0, Math.max(0, innerHeight - pet.offsetHeight)),
  };
  pet.style.left = `${layout.petLeft}px`;
  pet.style.top = `${layout.petTop}px`;
  attentionCount.style.left = `${layout.petLeft + pet.offsetWidth - 11}px`;
  attentionCount.style.top = `${Math.max(0, layout.petTop - 4)}px`;
  offline.style.left = `${layout.petLeft}px`;
  const below = layout.petTop + pet.offsetHeight + 3;
  offline.style.top = `${below + 12 <= innerHeight ? below : Math.max(0, layout.petTop - 13)}px`;
  if (bubble.classList.contains("visible")) positionBubble();
}

function elapsedLabel(sinceMs) {
  const seconds = Math.max(0, Math.floor((Date.now() - sinceMs) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function createLine(text, className = "bubble-line") {
  const element = document.createElement("div");
  element.className = className;
  element.textContent = text;
  return element;
}

function renderOverview() {
  const scrollTop = bubbleContent.querySelector(".agent-list")?.scrollTop || 0;
  const focused = document.activeElement?.dataset;
  const focusedPane = focused?.pane;
  const focusedAction = focused?.action;
  const sessionLabel = state.sessions.length > 1 && state.session !== "custom" ? state.session : null;
  if (!state.agents?.length) {
    bubbleContent.replaceChildren(
      bubbleHeader(state.offlineReason ? errorLabel(state.offlineReason) : t("empty")),
      ...(sessionLabel ? [createLine(sessionLabel)] : []),
    );
    bubbleContent.scrollTop = scrollTop;
    return;
  }

  const agentCount = language === "zh" ? `${state.agents.length} ${t("agentCount")}` : `${state.agents.length} agent${state.agents.length === 1 ? "" : "s"}`;
  const title = bubbleHeader(sessionLabel ? `${sessionLabel} · ${agentCount}` : agentCount);
  const rows = state.agents.map((agent) => {
    const row = document.createElement("div");
    row.className = "agent-row";
    if (agent.paneId === state.subject?.paneId) row.classList.add("selected");

    const dot = document.createElement("span");
    dot.className = `status-dot status-${agent.status}`;
    const details = document.createElement("span");
    details.className = "agent-details";
    const heading = createLine(agent.agent || "agent", "agent-heading");
    const status = createLine(t(agent.status) || agent.status, `agent-status status-label-${agent.status}`);
    heading.append(status);
    const subtitle = document.createElement("div");
    subtitle.className = "agent-subtitle";
    const description = document.createElement("span");
    description.textContent = agent.title || agent.cwd || agent.paneId;
    const elapsed = document.createElement("span");
    elapsed.className = "agent-elapsed";
    elapsed.dataset.since = String(agent.statusSinceMs);
    elapsed.textContent = elapsedLabel(agent.statusSinceMs);
    subtitle.append(description, " · ", elapsed);
    details.append(heading, subtitle);
    const message = document.createElement("button");
    message.type = "button";
    message.dataset.pane = agent.paneId;
    message.dataset.action = "message";
    message.className = "agent-message";
    message.setAttribute("aria-label", `${t("message")} · ${agent.agent || "agent"}`);
    message.title = t("message");
    message.addEventListener("click", (event) => {
      event.stopPropagation();
      promptTarget = { ...agent, session: state.session };
      showBubble();
    });
    const focus = document.createElement("button");
    focus.type = "button";
    focus.className = "agent-focus";
    focus.dataset.pane = agent.paneId;
    focus.dataset.action = "focus";
    focus.title = t("focus");
    focus.append(dot, details);
    row.append(focus, message);
    const selectPreview = () => {
      previewPane = agent.paneId;
      refreshPreview();
    };
    row.addEventListener("mouseenter", selectPreview);
    row.addEventListener("focusin", selectPreview);
    const focusAgent = () => {
      invoke("focus_agent", { paneId: agent.paneId }).catch((error) => {
        actionError = String(error);
        showBubble();
      });
    };
    focus.addEventListener("click", focusAgent);
    return row;
  });
  const content = [title];
  if (actionError) content.push(createLine(errorLabel(actionError), actionNotice ? "action-notice" : "action-error"));
  const list = document.createElement("div");
  list.className = "agent-list";
  list.append(...rows);
  content.push(list);
  if (state.blockedCount) content.push(createLine(`${state.blockedCount} ${t("attentionSummary")}`, "overview-summary"));
  const output = document.createElement("section");
  output.className = "preview-card";
  output.append(createLine(t("recentOutput"), "preview-label"), createLine("", "preview-text"));
  content.push(output);
  bubbleContent.replaceChildren(...content);
  updatePreviewDisplay();
  list.scrollTop = scrollTop;
  if (focusedPane) {
    [...list.querySelectorAll("button")].find((button) =>
      button.dataset.pane === focusedPane && button.dataset.action === focusedAction
    )?.focus({ preventScroll: true });
  }
}

function voiceBusy() {
  return voice !== null;
}

function buttonIcon(button, kind) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(svg.namespaceURI, "path");
  path.setAttribute("d", kind === "microphone"
    ? "M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm-7-3a7 7 0 0 0 14 0M12 19v3M8 22h8"
    : "M12 19V5M6 11l6-6 6 6");
  svg.append(path);
  button.replaceChildren(svg);
}

function cancelVoice() {
  if (!voice) return;
  const id = voice.id;
  voice = null;
  invoke("voice_cancel", { id }).catch(() => {});
  document.getElementById("prompt-form")?.dispatchEvent(new Event("voice-cancelled"));
  document.getElementById("prompt-form")?.dispatchEvent(new Event("voice-change"));
  if (promptTarget) positionBubble();
}

function renderPrompt() {
  if (document.getElementById("prompt-form")) return;
  const target = promptTarget;
  const form = document.createElement("form");
  form.id = "prompt-form";
  const title = bubbleHeader(`${t("to")} ${target.agent || "agent"}`, true);
  const destination = document.createElement("div");
  destination.className = "prompt-target-card";
  const targetStatus = createLine(t(target.status), `agent-status status-label-${target.status}`);
  const destinationText = target.title || target.cwd || target.paneId;
  const sessionLabel = state.sessions.length > 1 && target.session !== "custom" ? target.session : null;
  const task = createLine(sessionLabel ? `${sessionLabel} · ${destinationText}` : destinationText, "prompt-destination");
  task.title = task.textContent;
  destination.append(task, targetStatus);
  const input = document.createElement("textarea");
  input.id = "prompt-input";
  input.rows = 5;
  input.maxLength = 4000;
  input.placeholder = t("placeholder");
  input.setAttribute("aria-label", t("input"));
  input.value = composer.read(target);
  const feedback = createLine("", "prompt-feedback");
  feedback.setAttribute("role", "status");
  const count = createLine("", "prompt-count");
  const hint = createLine(t("hint"), "prompt-hint");
  const footer = document.createElement("div");
  footer.className = "prompt-footer";
  footer.append(hint, count);
  const editor = document.createElement("div");
  editor.className = "prompt-editor";
  const toolbar = document.createElement("div");
  toolbar.className = "prompt-toolbar";
  const mic = document.createElement("button");
  mic.type = "button";
  mic.className = "prompt-mic";
  buttonIcon(mic, "microphone");
  mic.setAttribute("aria-label", t("voiceInput"));
  mic.title = t("localVoice");
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "prompt-send";
  buttonIcon(submit, "send");
  submit.setAttribute("aria-label", t("send"));
  submit.title = t("send");
  toolbar.append(mic, submit);
  editor.append(input, toolbar);
  const voicePanel = document.createElement("div");
  voicePanel.className = "voice-panel hidden";
  const voiceText = createLine("", "voice-status");
  const meter = document.createElement("meter");
  meter.min = 0;
  meter.max = 1;
  meter.value = 0;
  meter.setAttribute("aria-label", t("recording"));
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "voice-cancel";
  cancel.textContent = t("cancelVoice");
  cancel.addEventListener("click", cancelVoice);
  voicePanel.append(voiceText, meter, cancel);
  form.append(title, destination, editor, voicePanel, footer, feedback);
  bubbleContent.replaceChildren(form);

  const update = () => {
    composer.save(target, input.value);
    const busy = voiceBusy();
    count.textContent = `${input.value.length} / ${input.maxLength}`;
    submit.disabled = composer.sending || busy || !input.value.trim() || state.session !== target.session;
    mic.disabled = composer.sending || (busy && voice.phase !== "recording");
    mic.classList.toggle("recording", voice?.phase === "recording");
    mic.setAttribute("aria-label", t(voice?.phase === "recording" ? "stopRecording" : "voiceInput"));
    mic.title = t(voice?.phase === "recording" ? "stopRecording" : "localVoice");
    title.querySelector(".bubble-menu").disabled = composer.sending || busy;
    input.readOnly = composer.sending || busy;
    voicePanel.classList.toggle("hidden", !busy);
    if (busy) {
      const labels = { preparing: "voicePreparing", permission: "voicePermission", downloading: "voiceDownloading", loading: "voiceLoading", recording: "recording", stopping: "voiceTranscribing", transcribing: "voiceTranscribing" };
      voiceText.textContent = t(labels[voice.phase] || "voicePreparing");
      if (voice.phase === "downloading" && Number.isFinite(voice.progress)) voiceText.textContent += ` · ${Math.round(voice.progress * 100)}%`;
      if (voice.phase === "recording") voiceText.textContent += ` · ${Math.floor(voice.seconds || 0)} / 60s`;
      meter.hidden = voice.phase !== "recording";
      meter.value = Math.min(1, (voice.level || 0) * 4);
    }
  };
  form.addEventListener("voice-change", update);
  form.addEventListener("voice-cancelled", () => {
    feedback.textContent = t("voiceCancelled");
    feedback.classList.remove("action-error");
    positionBubble();
  });
  form.addEventListener("voice-result", (event) => {
    const result = event.detail;
    if (result.phase === "complete") {
      const inserted = insertTranscript(input.value, result.start, result.end, result.text || "", input.maxLength);
      input.value = inserted.text;
      input.setSelectionRange(inserted.cursor, inserted.cursor);
      feedback.textContent = t("voiceInserted");
      feedback.classList.remove("action-error");
    } else {
      feedback.textContent = `${t(result.code || "voiceTranscribeError")}${result.detail ? ` ${result.detail}` : ""}`;
      feedback.classList.add("action-error");
    }
    update();
    input.focus();
    positionBubble();
  });
  mic.addEventListener("click", () => {
    if (voice?.phase === "recording") {
      const id = voice.id;
      voice.phase = "stopping";
      update();
      invoke("voice_stop", { id }).catch((error) => {
        cancelVoice();
        feedback.textContent = errorLabel(error);
        feedback.classList.add("action-error");
      });
      return;
    }
    if (voiceBusy() || composer.sending) return;
    voice = { id: ++voiceSequence, phase: "preparing", target, start: input.selectionStart, end: input.selectionEnd };
    feedback.textContent = "";
    update();
    positionBubble();
    const id = voice.id;
    invoke("voice_start", { id, language }).catch((error) => {
      if (voice?.id !== id) return;
      voice = null;
      feedback.textContent = errorLabel(error);
      feedback.classList.add("action-error");
      update();
    });
  });
  input.addEventListener("input", update);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.isComposing) {
      event.preventDefault();
      if (!submit.disabled) form.requestSubmit();
    }
  });
  update();
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (submit.disabled || voiceBusy()) return;
    const text = input.value.trim();
    if (!composer.begin(target)) return;
    title.querySelector(".bubble-back").disabled = true;
    feedback.textContent = t("submitting");
    feedback.classList.remove("action-error");
    update();
    invoke("send_prompt", { paneId: target.paneId, text, session: target.session })
      .then(() => {
        composer.finish(true);
        input.value = "";
        feedback.textContent = t("submitted");
      })
      .catch((error) => {
        composer.finish(false);
        feedback.textContent = errorLabel(error);
        feedback.classList.add("action-error");
      })
      .finally(() => {
        title.querySelector(".bubble-back").disabled = false;
        update();
        positionBubble();
      });
  });
  invoke("set_prompt_active", { active: true })
    .then(() => requestAnimationFrame(() => input.focus()))
    .catch((error) => {
      feedback.textContent = errorLabel(error);
      feedback.classList.add("action-error");
    });
}

function previewTarget() {
  return state.agents.find((agent) => agent.paneId === previewPane) || state.subject || state.agents[0];
}

function updatePreviewDisplay() {
  const node = bubbleContent.querySelector(".preview-text");
  if (!node) return;
  const target = previewTarget();
  const key = target ? JSON.stringify([state.session, target.paneId]) : null;
  const same = preview.key === key;
  node.textContent = same && preview.phase === "ready" ? preview.text || t("previewEmpty")
    : same && preview.phase === "failed" ? t("previewUnavailable") : t("previewLoading");
  node.classList.toggle("preview-placeholder", !same || preview.phase !== "ready" || !preview.text);
  const label = bubbleContent.querySelector(".preview-label");
  if (label && target) label.textContent = `${t("recentOutput")} · ${target.agent || "agent"}`;
}

function refreshPreview() {
  if (!bubble.classList.contains("visible") || promptTarget || !state.agents.length) return;
  const target = previewTarget();
  const session = state.session;
  const key = JSON.stringify([session, target.paneId]);
  updatePreviewDisplay();
  if (previewPending || (preview.key === key && Date.now() - preview.updatedAt < 5000)) return;
  previewPending = true;
  preview = { key, phase: "loading", text: "", updatedAt: Date.now() };
  updatePreviewDisplay();
  invoke("agent_preview", { paneId: target.paneId, session })
    .then((text) => { preview = { key, phase: "ready", text: previewText(text), updatedAt: Date.now() }; })
    .catch(() => { preview = { key, phase: "failed", text: "", updatedAt: Date.now() }; })
    .finally(() => {
      previewPending = false;
      updatePreviewDisplay();
      if (bubble.classList.contains("visible") && !promptTarget) {
        positionBubble();
        if (JSON.stringify([state.session, previewTarget()?.paneId]) !== key) refreshPreview();
      }
    });
}

function updateElapsedLabels() {
  for (const element of bubbleContent.querySelectorAll(".agent-elapsed")) {
    element.textContent = elapsedLabel(Number(element.dataset.since));
  }
}

function positionBubble() {
  const petRect = pet.getBoundingClientRect();
  const previousVisibility = bubble.style.visibility;
  bubble.style.visibility = "hidden";
  bubbleContent.style.maxHeight = "none";
  const naturalHeight = bubbleContent.getBoundingClientRect().height;
  const spaceAbove = petRect.top - GAP - MARGIN;
  const spaceBelow = innerHeight - petRect.bottom - GAP - MARGIN;
  const above = spaceAbove >= naturalHeight || (spaceBelow < naturalHeight && spaceAbove >= spaceBelow);
  const availableHeight = Math.max(1, above ? spaceAbove : spaceBelow);
  bubbleContent.style.maxHeight = `${Math.floor(availableHeight)}px`;
  const bubbleRect = bubble.getBoundingClientRect();
  const left = clamp(
    petRect.left + petRect.width / 2 - bubbleRect.width / 2,
    MARGIN,
    Math.max(MARGIN, innerWidth - bubbleRect.width - MARGIN),
  );
  const top = above ? petRect.top - GAP - bubbleRect.height : petRect.bottom + GAP;
  bubble.dataset.side = above ? "above" : "below";
  bubble.style.left = `${Math.round(left)}px`;
  bubble.style.top = `${Math.round(clamp(top, MARGIN, Math.max(MARGIN, innerHeight - bubbleRect.height - MARGIN)))}px`;
  bubble.style.setProperty(
    "--tail-x",
    `${Math.round(clamp(petRect.left + petRect.width / 2 - left, 14, bubbleRect.width - 14))}px`,
  );
  bubble.style.visibility = previousVisibility;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(value, maximum));
}

function showBubble() {
  if (dragging) return;
  cancelBubbleHide();
  if (promptTarget) {
    renderPrompt();
  } else {
    renderOverview();
  }
  bubble.classList.add("visible");
  positionBubble();
  refreshPreview();
}

function cancelBubbleHide() {
  if (hideTimer !== null) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
}

function hideBubble(force = false) {
  cancelBubbleHide();
  if (force || (!promptTarget && !hovered && !bubbleHovered)) {
    bubble.classList.remove("visible");
  }
}

function scheduleBubbleHide() {
  cancelBubbleHide();
  if (promptTarget) return;
  hideTimer = setTimeout(() => {
    hideTimer = null;
    hideBubble();
  }, HOVER_EXIT_DELAY);
}

function closePrompt() {
  if (composer.sending) return;
  cancelVoice();
  const wasActive = promptTarget !== null;
  promptTarget = null;
  if (wasActive) bubbleContent.replaceChildren();
  if (wasActive) invoke("set_prompt_active", { active: false });
  if (hovered || bubbleHovered) showBubble();
  else hideBubble(true);
}

function finishDrag() {
  if (!dragging) return;
  dragging = false;
  pet.classList.remove("dragging");
  petSkin.settle();
}

pet.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  if (composer.sending) return;
  event.preventDefault();
  dragging = true;
  bubbleHovered = false;
  closePrompt();
  hideBubble(true);
  pet.classList.add("dragging");
  invoke("start_drag").catch(finishDrag);
});

pet.addEventListener("pointerup", finishDrag);
pet.addEventListener("pointercancel", finishDrag);

pet.addEventListener("dblclick", () => {
  if (composer.sending) return;
  if (state.subject) invoke("focus_agent", { paneId: state.subject.paneId });
});

pet.addEventListener("contextmenu", (event) => event.preventDefault());

pet.addEventListener("mouseenter", () => {
  hovered = true;
  if (!dragging) showBubble();
});

pet.addEventListener("pointermove", (event) => {
  if (dragging) return;
  const rect = pet.getBoundingClientRect();
  pet.style.setProperty("--look-x", `${Math.max(-3, Math.min(3, (event.clientX - rect.left - rect.width / 2) / (rect.width / 6)))}px`);
});

pet.addEventListener("mouseleave", () => {
  pet.style.removeProperty("--look-x");
  hovered = false;
  scheduleBubbleHide();
});

bubble.addEventListener("mouseenter", () => {
  bubbleHovered = true;
  cancelBubbleHide();
});

bubble.addEventListener("mouseleave", () => {
  bubbleHovered = false;
  scheduleBubbleHide();
});

listen("pet-language", (event) => {
  if (voiceBusy()) return;
  if (composer.sending || !["en", "zh"].includes(event.payload)) return;
  language = event.payload;
  localStorage.setItem("herdr-pet-language", language);
  updateLanguage();
  bubbleContent.replaceChildren();
  if (bubble.classList.contains("visible")) showBubble();
});

window.addEventListener("resize", () => bubble.classList.contains("visible") && positionBubble());
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !event.isComposing) closePrompt();
});

listen("pet-state", (event) => {
  state = event.payload;
  if (voice && voice.target.session !== state.session) cancelVoice();
  document.getElementById("prompt-form")?.dispatchEvent(new Event("voice-change"));
  applyTheme(state.theme);
  draw();
  if ((hovered || bubbleHovered) && !promptTarget && !dragging) showBubble();
});

listen("pet-layout", (event) => {
  applyLayout(event.payload);
  finishDrag();
});
listen("pet-drag-ended", finishDrag);
listen("pet-error", (event) => {
  actionNotice = false;
  actionError = String(event.payload);
  if (promptTarget) {
    const feedback = document.querySelector(".prompt-feedback");
    feedback.textContent = errorLabel(actionError);
    feedback.classList.add("action-error");
    positionBubble();
    return;
  }
  showBubble();
  setTimeout(() => {
    actionError = null;
    if (hovered || bubbleHovered) showBubble();
    else hideBubble(true);
  }, 5000);
});

Promise.all([
  invoke("set_pet_size", { width: pet.offsetWidth, height: pet.offsetHeight }),
  invoke("get_state"),
  invoke("get_layout"),
]).then(([, initial, savedLayout]) => {
  if (initial) state = initial;
  applyTheme(state.theme);
  applyLayout(savedLayout);
  draw();
});

setInterval(() => {
  if (bubble.classList.contains("visible") && !promptTarget) updateElapsedLabels();
}, 1000);

updateLanguage();
applyTheme(state.theme);
applyLayout(layout);
draw();

listen("pet-theme", (event) => {
  themeSelection = selectedTheme(event.payload);
  localStorage.setItem("herdr-pet-theme", themeSelection);
  applyTheme(state.theme);
  draw();
  invoke("set_theme_follow", { follow: themeSelection === "auto" });
});

listen("pet-notice", (event) => {
  actionNotice = true;
  actionError = t(event.payload);
  showBubble();
  setTimeout(() => {
    if (!actionNotice) return;
    actionError = null;
    actionNotice = false;
    if (!promptTarget && bubble.classList.contains("visible")) renderOverview();
  }, 6000);
});

listen("pet-voice", (event) => {
  if (!voice || voice.id !== event.payload.id) return;
  const result = event.payload;
  if (result.phase === "complete" || result.phase === "failed") {
    const saved = voice;
    voice = null;
    document.getElementById("prompt-form")?.dispatchEvent(new CustomEvent("voice-result", {
      detail: { ...result, start: saved.start, end: saved.end },
    }));
  } else {
    if (voice.phase === "stopping" && result.phase === "recording") return;
    Object.assign(voice, result);
    document.getElementById("prompt-form")?.dispatchEvent(new Event("voice-change"));
    positionBubble();
  }
});

invoke("set_theme_follow", { follow: themeSelection === "auto" });
setInterval(refreshPreview, 5000);
window.addEventListener("beforeunload", cancelVoice);

listen("pet-skin", (event) => {
  skinSelection = selectedSkin(event.payload);
  petSkin.select(skinSelection);
  localStorage.setItem("herdr-pet-skin", skinSelection);
  draw();
});

document.addEventListener("visibilitychange", () => {
  pet.dataset.hidden = String(document.hidden);
});
