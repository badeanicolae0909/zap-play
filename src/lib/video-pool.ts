// VideoPool — 3 recyclable <video> elements managed imperatively outside React's tree.
// Slots rotate as the user scrolls. Elements are created once, never unmounted.
// Follows the RecyclerView pattern: reassign src, never destroy DOM.

export type SlotState = "idle" | "loading" | "ready" | "error";

export interface VideoSlot {
  el: HTMLVideoElement;
  feedIndex: number | null;
  videoId: string | null;
  state: SlotState;
}

export class VideoPool {
  readonly slots: [VideoSlot, VideoSlot, VideoSlot];
  private container: HTMLElement | null = null;

  constructor() {
    this.slots = [
      this.createSlot(0),
      this.createSlot(1),
      this.createSlot(2),
    ];
  }

  private createSlot(_index: number): VideoSlot {
    const el = document.createElement("video");
    el.setAttribute("playsinline", "");
    el.setAttribute("loop", "");
    el.setAttribute("muted", "");
    el.setAttribute("preload", "auto");
    el.className = "snap-item absolute inset-0 h-full w-full object-cover bg-black";
    el.style.cssText = "touch-action: pan-y; pointer-events: auto;";

    el.addEventListener("loadeddata", () => {
      const slot = this.slots.find((s) => s.el === el);
      if (slot) {
        slot.state = "ready";
      }
    });

    el.addEventListener("error", () => {
      const slot = this.slots.find((s) => s.el === el);
      if (slot) {
        slot.state = "error";
      }
    });

    return { el, feedIndex: null, videoId: null, state: "idle" };
  }

  /** Attach all 3 video elements to a DOM container. Call once in useEffect. */
  mount(container: HTMLElement): void {
    this.container = container;
    for (const slot of this.slots) {
      if (!slot.el.parentElement) {
        container.appendChild(slot.el);
      }
    }
  }

  /** Remove all video elements from the DOM. */
  unmount(): void {
    for (const slot of this.slots) {
      slot.el.pause();
      slot.el.removeAttribute("src");
      slot.el.remove();
    }
    this.container = null;
  }

  /** Assign video data to a pool slot. Triggers src load. */
  assign(
    slotIndex: number,
    feedIndex: number,
    videoId: string,
    src: string,
    poster?: string | null,
  ): void {
    const slot = this.slots[slotIndex];
    const sameVideo = slot.videoId === videoId;

    slot.feedIndex = feedIndex;
    slot.videoId = videoId;

    if (!sameVideo) {
      slot.state = "loading";
      slot.el.currentTime = 0;
      slot.el.src = src;
      if (poster) slot.el.poster = poster;
      slot.el.load();
    }
  }

  play(slotIndex: number): void {
    this.slots[slotIndex].el.play().catch(() => {});
  }

  pause(slotIndex: number): void {
    this.slots[slotIndex].el.pause();
  }

  setMuted(muted: boolean): void {
    for (const slot of this.slots) {
      slot.el.muted = muted;
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

  /** Cycle the slot — pause current, clear src, mark idle for reuse. */
  recycle(slotIndex: number): void {
    const slot = this.slots[slotIndex];
    slot.el.pause();
    slot.el.removeAttribute("src");
    slot.el.removeAttribute("poster");
    slot.feedIndex = null;
    slot.videoId = null;
    slot.state = "idle";
  }

  /** Get the currently "active" slot based on feed position. */
  getActiveSlot(): VideoSlot | undefined {
    return this.slots.find((s) => s.feedIndex !== null);
  }

  /** Position a slot's video element into the given snap container.
   *  The video moves between containers via appendChild — no remounting. */
  moveToContainer(slotIndex: number, snapContainer: HTMLElement): void {
    const slot = this.slots[slotIndex];
    const currentParent = slot.el.parentElement;
    if (currentParent !== snapContainer) {
      snapContainer.appendChild(slot.el);
    }
  }
}

// Singleton pool — one instance for the entire app lifecycle.
// The feed creates this once in a top-level useEffect and never re-creates it.
let _pool: VideoPool | null = null;
export function getVideoPool(): VideoPool {
  if (!_pool) _pool = new VideoPool();
  return _pool;
}
export function destroyVideoPool(): void {
  if (_pool) {
    _pool.unmount();
    _pool = null;
  }
}
