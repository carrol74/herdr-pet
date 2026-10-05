const PET_SKINS = ["sprite", "cloud", "cat"];

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
    this.select(selection);
    this.element.addEventListener("animationend", (event) => {
      if (event.animationName === "settle") this.element.classList.remove("settling");
    });
  }

  select(selection) {
    const skin = selectedSkin(selection);
    if (this.element.dataset.skin === skin) return;
    const document = new DOMParser().parseFromString(PET_SKIN_ASSETS[skin], "image/svg+xml");
    if (document.querySelector("parsererror")) throw new Error(`Invalid pet skin: ${skin}`);
    const response = window.document.createElement("div");
    response.className = "pet-response";
    response.append(window.document.importNode(document.documentElement, true));
    this.element.replaceChildren(response);
    this.element.dataset.skin = skin;
    this.stateKey = null;
  }

  update(snapshot) {
    const phase = skinState(snapshot);
    const nextKey = JSON.stringify([phase, snapshot.session, snapshot.subject?.paneId, snapshot.subject?.statusSinceMs]);
    if (this.stateKey === nextKey) return;
    const samePhase = this.element.dataset.state === phase;
    this.stateKey = nextKey;
    this.element.dataset.state = phase;
    if (samePhase && ["attention", "done"].includes(phase)) {
      requestAnimationFrame(() => {
        if (this.stateKey !== nextKey) return;
        this.element.getAnimations({ subtree: true }).forEach((animation) => { animation.currentTime = 0; });
      });
    }
  }

  settle() {
    this.element.classList.remove("settling");
    requestAnimationFrame(() => this.element.classList.add("settling"));
  }
}

if (typeof module !== "undefined") module.exports = { selectedSkin, skinState };
