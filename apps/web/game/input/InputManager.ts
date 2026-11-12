import type { MoveIntent } from "@valoria/game-core";

const GAME_KEYS = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ShiftLeft",
  "ShiftRight",
  "Space",
]);

export interface LookDelta {
  x: number;
  y: number;
  zoom: number;
}

/**
 * Collects keyboard and mouse input and exposes it as per-frame intent.
 * Mouse look uses pointer lock (click the canvas); dragging with the left
 * button also works where pointer lock is unavailable.
 */
export class InputManager {
  private readonly held = new Set<string>();
  private jumpQueued = false;
  private lookX = 0;
  private lookY = 0;
  private zoom = 0;
  private dragging = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    window.addEventListener("mouseup", this.onMouseUp);
    document.addEventListener("mousemove", this.onMouseMove);
    canvas.addEventListener("mousedown", this.onMouseDown);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
  }

  get pointerLocked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  /** Movement intent for this frame. Consumes a queued jump press. */
  readIntent(): MoveIntent {
    const axis = (positive: string[], negative: string[]) =>
      (positive.some((code) => this.held.has(code)) ? 1 : 0) -
      (negative.some((code) => this.held.has(code)) ? 1 : 0);

    const jump = this.jumpQueued;
    this.jumpQueued = false;
    return {
      forward: axis(["KeyW", "ArrowUp"], ["KeyS", "ArrowDown"]),
      right: axis(["KeyD", "ArrowRight"], ["KeyA", "ArrowLeft"]),
      sprint: this.held.has("ShiftLeft") || this.held.has("ShiftRight"),
      jump,
    };
  }

  /** Mouse movement and wheel accumulated since the last call. */
  consumeLook(): LookDelta {
    const delta = { x: this.lookX, y: this.lookY, zoom: this.zoom };
    this.lookX = 0;
    this.lookY = 0;
    this.zoom = 0;
    return delta;
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("mouseup", this.onMouseUp);
    document.removeEventListener("mousemove", this.onMouseMove);
    this.canvas.removeEventListener("mousedown", this.onMouseDown);
    this.canvas.removeEventListener("wheel", this.onWheel);
    if (this.pointerLocked) document.exitPointerLock();
  }

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (!GAME_KEYS.has(event.code)) return;
    event.preventDefault();
    if (event.code === "Space" && !event.repeat) this.jumpQueued = true;
    this.held.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent) => {
    this.held.delete(event.code);
  };

  private readonly onBlur = () => {
    this.held.clear();
    this.jumpQueued = false;
    this.dragging = false;
  };

  private readonly onMouseDown = (event: MouseEvent) => {
    if (event.button !== 0) return;
    this.dragging = true;
    if (!this.pointerLocked) {
      // May be refused (e.g. embedded frames); drag-to-look still works.
      Promise.resolve(this.canvas.requestPointerLock()).catch(() => {});
    }
  };

  private readonly onMouseUp = () => {
    this.dragging = false;
  };

  private readonly onMouseMove = (event: MouseEvent) => {
    if (!this.pointerLocked && !this.dragging) return;
    this.lookX += event.movementX;
    this.lookY += event.movementY;
  };

  private readonly onWheel = (event: WheelEvent) => {
    event.preventDefault();
    this.zoom += Math.sign(event.deltaY);
  };
}
