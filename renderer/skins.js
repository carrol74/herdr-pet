const PET_SKINS = ["sprite", "cloud", "cat"];
const PET_IDLE_ACTIONS = {
  sprite: [
    { name: "look", duration: 3800 },
    { name: "stretch", duration: 3200 },
    { name: "sway", duration: 4000 },
    { name: "wave", duration: 2800 },
    { name: "doze", duration: 5200 },
  ],
  cloud: [
    { name: "look", duration: 3800 },
    { name: "puff", duration: 3600 },
    { name: "drift", duration: 4600 },
    { name: "sun-peek", duration: 3600 },
    { name: "doze", duration: 5200 },
  ],
  cat: [
    { name: "look", duration: 3800 },
    { name: "stretch", duration: 3200 },
    { name: "tilt", duration: 3400 },
    { name: "tail-flick", duration: 2800 },
    { name: "doze", duration: 5200 },
  ],
};
const PET_IDLE_PAUSE = { minimum: 7000, maximum: 13000 };
const PET_IDLE_FIRST_PAUSE = { minimum: 2500, maximum: 4500 };

function idlePause(range) {
  return range.minimum + Math.random() * (range.maximum - range.minimum);
}

function wrapIdlePart(part, className) {
  if (!part) return;
  const group = part.ownerDocument.createElementNS(part.namespaceURI, "g");
  group.setAttribute("class", className);
  part.replaceWith(group);
  group.append(part);
}

function prepareIdlePose(svg) {
  const pose = svg.querySelector(".pose-idle");
  const body = pose.ownerDocument.createElementNS(pose.namespaceURI, "g");
  body.setAttribute("class", "idle-body");
  body.append(...pose.childNodes);
  pose.append(body);
  for (const [selector, className] of [
    [".gaze", "idle-gaze"],
    [".eyes", "idle-eyes"],
    [".hands", "idle-hands"],
    [".tail", "idle-tail"],
    [".weather-sun", "idle-weather"],
  ]) {
    wrapIdlePart(body.querySelector(selector), className);
  }
}

function selectedSkin(saved) {
  return PET_SKINS.includes(saved) ? saved : "sprite";
}

function skinState(snapshot) {
  if (snapshot.connection === "offline") return "offline";
  return {
    sleeping: "idle",
    working: "working",
    attention: "attention",
    celebrate: "done",
    neutral: "unknown",
    offline: "offline",
  }[snapshot.mood] || "unknown";
}

class PetSkin {
  constructor(element, selection) {
    this.element = element;
    this.stateKey = null;
    this.idleTimer = null;
    this.pendingIdle = null;
    this.idleActions = [];
    this.lastIdleAction = null;
    this.firstIdleAction = true;
    this.interacting = false;
    this.dragging = false;
    this.stopped = false;
    this.motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.dragMotion = new PetDragMotion(element, this.motionPreference, () => this.syncIdleMotion());
    this.onMotionPreferenceChange = () => {
      this.dragMotion.sync();
      this.syncIdleMotion();
    };
    this.motionPreference.addEventListener("change", this.onMotionPreferenceChange);
    this.select(selection);
    this.updateVisibility();
  }

  select(selection) {
    const skin = selectedSkin(selection);
    if (this.element.dataset.skin === skin) return;
    this.cancelIdleMotion();
    this.dragMotion.cancel();
    this.idleActions = [];
    this.lastIdleAction = null;
    this.firstIdleAction = true;
    const document = new DOMParser().parseFromString(PET_SKIN_ASSETS[skin], "image/svg+xml");
    if (document.querySelector("parsererror")) throw new Error(`Invalid pet skin: ${skin}`);
    prepareIdlePose(document.documentElement);
    const response = window.document.createElement("div");
    response.className = "pet-response";
    response.append(window.document.importNode(document.documentElement, true));
    this.element.replaceChildren(response);
    this.element.dataset.skin = skin;
    this.dragMotion.prepare(skin);
    this.stateKey = null;
  }

  update(snapshot) {
    const phase = skinState(snapshot);
    const nextKey = JSON.stringify([phase, snapshot.session, snapshot.subject?.paneId, snapshot.subject?.statusSinceMs]);
    if (this.stateKey === nextKey) return;
    const samePhase = this.element.dataset.state === phase;
    this.stateKey = nextKey;
    this.element.dataset.state = phase;
    this.dragMotion.selectPose(phase);
    if (!samePhase && phase === "idle") this.firstIdleAction = true;
    this.syncIdleMotion();
    if (samePhase && !this.dragMotion.active && ["attention", "done"].includes(phase)) {
      requestAnimationFrame(() => {
        if (this.stateKey !== nextKey) return;
        this.element.getAnimations({ subtree: true }).forEach((animation) => { animation.currentTime = 0; });
      });
    }
  }

  syncIdleMotion() {
    if (this.stopped || this.element.dataset.state !== "idle" || this.motionPreference.matches) {
      this.cancelIdleMotion();
      return;
    }
    if (window.document.hidden || this.dragging || this.dragMotion.active) {
      if (this.idleTimer !== null) {
        clearTimeout(this.idleTimer);
        this.idleTimer = null;
        this.pendingIdle.remaining = Math.max(0, this.pendingIdle.dueAt - performance.now());
      }
      return;
    }
    if (this.interacting) {
      this.cancelIdleMotion();
      return;
    }
    if (this.pendingIdle) this.resumeIdleMotion();
    else {
      const pause = this.firstIdleAction ? PET_IDLE_FIRST_PAUSE : PET_IDLE_PAUSE;
      this.scheduleIdleMotion(() => this.playIdleAction(), idlePause(pause));
    }
  }

  scheduleIdleMotion(callback, delay) {
    this.pendingIdle = { callback, remaining: delay, dueAt: null };
    this.resumeIdleMotion();
  }

  resumeIdleMotion() {
    if (this.idleTimer !== null || !this.pendingIdle) return;
    this.pendingIdle.dueAt = performance.now() + this.pendingIdle.remaining;
    this.idleTimer = setTimeout(() => {
      const callback = this.pendingIdle.callback;
      this.idleTimer = null;
      this.pendingIdle = null;
      callback();
    }, this.pendingIdle.remaining);
  }

  playIdleAction() {
    if (!this.idleActions.length) {
      this.idleActions = PET_IDLE_ACTIONS[this.element.dataset.skin]
        .filter((action) => action.name !== this.lastIdleAction);
    }
    const index = Math.floor(Math.random() * this.idleActions.length);
    const [action] = this.idleActions.splice(index, 1);
    this.firstIdleAction = false;
    this.lastIdleAction = action.name;
    this.element.style.setProperty("--idle-action-duration", `${action.duration}ms`);
    this.element.dataset.idleAction = action.name;
    this.scheduleIdleMotion(() => {
      this.clearIdleAction();
      this.syncIdleMotion();
    }, action.duration);
  }

  clearIdleAction() {
    delete this.element.dataset.idleAction;
    this.element.style.removeProperty("--idle-action-duration");
  }

  cancelIdleMotion() {
    clearTimeout(this.idleTimer);
    this.idleTimer = null;
    this.pendingIdle = null;
    this.clearIdleAction();
  }

  setInteracting(active) {
    if (this.interacting === active) return;
    this.interacting = active;
    this.syncIdleMotion();
  }

  setDragging(active, position) {
    if (this.dragging === active) return;
    this.dragging = active;
    if (active) {
      this.cancelIdleMotion();
      this.dragMotion.start(position);
    } else this.dragMotion.end();
    this.syncIdleMotion();
  }

  updateVisibility() {
    this.element.dataset.hidden = String(window.document.hidden);
    this.dragMotion.sync();
    this.syncIdleMotion();
  }

  stop() {
    this.stopped = true;
    this.cancelIdleMotion();
    this.dragMotion.cancel();
    this.motionPreference.removeEventListener("change", this.onMotionPreferenceChange);
  }
}

if (typeof module !== "undefined") module.exports = { selectedSkin, skinState };
