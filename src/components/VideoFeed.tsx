import { useEffect, useRef, useState, useCallback } from "react";
import { VideoCard, type FeedVideo } from "@/components/VideoCard";
import { Loader2 } from "lucide-react";
import { getVideoPool, type SlotState } from "@/lib/video-pool";

type Props = {
  videos: FeedVideo[];
  likedSet?: Set<string>;
  savedSet?: Set<string>;
  loading?: boolean;
  emptyText?: string;
  initialIndex?: number;
};

const WINDOW_SIZE = 1;

function isInWindow(i: number, active: number): boolean {
  return Math.abs(i - active) <= WINDOW_SIZE;
}

export function VideoFeed({ videos, likedSet, savedSet, loading, emptyText, initialIndex }: Props) {
  const [active, setActive] = useState(initialIndex ?? 0);
  const [muted, setMuted] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scrolledToInitial = useRef(false);
  const pool = useRef(getVideoPool()).current;
  const failedVideos = useRef<Set<string>>(new Set());

  // Scroll to initial index
  useEffect(() => {
    if (scrolledToInitial.current) return;
    if (!videos.length) return;
    const target = initialIndex ?? 0;
    const el = itemRefs.current[target];
    if (el) {
      el.scrollIntoView({ block: "start", behavior: "auto" });
      scrolledToInitial.current = true;
    }
  }, [videos.length, initialIndex]);

  // IntersectionObserver for active video detection
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting && e.intersectionRatio > 0.6) {
            const idx = Number((e.target as HTMLElement).dataset.idx);
            setActive(idx);
          }
        });
      },
      { threshold: [0, 0.6, 1] }
    );
    itemRefs.current.forEach((el) => el && obs.observe(el));
    return () => obs.disconnect();
  }, [videos.length]);

  // Sync muted state globally
  useEffect(() => {
    pool.setMuted(muted);
  }, [muted, pool]);

  // Assign pool slot by video index (round-robin modulo 3)
  const poolSlotFor = useCallback(
    (videoIndex: number): number => videoIndex % 3,
    []
  );

  // Auto-skip: when any pool slot's preload fails after timeout, mark it and advance
  const skipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    // Poll for preload-failed videos on slots
    const check = setInterval(() => {
      for (let s = 0; s < 3; s++) {
        const slot = pool.slots[s];
        if (slot.videoId && pool.isPreloadFailed(s)) {
          failedVideos.current.add(slot.videoId);
          // If the failed video is the active one, auto-scroll to next
          const failedIdx = videos.findIndex((v) => v.id === slot.videoId);
          if (failedIdx >= 0 && failedIdx === active && failedIdx < videos.length - 1) {
            const nextEl = itemRefs.current[failedIdx + 1];
            if (nextEl) {
              nextEl.scrollIntoView({ block: "start", behavior: "smooth" });
            }
          }
          // Clear the failed marker so we don't re-trigger
          pool.recycle(s);
        }
      }
    }, 2000);

    return () => clearInterval(check);
  }, [active, videos, pool]);

  // Recycle slots that are no longer in the visible window
  useEffect(() => {
    const activeSlot = poolSlotFor(active);
    const windowSlots = new Set<number>();
    for (let i = active - WINDOW_SIZE; i <= active + WINDOW_SIZE; i++) {
      if (i >= 0 && i < videos.length) {
        windowSlots.add(poolSlotFor(i));
      }
    }
    for (let s = 0; s < 3; s++) {
      if (!windowSlots.has(s) && pool.slots[s].state !== "idle") {
        pool.recycle(s);
      }
    }
  }, [active, videos.length, pool, poolSlotFor]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!videos.length) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <p className="text-center text-sm text-muted-foreground">{emptyText ?? "No videos yet."}</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="snap-feed no-scrollbar h-full w-full overflow-y-scroll">
      {videos.map((v, i) => {
        const inWindow = isInWindow(i, active);
        const slot = poolSlotFor(i);
        const isActive = i === active;
        const slotState: SlotState =
          pool.slots[slot].videoId === v.id ? pool.slots[slot].state : "idle";
        const isSkipped = failedVideos.current.has(v.id);

        return (
          <div
            key={v.id}
            ref={(el) => { itemRefs.current[i] = el; }}
            data-idx={i}
            className="snap-item relative h-full w-full"
          >
            {inWindow ? (
              <VideoCard
                video={v}
                active={isActive}
                muted={muted}
                onToggleMute={() => setMuted((m) => !m)}
                pool={pool}
                poolSlot={slot}
                state={isSkipped ? "error" : slotState}
                initialLiked={likedSet?.has(v.id)}
                initialSaved={savedSet?.has(v.id)}
              />
            ) : (
              <Placeholder thumbnail={v.thumbnail_url} skipped={isSkipped} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Placeholder({ thumbnail, skipped }: { thumbnail: string | null; skipped?: boolean }) {
  return (
    <div className="h-full w-full bg-black">
      {thumbnail && (
        <img src={thumbnail} alt="" className={`h-full w-full object-cover ${skipped ? "opacity-15" : "opacity-40"}`} />
      )}
      {skipped && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[10px] text-muted-foreground/50">Video unavailable</span>
        </div>
      )}
    </div>
  );
}
