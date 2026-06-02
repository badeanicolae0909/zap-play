import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav } from "@/components/BottomNav";
import { ChevronLeft, Play } from "lucide-react";
import { haptic } from "@/lib/telegram";

export const Route = createFileRoute("/creator/$username")({ component: CreatorPage });

type VideoRow = {
  id: string;
  thumbnail_url: string | null;
  video_url: string;
  view_count: number;
};

function CreatorPage() {
  const { username } = Route.useParams();
  const nav = useNavigate();

  const { data } = useQuery({
    queryKey: ["creator", username],
    queryFn: async () => {
      const { data: c } = await supabase.from("creators").select("*").eq("username", username).maybeSingle();
      if (!c) return null;
      const { data: v } = await supabase.from("videos").select("id, thumbnail_url, video_url, view_count").eq("creator_id", c.id).order("created_at", { ascending: false });
      return { creator: c, videos: (v ?? []) as VideoRow[] };
    },
  });

  if (!data?.creator) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading…<BottomNav /></main>
    );
  }
  const c = data.creator;

  return (
    <main className="min-h-screen bg-background pb-32">
      {/* Cover */}
      <div className="relative h-44 w-full overflow-hidden">
        <div className="absolute inset-0 gradient-primary opacity-60" />
        {c.cover_url && <img src={c.cover_url} className="absolute inset-0 h-full w-full object-cover" alt="" />}
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-background/40" />
        <button onClick={() => nav({ to: "/" })} className="absolute left-3 top-3 glass tap-scale rounded-full p-2" aria-label="Back" style={{ marginTop: "env(safe-area-inset-top)" }}>
          <ChevronLeft className="h-5 w-5" />
        </button>
      </div>

      <div className="relative z-10 -mt-12 px-5">
        <div className="flex flex-col items-center gap-2">
          <div className="relative z-10 h-24 w-24 overflow-hidden rounded-full border-4 border-background gradient-primary shadow-lg">
            {c.avatar_url && <img src={c.avatar_url} className="h-full w-full object-cover" alt={c.display_name} />}
          </div>
          <h1 className="mt-1 text-xl font-bold">{c.display_name}</h1>
          <p className="text-sm text-muted-foreground">@{c.username}</p>
          {c.bio && <p className="mt-2 text-center text-sm leading-relaxed">{c.bio}</p>}
        </div>

        <div className="mt-6 flex justify-around rounded-2xl glass p-4">
          <Stat label="Videos" value={c.video_count} />
          <div className="w-px bg-border" />
          <Stat label="Likes" value={c.like_count} />
          <div className="w-px bg-border" />
          <Stat label="Followers" value={c.follower_count} />
        </div>

        <h2 className="mb-3 mt-6 text-sm font-semibold text-muted-foreground">Videos</h2>
        <div className="grid grid-cols-3 gap-1">
          {data.videos.map((v) => (
            <VideoTile key={v.id} video={v} onOpen={() => nav({ to: "/v/$id", params: { id: v.id } })} />
          ))}
        </div>
      </div>
      <BottomNav />
    </main>
  );
}

function VideoTile({ video, onOpen }: { video: VideoRow; onOpen: () => void }) {
  const [previewing, setPreviewing] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moved = useRef(false);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const heldRef = useRef(false);

  function clearTimer() {
    if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
  }

  function endPreview() {
    setPreviewing(false);
    const el = videoRef.current;
    if (el) { el.pause(); el.currentTime = 0; }
  }

  function onPointerDown(e: React.PointerEvent) {
    moved.current = false;
    heldRef.current = false;
    startPos.current = { x: e.clientX, y: e.clientY };
    clearTimer();
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null;
      heldRef.current = true;
      haptic("medium");
      setPreviewing(true);
      // Try to start playback shortly after the element mounts.
      requestAnimationFrame(() => {
        const el = videoRef.current;
        if (el) { el.muted = true; el.play().catch(() => {}); }
      });
    }, 350);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!startPos.current) return;
    const dx = Math.abs(e.clientX - startPos.current.x);
    const dy = Math.abs(e.clientY - startPos.current.y);
    if (dx > 10 || dy > 10) {
      moved.current = true;
      clearTimer();
      if (heldRef.current) { heldRef.current = false; endPreview(); }
    }
  }

  function onPointerUpOrCancel() {
    const wasHold = heldRef.current;
    clearTimer();
    if (wasHold) {
      heldRef.current = false;
      endPreview();
      return;
    }
    if (!moved.current) {
      haptic("light");
      onOpen();
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUpOrCancel}
      onPointerCancel={onPointerUpOrCancel}
      onPointerLeave={() => { if (heldRef.current) { heldRef.current = false; endPreview(); } clearTimer(); }}
      onContextMenu={(e) => e.preventDefault()}
      className={`tap-scale relative aspect-[9/16] overflow-hidden rounded-md bg-card select-none ${previewing ? "z-20 scale-[1.6] shadow-2xl ring-2 ring-primary" : ""} transition-transform duration-200`}
      style={{ touchAction: "manipulation", WebkitTouchCallout: "none" }}
    >
      {video.thumbnail_url ? (
        <img src={video.thumbnail_url} className="pointer-events-none h-full w-full object-cover" alt="" draggable={false} />
      ) : (
        <video src={video.video_url} className="pointer-events-none h-full w-full object-cover" muted preload="metadata" />
      )}
      {previewing && (
        <video
          ref={videoRef}
          src={video.video_url}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          muted
          playsInline
          loop
          autoPlay
          preload="auto"
        />
      )}
      <div className="pointer-events-none absolute bottom-1 left-1 flex items-center gap-1 text-[10px] font-bold drop-shadow">
        <Play className="h-3 w-3 fill-foreground" />
        {fmt(video.view_count)}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-1 flex-col items-center">
      <span className="text-lg font-bold">{fmt(value)}</span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}

function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}
