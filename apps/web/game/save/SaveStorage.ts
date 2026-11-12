const STORAGE_KEY = "echoes-of-valoria:save:v1";

/**
 * Thin wrapper over the browser's localStorage. Storage can be missing,
 * blocked (private windows, strict settings) or full, so every call is
 * guarded and failure simply means "nothing saved".
 */
export class SaveStorage {
  /** False once storage has been found to be unusable. */
  private usable = true;

  get available(): boolean {
    return this.usable;
  }

  /** The stored save text, or null if there is none. */
  read(): string | null {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch {
      this.usable = false;
      return null;
    }
  }

  /** Store save text. Returns whether it was written. */
  write(text: string): boolean {
    try {
      window.localStorage.setItem(STORAGE_KEY, text);
      this.usable = true;
      return true;
    } catch {
      this.usable = false;
      return false;
    }
  }

  clear(): void {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      this.usable = false;
    }
  }
}
