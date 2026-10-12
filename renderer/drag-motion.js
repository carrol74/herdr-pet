const dragClamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const DRAG_SETTLE_MS = 420;

function wrapDragPart(part, className) {
  if (!part) return;
  const group = part.ownerDocument.createElementNS(part.namespaceURI, "g");
  group.setAttribute("class", className);
  part.replaceWith(group);
  group.append(part);
}

function addDragRainbow(pose) {
  const rainbow = pose.ownerDocument.createElementNS(pose.namespaceURI, "g");
  rainbow.setAttribute("class", "drag-rainbow");
  const colors = [
    "var(--pet-blocked)",
    "color-mix(in srgb, var(--pet-blocked) 50%, var(--pet-working))",
    "var(--pet-working)", "var(--pet-done)", "var(--pet-accent)",
    "color-mix(in srgb, var(--pet-accent) 60%, var(--pet-blocked))",
  ];
  colors.forEach((color, index) => {
    const radius = 74 - index * 8;
    const arc = pose.ownerDocument.createElementNS(pose.namespaceURI, "path");
    arc.setAttribute("d", `M${-radius} -28a${radius} ${radius} 0 0 1 ${radius * 2} 0`);
    arc.setAttribute("fill", "none");
    arc.setAttribute("stroke", color);
    arc.setAttribute("stroke-width", "6");
    arc.setAttribute("stroke-linecap", "round");
    arc.setAttribute("pathLength", "100");
    arc.style.setProperty("--rainbow-band", String(index));
    rainbow.append(arc);
  });
  pose.prepend(rainbow);
}

function prepareCatFold(pose) {
  const light = pose.querySelector(".cat-ear-accent");
  for (const [side, inset] of [
    ["left", "M-53 -35L-47 -55L-38 -35Z"],
    ["right", "M38 -35L47 -55L53 -35Z"],
  ]) {
    const ear = pose.ownerDocument.createElementNS(pose.namespaceURI, "g");
    ear.setAttribute("class", `drag-ear drag-ear-${side}`);
    ear.dataset.side = side;
    const accent = light.cloneNode(true);
    accent.setAttribute("d", inset);
    accent.classList.add("ear-accent");
    ear.append(accent);
    light.before(ear);
  }
  light.remove();
}

function prepareDragPoses(actor, skin) {
  const character = actor.querySelector(".character");
  const idle = character.querySelector(".pose-idle");
  for (const original of [...character.querySelectorAll(".pose")]) {
    const pose = original.cloneNode(true);
    pose.dataset.dragState = [...original.classList].find((name) => name.startsWith("pose-"))?.slice(5);
    pose.setAttribute("class", "pose pose-drag");
    if (skin === "sprite" && original !== idle) {
      for (const part of [...pose.querySelectorAll("path, ellipse")]) {
        const d = part.getAttribute("d");
        if (d === "M-28 39l-3 14m59-14l3 14"
          || (part.tagName === "ellipse" && part.getAttribute("cy") === "55")) part.remove();
      }
      pose.prepend(idle.querySelector(".sprite-leg-left").cloneNode(true), idle.querySelector(".sprite-leg-right").cloneNode(true));
      pose.querySelector(".hands")?.replaceWith(idle.querySelector(".hands").cloneNode(true));
    }
    for (const [selector, name] of [
      [".sprite-arm-left", "drag-arm drag-arm-left"],
      [".sprite-arm-right", "drag-arm drag-arm-right"],
      [".sprite-leg-left", "drag-leg drag-leg-left"],
      [".sprite-leg-right", "drag-leg drag-leg-right"],
      [".tail", "drag-tail"],
      [".weather-sun", "drag-weather"],
      [".cloud-rain", "drag-weather"],
      [".cloud-lightning", "drag-weather"],
      [".cloud-fog", "drag-weather"],
    ]) wrapDragPart(pose.querySelector(selector), name);
    if (skin === "cloud") {
      addDragRainbow(pose);
      wrapDragPart([...pose.querySelectorAll("path")].find((part) => part.getAttribute("d")?.startsWith("M35-42")), "drag-weather");
    }
    if (skin === "cat") {
      prepareCatFold(pose);
      for (const part of pose.querySelectorAll('rect[y="46"]')) {
        wrapDragPart(part, `drag-leg ${Number(part.getAttribute("x")) < 0 ? "drag-leg-left" : "drag-leg-right"}`);
      }
    }
    character.append(pose);
  }
}

class PetDragMotion {
  constructor(element, motionPreference, onFinish) {
    this.element = element;
    this.motionPreference = motionPreference;
    this.onFinish = onFinish;
    this.phase = "idle";
    this.frame = null;
    this.poses = new Map();
    this.properties = new Set();
    this.earAngles = { left: 0, right: 0 };
  }

  get active() {
    return this.phase !== "idle";
  }

  prepare(skin) {
    this.cancel();
    this.skin = skin;
    prepareDragPoses(this.element, skin);
    this.unitsPerPixel = this.element.querySelector("svg").viewBox.baseVal.width / this.element.offsetWidth;
    this.poses = new Map([...this.element.querySelectorAll(".pose-drag")].map((pose) => [
      pose.dataset.dragState, {
        element: pose,
        head: pose.querySelector(".cat-shell"),
        ears: [...pose.querySelectorAll(".drag-ear")].map((ear) => ({
          left: ear.dataset.side === "left", accent: ear.querySelector(".ear-accent"),
        })),
      },
    ]));
    this.pose = null;
    this.selectPose(this.element.dataset.state);
  }

  selectPose(state) {
    if (this.pose) this.pose.element.dataset.current = "false";
    this.pose = this.poses.get(state);
    if (!this.pose) return;
    this.pose.element.dataset.current = "true";
    if (this.skin === "cat" && this.active) {
      this.paintEars(this.earAngles.left, this.earAngles.right, this.restBlend);
    }
  }

  start(position) {
    const wasActive = this.active;
    cancelAnimationFrame(this.frame);
    this.frame = null;
    this.phase = "dragging";
    this.motionTime = 0;
    this.restBlend = 0;
    this.velocity = { x: 0, y: 0 };
    this.targetVelocity = { x: 0, y: 0 };
    this.sample = null;
    if (!wasActive) this.earAngles = { left: 0, right: 0 };
    if (position?.primaryDown) this.movePointer(position);
    this.sync();
  }

  movePointer(position) {
    if (this.phase !== "dragging" || !position.primaryDown) return;
    const now = performance.now();
    if (this.sample) {
      const elapsed = Math.max(1, now - this.sample.time);
      const scale = this.unitsPerPixel / position.scaleFactor;
      this.targetVelocity = {
        x: dragClamp((position.screenX - this.sample.x) * scale * 16 / elapsed, -16, 16),
        y: dragClamp((position.screenY - this.sample.y) * scale * 16 / elapsed, -16, 16),
      };
    }
    this.sample = { x: position.screenX, y: position.screenY, time: now };
  }

  sync() {
    const reduced = this.motionPreference.matches;
    this.element.dataset.reduced = String(reduced);
    if (reduced && this.phase === "returning") {
      this.finish();
      return;
    }
    this.element.dataset.dragging = String(this.phase === "dragging" && !reduced);
    this.element.dataset.returning = String(this.phase === "returning" && !reduced);
    if (!this.active || document.hidden || reduced) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
      return;
    }
    if (this.frame !== null) return;
    this.lastFrame = performance.now();
    this.frame = requestAnimationFrame((time) => this.tick(time));
  }

  tick(time) {
    this.frame = null;
    if (!this.active || document.hidden || this.motionPreference.matches) {
      this.sync();
      return;
    }
    const elapsed = Math.min(40, time - this.lastFrame);
    this.lastFrame = time;
    if (this.phase === "dragging") {
      this.motionTime += elapsed;
      for (const axis of ["x", "y"]) this.velocity[axis] += (this.targetVelocity[axis] - this.velocity[axis]) * .22;
      this.paint();
    } else {
      this.returnElapsed += elapsed;
      const progress = Math.min(1, this.returnElapsed / DRAG_SETTLE_MS);
      const remaining = (1 - progress) ** 3;
      this.restBlend = 1 - remaining;
      this.earAngles = { left: this.releaseAngles.left * remaining, right: this.releaseAngles.right * remaining };
      if (this.skin === "cat") this.paintEars(this.earAngles.left, this.earAngles.right, this.restBlend);
      if (progress === 1) { this.finish(); return; }
    }
    this.frame = requestAnimationFrame((next) => this.tick(next));
  }

  end() {
    if (this.phase !== "dragging") return;
    this.phase = "returning";
    this.returnElapsed = 0;
    this.releaseAngles = { ...this.earAngles };
    this.velocity = { x: 0, y: 0 };
    this.paint();
    this.sync();
  }

  paint() {
    const { x, y } = this.velocity;
    const active = this.phase === "dragging";
    const beat = (this.motionTime || 0) / 1000;
    const strength = 1 + Math.min(.25, Math.hypot(x, y) / 32);
    for (const [name, value] of Object.entries({
      "tilt": `${dragClamp(-x * .8, -9, 9)}deg`,
      "stretch-x": this.skin === "cat" ? 1 : this.skin === "cloud" ? 1 + Math.abs(x) * .003 : 1 - Math.abs(y) * .001,
      "stretch-y": this.skin === "cat" ? 1 : 1 + Math.abs(y) * (this.skin === "cloud" ? .004 : .002),
      "trail-x": `${-x * .65}px`, "trail-y": `${-y * .4}px`,
      "arm-left": `${active ? 76 + Math.sin(beat * 8) * 38 * strength : 0}deg`,
      "arm-right": `${active ? -76 + Math.sin(beat * 8 + 1.7) * 38 * strength : 0}deg`,
      "leg-left": `${active ? (this.skin === "sprite" ? 10 + Math.sin(beat * 8 + 2.2) * 28 * strength : 8 + dragClamp(x, -12, 12)) : 0}deg`,
      "leg-right": `${active ? (this.skin === "sprite" ? -10 + Math.sin(beat * 8 + .5) * 28 * strength : -8 + dragClamp(x, -12, 12)) : 0}deg`,
      "tail-angle": `${active ? Math.sin(beat * 6.5) * 38 + dragClamp(x * .5, -8, 8) : 0}deg`,
      "rainbow-reveal": active ? Math.min(1.35, (this.motionTime || 0) / 500) : 0,
      "rainbow-sway": `${active ? Math.sin(beat * 3.4) * 6 : 0}deg`,
      "rainbow-rise": `${active ? Math.sin(beat * 3.4) * 4 : 0}px`,
    })) {
      const property = `--drag-${name}`;
      this.properties.add(property);
      this.element.style.setProperty(property, String(value));
    }
    if (this.skin === "cat" && this.phase !== "returning") {
      const moving = active && !this.motionPreference.matches;
      const left = moving ? 66 + Math.sin(beat * 4.5) * 10 : 0;
      const right = moving ? 66 + Math.sin(beat * 4.5 + .5) * 10 : 0;
      const blend = this.motionPreference.matches ? 1 : .3;
      this.earAngles.left += (left - this.earAngles.left) * blend;
      this.earAngles.right += (right - this.earAngles.right) * blend;
      this.paintEars(this.earAngles.left, this.earAngles.right, active ? 0 : 1);
    }
  }

  paintEars(leftAngle, rightAngle, restBlend = 0) {
    const left = Math.cos(leftAngle * Math.PI / 180);
    const right = Math.cos(rightAngle * Math.PI / 180);
    const leftTip = -33 - 34 * left;
    const rightTip = -33 - 34 * right;
    const commands = ["M", "Q", "L", "Q", "L", "Q", "H", "Q", "L", "Q", "L", "Q", "V", "Q", "H", "Q", "Z"];
    const movingShape = [
      [-58, -11], [-58, -25, -53, -30], [-51, leftTip + 3],
      [-50, leftTip - 2, -47, leftTip + 2], [-31, -37], [-29, -33, -25, -33],
      [25], [29, -33, 31, -37], [47, rightTip + 2],
      [50, rightTip - 2, 51, rightTip + 3], [53, -30], [58, -25, 58, -11],
      [28], [58, 50, 36, 50], [-36], [-58, 50, -58, 28], [],
    ];
    const restingShape = [
      [-58, -11], [-58, -25, -57.25, -33], [-48.20, -63.19],
      [-47.66, -64.99, -46.85, -63.19], [-33.26, -33], [-31, -33, -27, -33],
      [27], [31, -33, 33.26, -33], [46.85, -63.19],
      [47.66, -64.99, 48.20, -63.19], [57.25, -33], [58, -25, 58, -11],
      [28], [58, 50, 36, 50], [-36], [-58, 50, -58, 28], [],
    ];
    const shell = commands.map((command, index) => command + movingShape[index].map((value, coordinate) =>
      value + (restingShape[index][coordinate] - value) * restBlend
    ).join(" ")).join("");
    if (!this.pose) return;
    this.pose.head.setAttribute("d", shell);
    for (const ear of this.pose.ears) {
      const isLeft = ear.left;
      const height = isLeft ? left : right;
      const tip = -35 - 20 * height;
      const accent = ear.accent;
      accent.setAttribute("d", isLeft
        ? `M-53 -35L-47 ${tip}L-38 -35Z` : `M38 -35L47 ${tip}L53 -35Z`);
      accent.style.opacity = String(.8 * height ** 2);
    }
  }


  finish() {
    if (this.skin === "cat" && this.pose) this.paintEars(0, 0, 1);
    this.cancel();
    this.onFinish();
  }

  cancel() {
    cancelAnimationFrame(this.frame);
    this.frame = null;
    this.phase = "idle";
    this.sample = null;
    this.element.dataset.dragging = "false";
    this.element.dataset.returning = "false";
    for (const property of this.properties) this.element.style.removeProperty(property);
    this.properties.clear();
  }
}
