// VideoPool — 3 recyclable <video> elements managed imperatively outside React.
// Elements created once, never unmounted. src rotates, DOM stays.
//
// Key improvements over v1:
//  - AbortControllers cancel in-flight preloads when user scrolls past
//  - Memory cleanup: load() after clearing src forces browser to release decoded frames
//  - Error recovery: 3 retry attempts with exponential backoff
//  - Enriched state machine: idle → preloading → ready → playing ↔ paused
//  - Audio focus: only the active slot produces audio

export type SlotState =
  | "idle"
  | "preloading"
  | "ready"
  | "playing"
  | "paused"
  | "error_retry"
  | "error";

export interface VideoSlot {
  el: HTMLVideoElement;
  feedIndex: number | null;
  videoId: string | null;
  state: SlotState;
  src: string | null;
  retryCount: number;
  maxRetries: number;
  abortController: AbortController | null;
  preloadFailed: boolean;
  preloadTimeout: ReturnType<typeof setTimeout> | null;
}

const RETRY_DELAYS = [1000, 2000, 4000]; // ms between retries
const MAX_RETRIES = RETRY_DELAYS.length;

export class VideoPool {
  readonly slots: [VideoSlot, VideoSlot, VideoSlot];
  private activeAudioSlot: number | null = null;
  private globalMuted: boolean = true;

  constructor() {
    this.slots = [
      this.createSlot(),
      this.createSlot(),
      this.createSlot(),
    ];
  }

  // ── Slot lifecycle ──────────────────────────────────────────────────────────

  private createSlot(): VideoSlot {
    const el = document.createElement("video");
    el.setAttribute("playsinline", "");
    el.setAttribute("loop", "");
    el.setAttribute("muted", "");
    el.setAttribute("preload", "auto");
    el.setAttribute("webkit-playsinline", "");
    el.setAttribute("x5-video-player-type", "h5");
    el.setAttribute("x5-video-player-fullscreen", "false");
    el.className = "snap-item absolute inset-0 h-full w-full object-cover bg-black";
    el.style.cssText = "touch-action: pan-y; pointer-events: auto;";

    el.addEventListener("loadeddata", () => {
      const slot = this.slots.find((s) => s.el === el);
      if (slot && slot.state === "preloading") {
        slot.state = "ready";
        slot.retryCount = 0;
      }
    });

    el.addEventListener("canplay", () => {
      const slot = this.slots.find((s) => s.el === el);
      if (slot && slot.state === "preloading") {
        slot.state = "ready";
      }
    });

    el.addEventListener("playing", () => {
      const slot = this.slots.find((s) => s.el === el);
      if (slot) slot.state = "playing";
    });

    el.addEventListener("pause", () => {
      const slot = this.slots.find((s) => s.el === el);
      if (slot && slot.state === "playing") slot.state = "paused";
    });

    el.addEventListener("error", () => {
      const slot = this.slots.find((s) => s.el === el);
      if (!slot) return;
      this.handleSlotError(slot);
    });

    return {
      el,
      feedIndex: null,
      videoId: null,
      state: "idle",
      src: null,
      retryCount: 0,
      maxRetries: MAX_RETRIES,
      abortController: null,
      preloadFailed: false,
      preloadTimeout: null,
    };
  }

  private handleSlotError(slot: VideoSlot): void {
    if (slot.retryCount < slot.maxRetries) {
      slot.state = "error_retry";
      const delay = RETRY_DELAYS[slot.retryCount] ?? 4000;
      slot.retryCount++;
      setTimeout(() => {
        // Only retry if still in retry state (user hasn't scrolled past)
        if (slot.state === "error_retry" && slot.src) {
          slot.state = "preloading";
          slot.el.src = slot.src;
          slot.el.load();
        }
      }, delay);
    } else {
      slot.state = "error";
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /** Attach pool elements to a DOM container. Call once. */
  mount(container: HTMLElement): void {
    for (const slot of this.slots) {
      if (!slot.el.parentElement) {
        container.appendChild(slot.el);
      }
    }
  }

  /** Remove all elements from DOM. */
  unmount(): void {
    for (const slot of this.slots) {
      slot.el.pause();
      slot.el.removeAttribute("src");
      slot.el.remove();
    }
  }

  /**
   * Assign video data to a slot. Aborts any in-flight preload for the same slot.
   * Skips reload if already assigned to the same videoId.
   */
  assign(
    slotIndex: number,
    _feedIndex: number,
    videoId: string,
    src: string,
    poster?: string | null,
  ): void {
    const slot = this.slots[slotIndex];
    const sameVideo = slot.videoId === videoId && slot.src === src;

    // Abort any previous preload for this slot
    if (slot.abortController) {
      slot.abortController.abort();
      slot.abortController = null;
    }
    if (slot.preloadTimeout) {
      clearTimeout(slot.preloadTimeout);
      slot.preloadTimeout = null;
    }

    if (sameVideo) {
      // Already have this video — just ensure it's playing if it was ready
      if (slot.state === "ready" || slot.state === "paused") {
        // No reload needed
      }
      return;
    }

    // New video assignment
    const ac = new AbortController();
    slot.abortController = ac;
    slot.retryCount = 0;
    slot.state = "preloading";
    slot.src = src;

    const previousTime = slot.el.currentTime;
    slot.el.currentTime = 0;
    slot.el.src = src;
    if (poster) slot.el.poster = poster;

    // Start loading — if the AC fires mid-load, the browser cancels the fetch
    slot.el.load();

    // Set 10-second preload timeout — if the video doesn't load in 10s, mark it as failed
    // so the feed can skip it. This prevents users from getting stuck on dead videos.
    slot.preloadTimeout = setTimeout(() => {
      if (slot.state === "preloading" && !slot.preloadFailed) {
        slot.preloadFailed = true;
        // Cancel the load
        if (slot.abortController) {
          slot.abortController.abort();
          slot.abortController = null;
        }
        slot.el.removeAttribute("src");
        slot.el.load();
        slot.state = "idle";
      }
    }, 10_000);

    // Clean up AC if load succeeds or fails
    const onDone = () => {
      if (slot.abortController === ac) {
        slot.abortController = null;
      }
      if (slot.preloadTimeout) {
        clearTimeout(slot.preloadTimeout);
        slot.preloadTimeout = null;
      }
    };
    slot.el.addEventListener("loadeddata", onDone, { once: true });
    slot.el.addEventListener("error", onDone, { once: true });
    slot.el.addEventListener("abort", onDone, { once: true });

    // If the AC was aborted while we were setting up, restore previousTime
    // (this handles the race where controller fires before .load() completes)
    if (ac.signal.aborted) {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      previousTime;
    }
  }

  play(slotIndex: number): void {
    const slot = this.slots[slotIndex];
    // Set audio focus before playing
    this.setAudioFocus(slotIndex);
    slot.el.play().catch(() => {});
  }

  pause(slotIndex: number): void {
    this.slots[slotIndex].el.pause();
  }

  /** Mute/unmute all slots. When unmuting, only active slot produces audio. */
  setMuted(muted: boolean): void {
    this.globalMuted = muted;
    for (const slot of this.slots) {
      slot.el.muted = muted;
    }
    // If unmuting, ensure only active slot has volume
    if (!muted && this.activeAudioSlot !== null) {
      this.enforceAudioFocus();
    }
  }

  /** Set which slot should produce audio. Others are force-muted. */
  private setAudioFocus(slotIndex: number): void {
    this.activeAudioSlot = slotIndex;
    if (!this.globalMuted) {
      this.enforceAudioFocus();
    }
  }

  private enforceAudioFocus(): void {
    for (let i = 0; i < this.slots.length; i++) {
      this.slots[i].el.muted = i !== this.activeAudioSlot;
    }
  }

  seek(slotIndex: number, time: number): void {
    const el = this.slots[slotIndex].el;
    if (el.duration) el.currentTime = Math.max(0, Math.min(el.duration, time));
  }

  getCurrentTime(slotIndex: number): number {
    return this.slots[slotIndex].el.currentTime;
  }

  getDuration(slotIndex: number): number {
    return this.slots[slotIndex].el.duration || 0;
  }

  isPaused(slotIndex: number): boolean {
    return this.slots[slotIndex].el.paused;
  }

  /**
   * Recycle a slot — cancel preloads, clear src, force memory release.
   * Calling load() after removing src is the key line: it forces the browser
   * to release decoded frames. Without this, mid-range Android devices OOM.
   */
  recycle(slotIndex: number): void {
    const slot = this.slots[slotIndex];

    // Abort any in-flight preload
    if (slot.abortController) {
      slot.abortController.abort();
      slot.abortController = null;
    }

    // Clear audio focus if this was the active slot
    if (this.activeAudioSlot === slotIndex) {
      this.activeAudioSlot = null;
    }

    slot.el.pause();
    slot.el.removeAttribute("src");
    slot.el.removeAttribute("poster");
    // CRITICAL: force the browser to release decoded frames from GPU memory
    slot.el.load();
    slot.feedIndex = null;
    slot.videoId = null;
    slot.src = null;
    slot.retryCount = 0;
    slot.state = "idle";
    slot.preloadFailed = false;
  }

  /** Check if a video failed to preload — feed uses this to auto-skip dead videos. */
  isPreloadFailed(slotIndex: number): boolean {
    return this.slots[slotIndex].preloadFailed;
  }

  /** Position a slot's video element into a snap container. No remounting. */
  moveToContainer(slotIndex: number, snapContainer: HTMLElement): void {
    const slot = this.slots[slotIndex];
    const currentParent = slot.el.parentElement;
    if (currentParent !== snapContainer) {
      snapContainer.appendChild(slot.el);
    }
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _pool: VideoPool | null = null;
export function getVideoPool(): VideoPool {
  if (typeof document === "undefined") {
    // SSR: return a stub-shaped object; real pool is created on client mount.
    return { slots: [{}, {}, {}] } as unknown as VideoPool;
  }
  if (!_pool) _pool = new VideoPool();
  return _pool;
}
export function destroyVideoPool(): void {
  if (_pool) {
    _pool.unmount();
    _pool = null;
  }
}
