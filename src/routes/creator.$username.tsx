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
      const [{ data: v }, { data: mirrors }] = await Promise.all([
        supabase.from("videos").select("id, thumbnail_url, video_url, view_count, created_at").eq("creator_id", c.id).eq("is_active", true).order("created_at", { ascending: false }),
        supabase.from("video_mirrors").select("video_id").eq("creator_id", c.id),
      ]);
      let rows = (v ?? []) as Array<VideoRow & { created_at: string }>;
      const mirrorIds = (mirrors ?? []).map((m) => m.video_id).filter((id) => !rows.some((r) => r.id === id));
      if (mirrorIds.length) {
        const { data: mv } = await supabase
          .from("videos")
          .select("id, thumbnail_url, video_url, view_count, created_at")
          .in("id", mirrorIds)
          .eq("is_active", true);
        rows = [...rows, ...((mv ?? []) as Array<VideoRow & { created_at: string }>)].sort((a, b) =>
          a.created_at < b.created_at ? 1 : -1
        );
      }
      return { creator: c, videos: rows as VideoRow[] };
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
      <div className="relative h-52 w-full overflow-hidden">
        <div className="absolute inset-0 gradient-primary opacity-70" />
        {c.cover_url && <img src={c.cover_url} className="absolute inset-0 h-full w-full object-cover" alt="" />}
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-background" />
        <button
          onClick={() => nav({ to: "/" })}
          className="absolute left-4 top-4 glass tap-scale rounded-full p-2.5"
          aria-label="Back"
          style={{ marginTop: "env(safe-area-inset-top)" }}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      </div>

      {/* Profile card */}
      <div className="relative z-10 -mt-16 px-4">
        <div className="glass rounded-3xl p-6 shadow-elegant">
          <div className="flex flex-col items-center gap-2">
            <div className="relative -mt-16 h-32 w-32 overflow-hidden rounded-full border-4 border-background gradient-primary p-1 shadow-glow">
              <div className="h-full w-full overflow-hidden rounded-full bg-card">
                {c.avatar_url ? (
                  <img src={c.avatar_url} className="h-full w-full object-cover" alt={c.display_name} />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-primary-foreground">
                    {c.display_name?.[0]?.toUpperCase() ?? c.username?.[0]?.toUpperCase()}
                  </div>
                )}
              </div>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight">{c.display_name}</h1>
            <p className="text-sm text-muted-foreground">@{c.username}</p>
            {c.bio && <p className="mt-2 max-w-xs text-center text-sm leading-relaxed text-muted-foreground">{c.bio}</p>}
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3 rounded-2xl bg-secondary/40 p-4">
            <Stat label="Videos" value={c.video_count} />
            <Stat label="Likes" value={c.like_count} />
            <Stat label="Followers" value={c.follower_count} />
          </div>
        </div>
      </div>

      {/* Videos grid */}
      <div className="px-4 pt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Videos</h2>
          <span className="text-xs text-muted-foreground">{data.videos.length}</span>
        </div>
        {data.videos.length === 0 ? (
          <div className="rounded-2xl glass p-8 text-center text-sm text-muted-foreground">No videos yet</div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {data.videos.map((v) => (
              <VideoTile
                key={v.id}
                video={v}
                creator={{ username: c.username, display_name: c.display_name, avatar_url: c.avatar_url }}
                onOpen={() => nav({ to: "/v/$id", params: { id: v.id }, search: { from: username } })}
              />
            ))}
          </div>
        )}
      </div>
      <BottomNav />
    </main>
  );
}

function VideoTile({
  video,
  creator,
  onOpen,
}: {
  video: VideoRow;
  creator: { username: string; display_name: string; avatar_url: string | null };
  onOpen: () => void;
}) {
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
    if (e.pointerType === "mouse" && e.button !== 0) return;
    moved.current = false;
    heldRef.current = false;
    startPos.current = { x: e.clientX, y: e.clientY };
    clearTimer();
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null;
      if (moved.current) return;
      heldRef.current = true;
      haptic("medium");
      setPreviewing(true);
      requestAnimationFrame(() => {
        const el = videoRef.current;
        if (el) { el.muted = true; el.play().catch(() => {}); }
      });
    }, 500);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!startPos.current) return;
    const dx = Math.abs(e.clientX - startPos.current.x);
    const dy = Math.abs(e.clientY - startPos.current.y);
    if (dx > 6 || dy > 6) {
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
    startPos.current = null;
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
      className={`group tap-scale relative aspect-[9/16] overflow-hidden rounded-2xl bg-card shadow-lg ring-1 ring-border/50 select-none ${
        previewing ? "z-20 scale-[1.55] shadow-2xl ring-2 ring-primary" : ""
      } transition-transform duration-300`}
      style={{ touchAction: "pan-y", WebkitTouchCallout: "none" }}
    >
      {video.thumbnail_url ? (
        <img
          src={video.thumbnail_url}
          className="pointer-events-none h-full w-full object-cover"
          alt=""
          draggable={false}
          loading="lazy"
        />
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
      {/* Play icon */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-active:opacity-100">
        <div className="rounded-full bg-black/40 p-2 backdrop-blur-sm">
          <Play className="h-5 w-5 fill-foreground text-foreground" />
        </div>
      </div>
      {/* Bottom gradient */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
      {/* Creator avatar */}
      <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-2">
        <div className="h-7 w-7 overflow-hidden rounded-full border-2 border-white/20 bg-gradient-to-tr from-primary to-accent shadow">
          {creator.avatar_url ? (
            <img src={creator.avatar_url} className="h-full w-full object-cover" alt={creator.display_name} />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[10px] font-bold text-primary-foreground">
              {creator.display_name?.[0]?.toUpperCase()}
            </div>
          )}
        </div>
      </div>
      {/* View count */}
      <div className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
        <Play className="h-3 w-3 fill-white" />
        {fmt(video.view_count)}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
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
