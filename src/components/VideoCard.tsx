import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, Bookmark, Share2, Play, Volume2, VolumeX, Music2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { haptic, hapticSuccess } from "@/lib/telegram";
import { toast } from "sonner";

export type FeedVideo = {
  id: string;
  video_url: string;
  thumbnail_url: string | null;
  caption: string | null;
  tags: string[] | null;
  like_count: number;
  view_count: number;
  creator: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
};

type Props = {
  video: FeedVideo;
  active: boolean;
  muted: boolean;
  onToggleMute: () => void;
  initialLiked?: boolean;
  initialSaved?: boolean;
};

export function VideoCard({ video, active, muted, onToggleMute, initialLiked, initialSaved }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [liked, setLiked] = useState(!!initialLiked);
  const [saved, setSaved] = useState(!!initialSaved);
  const [likeBurst, setLikeBurst] = useState(0);
  const [likeCount, setLikeCount] = useState(video.like_count);
  const { user } = useAuth();
  const viewedRef = useRef(false);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (active) {
      v.currentTime = 0;
      v.play().catch(() => {});
      setPaused(false);
      if (!viewedRef.current) {
        viewedRef.current = true;
        supabase.from("video_views").insert({ video_id: video.id, user_id: user?.id ?? null });
      }
    } else {
      v.pause();
    }
  }, [active, video.id, user?.id]);

  function togglePlay() {
    const v = ref.current;
    if (!v) return;
    haptic("light");
    if (v.paused) { v.play(); setPaused(false); } else { v.pause(); setPaused(true); }
  }

  async function toggleLike() {
    if (!user) return;
    haptic("medium");
    if (liked) {
      setLiked(false); setLikeCount((c) => c - 1);
      await supabase.from("likes").delete().eq("user_id", user.id).eq("video_id", video.id);
    } else {
      setLiked(true); setLikeCount((c) => c + 1);
      setLikeBurst((n) => n + 1);
      hapticSuccess();
      await supabase.from("likes").insert({ user_id: user.id, video_id: video.id });
    }
  }

  async function toggleSave() {
    if (!user) return;
    haptic("medium");
    if (saved) {
      setSaved(false);
      await supabase.from("favorites").delete().eq("user_id", user.id).eq("video_id", video.id);
    } else {
      setSaved(true);
      await supabase.from("favorites").insert({ user_id: user.id, video_id: video.id });
      toast.success("Saved");
    }
  }

  async function share() {
    haptic("light");
    const url = window.location.origin + "/?v=" + video.id;
    if (navigator.share) {
      try { await navigator.share({ url, title: video.caption ?? "Reelx" }); } catch {}
    } else {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    }
  }

  function handleDoubleTap() {
    if (!liked) toggleLike();
    setLikeBurst((n) => n + 1);
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <video
        ref={ref}
        src={video.video_url}
        poster={video.thumbnail_url ?? undefined}
        loop
        muted={muted}
        playsInline
        preload="metadata"
        className="absolute inset-0 h-full w-full object-cover"
        onClick={togglePlay}
        onDoubleClick={handleDoubleTap}
        onTimeUpdate={(e) => {
          const t = e.currentTarget;
          if (t.duration) setProgress((t.currentTime / t.duration) * 100);
        }}
      />

      {/* Gradients */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 gradient-overlay-top" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-64 gradient-overlay" />

      {/* Paused indicator */}
      <AnimatePresence>
        {paused && (
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }}
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <div className="glass-strong rounded-full p-5"><Play className="h-10 w-10 fill-foreground" /></div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Like burst */}
      <AnimatePresence>
        {likeBurst > 0 && (
          <motion.div
            key={likeBurst}
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: [0, 1, 1, 0], scale: [0.4, 1.4, 1.2, 1.6] }}
            transition={{ duration: 0.9 }}
            onAnimationComplete={() => setLikeBurst(0)}
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <Heart className="h-32 w-32 fill-primary text-primary drop-shadow-[0_0_30px_rgba(255,100,200,0.6)]" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mute toggle */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleMute(); haptic("light"); }}
        className="tap-scale absolute right-3 top-3 z-20 glass rounded-full p-2.5"
      >
        {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>

      {/* Right action rail */}
      <div className="absolute bottom-28 right-3 z-20 flex flex-col items-center gap-5">
        {video.creator && (
          <Link to="/creator/$username" params={{ username: video.creator.username }} className="tap-scale relative">
            <div className="h-12 w-12 overflow-hidden rounded-full border-2 border-foreground gradient-primary">
              {video.creator.avatar_url && (
                <img src={video.creator.avatar_url} alt={video.creator.display_name} className="h-full w-full object-cover" />
              )}
            </div>
            <div className="absolute -bottom-2 left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full gradient-primary text-xs font-bold text-primary-foreground">+</div>
          </Link>
        )}
        <ActionBtn onClick={toggleLike} icon={<Heart className={`h-7 w-7 ${liked ? "fill-primary text-primary" : ""}`} />} label={fmt(likeCount)} active={liked} />
        <ActionBtn onClick={toggleSave} icon={<Bookmark className={`h-7 w-7 ${saved ? "fill-accent text-accent" : ""}`} />} label="Save" active={saved} />
        <ActionBtn onClick={share} icon={<Share2 className="h-7 w-7" />} label="Share" />
      </div>

      {/* Bottom info */}
      <div className="absolute inset-x-0 bottom-20 z-10 px-4">
        {video.creator && (
          <Link to="/creator/$username" params={{ username: video.creator.username }} className="inline-flex items-center gap-2">
            <span className="text-base font-bold tracking-tight">@{video.creator.username}</span>
          </Link>
        )}
        {video.caption && <p className="mt-1.5 line-clamp-2 text-sm leading-snug">{video.caption}</p>}
        {video.tags && video.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {video.tags.slice(0, 3).map((t) => (
              <span key={t} className="rounded-full glass px-2 py-0.5 text-[11px] font-medium text-muted-foreground">#{t}</span>
            ))}
          </div>
        )}
        {video.creator && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Music2 className="h-3 w-3" />
            <span className="truncate">Original — {video.creator.display_name}</span>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="absolute inset-x-0 bottom-16 z-10 h-0.5 bg-foreground/10">
        <div className="h-full bg-foreground/80 transition-[width] duration-100" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

function ActionBtn({ icon, label, onClick, active }: { icon: React.ReactNode; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button onClick={onClick} className="tap-scale flex flex-col items-center gap-0.5">
      <div className={`flex h-11 w-11 items-center justify-center rounded-full ${active ? "" : "glass"}`}>{icon}</div>
      <span className="text-[11px] font-semibold drop-shadow">{label}</span>
    </button>
  );
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}
