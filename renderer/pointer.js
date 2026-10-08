class PetPointer {
  constructor(invoke, onHover) {
    this.invoke = invoke;
    this.onHover = onHover;
    this.interactive = false;
    this.paused = false;
    this.stopped = false;
    this.timer = null;
  }

  targetAt(x, y) {
    const element = document.elementFromPoint(x, y);
    if (element?.closest("#bubble")) return "bubble";
    if (element instanceof SVGGeometryElement && element.closest("#pet .character")) return "pet";
    return null;
  }

  async poll() {
    if (this.stopped) return;
    try {
      const position = await this.invoke("pointer_position");
      if (!this.paused && !position.primaryDown) {
        this.onHover(this.targetAt(position.x, position.y), position);
        const interactive = this.targetAt(position.x, position.y) !== null;
        if (this.interactive !== interactive) {
          await this.invoke("set_pointer_interactive", { interactive });
          this.interactive = interactive;
        }
      }
      // 穿透后 WebView 收不到鼠标移动；继续读取桌面坐标才能恢复主体交互。
      if (!this.stopped) this.timer = setTimeout(() => this.poll(), 25);
    } catch (error) {
      this.stopped = true;
      console.error("Pet pointer tracking failed", error);
      await this.invoke("set_pointer_interactive", { interactive: true });
    }
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
  }
}
