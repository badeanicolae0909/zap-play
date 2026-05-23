import { useEffect, useRef, useState } from "react";
import { VideoCard, type FeedVideo } from "@/components/VideoCard";
import { Loader2 } from "lucide-react";

type Props = {
  videos: FeedVideo[];
  likedSet?: Set<string>;
  savedSet?: Set<string>;
  loading?: boolean;
  emptyText?: string;
};

export function VideoFeed({ videos, likedSet, savedSet, loading, emptyText }: Props) {
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

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
      {videos.map((v, i) => (
        <div
          key={v.id}
          ref={(el) => { itemRefs.current[i] = el; }}
          data-idx={i}
          className="snap-item relative h-full w-full"
        >
          <VideoCard
            video={v}
            active={i === active}
            muted={muted}
            onToggleMute={() => setMuted((m) => !m)}
            initialLiked={likedSet?.has(v.id)}
            initialSaved={savedSet?.has(v.id)}
          />
        </div>
      ))}
    </div>
  );
}
