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

const WINDOW_SIZE = 1; // active ± 1 → 3 cards total

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

  // Scroll to initialIndex on first load
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

  // IntersectionObserver to track which snap item is most visible
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

  // Sync muted state to all pool slots
  useEffect(() => {
    pool.setMuted(muted);
  }, [muted, pool]);

  // Assign pool slot by video index (round-robin via modulo)
  const poolSlotFor = useCallback(
    (videoIndex: number): number => videoIndex % 3,
    []
  );

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
                state={slotState}
                initialLiked={likedSet?.has(v.id)}
                initialSaved={savedSet?.has(v.id)}
              />
            ) : (
              <Placeholder thumbnail={v.thumbnail_url} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Placeholder({ thumbnail }: { thumbnail: string | null }) {
  return (
    <div className="h-full w-full bg-black">
      {thumbnail && (
        <img src={thumbnail} alt="" className="h-full w-full object-cover opacity-40" />
      )}
    </div>
  );
}
