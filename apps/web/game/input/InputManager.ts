import type { CombatIntent, MoveIntent } from "@valoria/game-core";

const MOVE_KEYS = ["KeyW", "KeyA", "KeyS", "KeyD"];
const LOOK_KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
const COMBAT_KEYS = ["KeyF", "KeyR", "KeyQ", "KeyE"];
const GAME_KEYS = new Set([
  ...MOVE_KEYS,
  ...LOOK_KEYS,
  ...COMBAT_KEYS,
  "ShiftLeft",
  "ShiftRight",
  "Space",
]);

/** Largest movement accepted from one pointer-locked event; filters spikes. */
const MAX_LOOK_STEP = 120;
/** Wheel delta of one mouse-wheel notch, used to normalise zoom. */
const WHEEL_NOTCH = 100;

export interface LookDelta {
  /** Pointer movement in pixels since the last frame. */
  x: number;
  y: number;
  /** Zoom steps since the last frame; positive zooms out. */
  zoom: number;
  /** Held look keys, -1..1. Positive yaw turns right, positive pitch looks up. */
  keyYaw: number;
  keyPitch: number;
}

/**
 * Collects keyboard and pointer input and exposes it as per-frame intent.
 *
 * Looking around works three ways, so it stays usable on a laptop touchpad:
 * - pointer lock: click the viewport, then move the mouse or touchpad;
 * - drag: hold a button (or tap-drag / touch) and move, with pointer capture;
 * - arrow keys, and a horizontal two-finger swipe on a touchpad.
 * Movement keys and look input are tracked independently.
 *
 * Combat: F attack, R heavy attack, Q block (hold), E dodge. While the
 * pointer is locked, left click also attacks and right click blocks.
 */
export class InputManager {
  private readonly held = new Set<string>();
  private jumpQueued = false;
  private dodgeQueued = false;
  private readonly lockedButtons = new Set<number>();
  private lookX = 0;
  private lookY = 0;
  private zoom = 0;
  private dragPointerId: number | null = null;
  private lastX = 0;
  private lastY = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("pointerlockchange", this.onPointerLockChange);
    // While locked, movement is reported on the document, not the canvas.
    document.addEventListener("mousemove", this.onLockedMouseMove);
    document.addEventListener("mousedown", this.onLockedMouseDown);
    document.addEventListener("mouseup", this.onLockedMouseUp);
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
    canvas.addEventListener("contextmenu", this.onContextMenu);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
  }

  get pointerLocked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  /** Movement intent for this frame. Consumes a queued jump press. */
  readIntent(): MoveIntent {
    const jump = this.jumpQueued;
    this.jumpQueued = false;
    return {
      forward: this.axis("KeyW", "KeyS"),
      right: this.axis("KeyD", "KeyA"),
      sprint: this.held.has("ShiftLeft") || this.held.has("ShiftRight"),
      jump,
    };
  }

  /** Combat intent for this frame. Consumes a queued dodge press. */
  readCombatIntent(): CombatIntent {
    const dodge = this.dodgeQueued;
    this.dodgeQueued = false;
    return {
      light: this.held.has("KeyF") || this.lockedButtons.has(0),
      heavy: this.held.has("KeyR"),
      dodge,
      block: this.held.has("KeyQ") || this.lockedButtons.has(2),
    };
  }

  /** Look input accumulated since the last call. */
  consumeLook(): LookDelta {
    const delta: LookDelta = {
      x: this.lookX,
      y: this.lookY,
      zoom: this.zoom,
      keyYaw: this.axis("ArrowRight", "ArrowLeft"),
      keyPitch: this.axis("ArrowUp", "ArrowDown"),
    };
    this.lookX = 0;
    this.lookY = 0;
    this.zoom = 0;
    return delta;
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("pointerlockchange", this.onPointerLockChange);
    document.removeEventListener("mousemove", this.onLockedMouseMove);
    document.removeEventListener("mousedown", this.onLockedMouseDown);
    document.removeEventListener("mouseup", this.onLockedMouseUp);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    this.canvas.removeEventListener("contextmenu", this.onContextMenu);
    this.canvas.removeEventListener("wheel", this.onWheel);
    if (this.pointerLocked) document.exitPointerLock();
  }

  private axis(positive: string, negative: string): number {
    return (this.held.has(positive) ? 1 : 0) - (this.held.has(negative) ? 1 : 0);
  }

  private addLook(dx: number, dy: number): void {
    this.lookX += dx;
    this.lookY += dy;
  }

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (!GAME_KEYS.has(event.code)) return;
    event.preventDefault();
    if (event.code === "Space" && !event.repeat) this.jumpQueued = true;
    if (event.code === "KeyE" && !event.repeat) this.dodgeQueued = true;
    this.held.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent) => {
    this.held.delete(event.code);
  };

  private readonly onBlur = () => {
    this.held.clear();
    this.jumpQueued = false;
    this.dodgeQueued = false;
    this.lockedButtons.clear();
    this.dragPointerId = null;
  };

  private readonly onPointerLockChange = () => {
    // Entering or leaving lock ends any drag so the two modes never stack.
    this.dragPointerId = null;
    this.lockedButtons.clear();
  };

  private readonly onPointerDown = (event: PointerEvent) => {
    if (this.pointerLocked) return;
    this.dragPointerId = event.pointerId;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch {
      // Capture is a nicety; dragging inside the canvas still works.
    }
    if (event.pointerType === "mouse") {
      // Covers mice and touchpads. May be refused (e.g. embedded frames);
      // drag-to-look keeps working either way. Esc releases the lock.
      try {
        Promise.resolve(this.canvas.requestPointerLock()).catch(() => {});
      } catch {
        // Pointer Lock API unavailable.
      }
    }
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    if (this.pointerLocked || event.pointerId !== this.dragPointerId) return;
    // Positions rather than movementX: reliable for touch and pen as well.
    this.addLook(event.clientX - this.lastX, event.clientY - this.lastY);
    this.lastX = event.clientX;
    this.lastY = event.clientY;
  };

  private readonly onPointerUp = (event: PointerEvent) => {
    if (event.pointerId === this.dragPointerId) this.dragPointerId = null;
  };

  private readonly onLockedMouseMove = (event: MouseEvent) => {
    if (!this.pointerLocked) return;
    // Browsers occasionally report a huge bogus jump while locked.
    const limit = (value: number) =>
      Math.max(-MAX_LOOK_STEP, Math.min(MAX_LOOK_STEP, value));
    this.addLook(limit(event.movementX), limit(event.movementY));
  };

  private readonly onLockedMouseDown = (event: MouseEvent) => {
    if (this.pointerLocked) this.lockedButtons.add(event.button);
  };

  private readonly onLockedMouseUp = (event: MouseEvent) => {
    this.lockedButtons.delete(event.button);
  };

  private readonly onContextMenu = (event: Event) => {
    event.preventDefault();
  };

  private readonly onWheel = (event: WheelEvent) => {
    event.preventDefault();
    const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 33 : 1;
    // Horizontal scroll only comes from touchpads (two-finger swipe): turn.
    this.addLook(event.deltaX * scale * 0.6, 0);
    // Vertical scroll and pinch zoom, proportional so touchpads stay smooth.
    this.zoom += (event.deltaY * scale) / WHEEL_NOTCH;
  };
}
