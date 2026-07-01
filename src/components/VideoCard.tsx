import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, Bookmark, Share2, Play, Volume2, VolumeX, Music2, FastForward, Rewind, Loader2, Pencil, Trash2, RefreshCw, AlertTriangle } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { useAuth } from "@/lib/auth";
import { haptic, hapticSuccess } from "@/lib/telegram";
import { toast } from "sonner";
import { resolveVideoSource } from "@/lib/video-source";
import { resolveBunkr } from "@/lib/bunkr.functions";
import { bunkrCache } from "@/lib/bunkr-cache";
import type { VideoPool, SlotState } from "@/lib/video-pool";

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
  _resolvedSrc?: string | null;
};

type Props = {
  video: FeedVideo;
  active: boolean;
  muted: boolean;
  onToggleMute: () => void;
  pool: VideoPool;
  poolSlot: number;
  state: SlotState;
  initialLiked?: boolean;
  initialSaved?: boolean;
};

export function VideoCard({
  video, active, muted, onToggleMute,
  pool, poolSlot, state,
  initialLiked, initialSaved,
}: Props) {
  const source = useMemo(() => resolveVideoSource(video.video_url), [video.video_url]);
  const isEmbed = source.kind === "iframe";
  const needsResolve = source.kind === "bunkr";

  const [resolvedSrc, setResolvedSrc] = useState<string | null>(() => {
    if (video._resolvedSrc) return video._resolvedSrc;
    return needsResolve ? null : source.src;
  });

  useEffect(() => {
    if (!needsResolve) { setResolvedSrc(source.src); return; }
    if (video._resolvedSrc) { setResolvedSrc(video._resolvedSrc); return; }
    let alive = true;
    const cached = bunkrCache.get(source.src);
    if (cached && cached.expiresAt * 1000 > Date.now() + 30_000) {
      setResolvedSrc(cached.src);
      return;
    }
    if (active) {
      resolveBunkr({ data: { pageUrl: source.src } })
        .then((res) => {
          bunkrCache.set(source.src, res);
          if (alive) setResolvedSrc(res.src);
        })
        .catch(() => {});
    }
    return () => { alive = false; };
  }, [source, needsResolve, active, video._resolvedSrc]);

  const mountRef = useRef<HTMLDivElement>(null);
  const [videoMounted, setVideoMounted] = useState(false);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    if (active && resolvedSrc && !isEmbed) {
      pool.assign(poolSlot, 0, video.id, resolvedSrc, video.thumbnail_url);
      pool.moveToContainer(poolSlot, el);
      setVideoMounted(true);
      pool.play(poolSlot);
    }
    return () => {
      if (!active) {
        pool.pause(poolSlot);
        setVideoMounted(false);
      }
    };
  }, [active, resolvedSrc, isEmbed, video.id, video.thumbnail_url, pool, poolSlot]);

  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [liked, setLiked] = useState(!!initialLiked);
  const [saved, setSaved] = useState(!!initialSaved);
  const [likeBurst, setLikeBurst] = useState(0);
  const [likeCount, setLikeCount] = useState(video.like_count);
  const [scrubbing, setScrubbing] = useState(false);
  const [seekIndicator, setSeekIndicator] = useState<{ dir: 1 | -1; speed: number } | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const viewedRef = useRef(false);

  const progressRef = useRef<HTMLDivElement>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekRAF = useRef<number | null>(null);
  const isSeekingRef = useRef(false);
  const seekStartTime = useRef(0);
  const seekDir = useRef<1 | -1>(1);
  const lastTapRef = useRef(0);
  const pointerStart = useRef<{ x: number; y: number; t: number } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrubWasPausedRef = useRef(false);
  const scrubbingRef = useRef(false);

  useEffect(() => {
    if (!active || !videoMounted) return;
    const tick = () => {
      const el = pool.slots[poolSlot].el;
      if (scrubbing || isSeekingRef.current || !el.duration) return;
      setProgress((el.currentTime / el.duration) * 100);
    };
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [active, videoMounted, pool, poolSlot, scrubbing]);

  function showControls() {
    setControlsVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControlsVisible(false), 2000);
  }

  useEffect(() => {
    if (active) showControls();
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    if (active && !viewedRef.current) {
      viewedRef.current = true;
      void supabase
        .from("video_views")
        .insert({ video_id: video.id, user_id: user?.id ?? null })
        .then(({ error }) => {
          if (error) console.warn("view insert failed", error);
        });
    }
  }, [active, video.id, user?.id]);

  useEffect(() => {
    if (!active || !videoMounted) return;
    const el = pool.slots[poolSlot].el;
    const onPlay = () => setPaused(false);
    const onPause = () => setPaused(true);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    return () => {
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
    };
  }, [active, videoMounted, pool, poolSlot]);

  function togglePlay() {
    haptic("light");
    const el = pool.slots[poolSlot].el;
    if (el.paused) { pool.play(poolSlot); } else { pool.pause(poolSlot); }
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

  function editAsAdmin() {
    haptic("light");
    navigate({ to: "/admin", search: { tab: "videos", edit: video.id } });
  }

  async function deleteAsAdmin() {
    setDeleting(true);
    const { error } = await supabase.from("videos").delete().eq("id", video.id);
    setDeleting(false);
    setConfirmDelete(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Video deleted");
    qc.invalidateQueries({ queryKey: ["feed"] });
    qc.invalidateQueries({ queryKey: ["admin-videos"] });
  }

  // ---- Hold-to-seek ----
  function startSeek(dir: 1 | -1) {
    const el = pool.slots[poolSlot].el;
    if (!el) return;
    isSeekingRef.current = true;
    seekDir.current = dir;
    seekStartTime.current = performance.now();
    haptic("medium");
    const tick = () => {
      if (!isSeekingRef.current) return;
      const v = pool.slots[poolSlot].el;
      const elapsed = (performance.now() - seekStartTime.current) / 1000;
      const speed = Math.min(2 + elapsed * 2, 10);
      const delta = (1 / 60) * speed * dir;
      const dur = v.duration || 0;
      v.currentTime = Math.max(0, Math.min(dur, v.currentTime + delta));
      if (dur) setProgress((v.currentTime / dur) * 100);
      setSeekIndicator({ dir, speed });
      seekRAF.current = requestAnimationFrame(tick);
    };
    seekRAF.current = requestAnimationFrame(tick);
  }

  function stopSeek() {
    if (seekRAF.current) cancelAnimationFrame(seekRAF.current);
    isSeekingRef.current = false;
    seekRAF.current = null;
    setSeekIndicator(null);
  }

  function onOverlayPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const dir: 1 | -1 = x < rect.width / 2 ? -1 : 1;
    pointerStart.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null;
      startSeek(dir);
    }, 450);
  }

  function onOverlayPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const start = pointerStart.current;
    if (!start || isSeekingRef.current) return;
    const dx = Math.abs(e.clientX - start.x);
    const dy = Math.abs(e.clientY - start.y);
    if (dx > 8 || dy > 8) {
      if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
      pointerStart.current = null;
    }
  }

  function onOverlayPointerUp() {
    const wasHold = !!holdTimer.current;
    if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
    if (isSeekingRef.current) { stopSeek(); pointerStart.current = null; return; }
    if (!wasHold) { pointerStart.current = null; return; }
    const now = Date.now();
    if (now - lastTapRef.current < 320) {
      lastTapRef.current = 0;
      togglePlay();
    } else {
      lastTapRef.current = now;
      showControls();
    }
    pointerStart.current = null;
  }

  function onOverlayPointerCancel() {
    if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
    if (isSeekingRef.current) stopSeek();
    pointerStart.current = null;
  }

  // ---- Draggable progress bar ----
  function seekFromClientX(clientX: number) {
    const el = progressRef.current;
    const v = pool.slots[poolSlot].el;
    if (!el || !v.duration) return;
    const rect = el.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    v.currentTime = pct * v.duration;
    setProgress(pct * 100);
  }

  function onScrubDown(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    setScrubbing(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pool.pause(poolSlot);
    haptic("light");
    seekFromClientX(e.clientX);
  }

  function onScrubMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!scrubbing) return;
    e.stopPropagation();
    seekFromClientX(e.clientX);
  }

  function onScrubUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!scrubbing) return;
    e.stopPropagation();
    setScrubbing(false);
    if (active && !paused) pool.play(poolSlot);
  }

  const showLoading = (!isEmbed && (state === "preloading" || state === "error_retry") && !resolvedSrc);
  const showError = !isEmbed && state === "error";
  const showThumbnailOnly = !isEmbed && !videoMounted && video.thumbnail_url;

  // Manual retry for permanent errors
  function retryLoad() {
    if (!resolvedSrc) return;
    pool.slots[poolSlot].retryCount = 0;
    pool.slots[poolSlot].state = "preloading";
    pool.slots[poolSlot].el.src = resolvedSrc;
    if (video.thumbnail_url) pool.slots[poolSlot].el.poster = video.thumbnail_url;
    pool.slots[poolSlot].el.load();
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      {/* Mount point for pool video element */}
      <div ref={mountRef} className="absolute inset-0" />

      {/* Iframe embeds */}
      {isEmbed && active && (
        <iframe
          key={source.src}
          src={source.src}
          title={video.caption ?? "video"}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full border-0 pointer-events-none"
        />
      )}

      {/* Gesture overlay — captures pointer events for seek/tap */}
      {!isEmbed && videoMounted && (
        <div
          className="absolute inset-0 z-10"
          style={{ touchAction: "pan-y" }}
          onPointerDown={onOverlayPointerDown}
          onPointerMove={onOverlayPointerMove}
          onPointerUp={onOverlayPointerUp}
          onPointerCancel={onOverlayPointerCancel}
          onPointerLeave={onOverlayPointerCancel}
        />
      )}

      {/* Loading / error states */}
      {showLoading && (
        <>
          {video.thumbnail_url && (
            <img src={video.thumbnail_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
          )}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <Loader2 className="h-7 w-7 animate-spin text-foreground/70" />
            {state === "error_retry" && (
              <span className="text-[11px] text-muted-foreground">
                Retrying… ({pool.slots[poolSlot].retryCount}/{pool.slots[poolSlot].maxRetries})
              </span>
            )}
          </div>
        </>
      )}

      {showError && (
        <>
          {video.thumbnail_url && (
            <img src={video.thumbnail_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-20" />
          )}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60">
            <AlertTriangle className="h-8 w-8 text-destructive/70" />
            <p className="text-sm text-muted-foreground">Video failed to load</p>
            <button
              onClick={(e) => { e.stopPropagation(); retryLoad(); haptic("light"); }}
              className="tap-scale flex items-center gap-2 rounded-full glass px-4 py-2 text-sm font-medium"
            >
              <RefreshCw className="h-4 w-4" />
              Retry
            </button>
          </div>
        </>
      )}

      {/* Thumbnail-only (mounting but video not yet assigned) */}
      {showThumbnailOnly && !showLoading && !showError && (
        <img src={video.thumbnail_url!} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" />
      )}

      {/* Gradients */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 gradient-overlay-top z-20" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-64 gradient-overlay z-20" />

      {/* Paused indicator */}
      <AnimatePresence>
        {paused && !scrubbing && !seekIndicator && (
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }}
            className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"
          >
            <div className="glass-strong rounded-full p-5"><Play className="h-10 w-10 fill-foreground" /></div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Seek indicator */}
      <AnimatePresence>
        {seekIndicator && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
            className={`pointer-events-none absolute inset-y-0 z-30 ${seekIndicator.dir === 1 ? "right-0" : "left-0"} flex w-1/2 items-center justify-center`}
          >
            <div className="glass-strong flex items-center gap-2 rounded-full px-5 py-3">
              {seekIndicator.dir === 1 ? <FastForward className="h-6 w-6 fill-foreground" /> : <Rewind className="h-6 w-6 fill-foreground" />}
              <span className="text-sm font-bold tabular-nums">{seekIndicator.speed.toFixed(1)}x</span>
            </div>
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
            className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"
          >
            <Heart className="h-32 w-32 fill-primary text-primary drop-shadow-[0_0_30px_rgba(255,100,200,0.6)]" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mute toggle */}
      {!isEmbed && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleMute(); haptic("light"); }}
          className={`tap-scale absolute right-3 top-3 z-40 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 backdrop-blur-md ring-1 ring-white/10 transition-all duration-300 hover:bg-black/60 ${controlsVisible || paused ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        >
          {muted ? <VolumeX className="h-4 w-4 text-white/90" /> : <Volume2 className="h-4 w-4 text-white/90" />}
        </button>
      )}

      {/* Right action rail — modern minimal glass design */}
      <div className={`absolute bottom-36 right-3 z-40 flex flex-col items-center gap-3 transition-all duration-300 ${controlsVisible || paused ? "opacity-100 translate-x-0" : "opacity-0 translate-x-2 pointer-events-none"}`}>
        {video.creator && (
          <Link to="/creator/$username" params={{ username: video.creator.username }} className="tap-scale relative group">
            <div className="h-10 w-10 overflow-hidden rounded-full ring-2 ring-white/20 transition-all group-hover:ring-white/50">
              {video.creator.avatar_url ? (
                <img src={video.creator.avatar_url} alt={video.creator.display_name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center gradient-primary text-xs font-bold text-primary-foreground">
                  {video.creator.display_name.charAt(0)}
                </div>
              )}
            </div>
            <div className="absolute -bottom-1 left-1/2 flex h-4 w-4 -translate-x-1/2 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground shadow-lg">+</div>
          </Link>
        )}
        <button onClick={toggleLike} className="tap-scale group flex flex-col items-center gap-0.5">
          <div className={`flex h-10 w-10 items-center justify-center rounded-full bg-black/40 backdrop-blur-md ring-1 ring-white/10 transition-all group-hover:bg-black/60 ${liked ? "ring-primary/50" : ""}`}>
            <Heart className={`h-5 w-5 transition-all ${liked ? "fill-primary text-primary scale-110" : "text-white/80 group-hover:text-white"}`} />
          </div>
          <span className="text-[10px] font-semibold text-white/70 drop-shadow">{fmt(likeCount)}</span>
        </button>
        <button onClick={toggleSave} className="tap-scale group flex flex-col items-center gap-0.5">
          <div className={`flex h-10 w-10 items-center justify-center rounded-full bg-black/40 backdrop-blur-md ring-1 ring-white/10 transition-all group-hover:bg-black/60 ${saved ? "ring-accent/50" : ""}`}>
            <Bookmark className={`h-5 w-5 transition-all ${saved ? "fill-accent text-accent scale-110" : "text-white/80 group-hover:text-white"}`} />
          </div>
          <span className="text-[10px] font-semibold text-white/70 drop-shadow">Save</span>
        </button>
        <button onClick={share} className="tap-scale group flex flex-col items-center gap-0.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 backdrop-blur-md ring-1 ring-white/10 transition-all group-hover:bg-black/60">
            <Share2 className="h-5 w-5 text-white/80 transition-all group-hover:text-white" />
          </div>
          <span className="text-[10px] font-semibold text-white/70 drop-shadow">Share</span>
        </button>
        {isAdmin && (
          <>
            <button onClick={editAsAdmin} className="tap-scale group flex flex-col items-center gap-0.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 backdrop-blur-md ring-1 ring-white/10 transition-all group-hover:bg-black/60">
                <Pencil className="h-5 w-5 text-white/80 transition-all group-hover:text-white" />
              </div>
              <span className="text-[10px] font-semibold text-white/70 drop-shadow">Edit</span>
            </button>
            <button onClick={() => setConfirmDelete(true)} className="tap-scale group flex flex-col items-center gap-0.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 backdrop-blur-md ring-1 ring-white/10 transition-all group-hover:bg-red-500/20 group-hover:ring-red-500/30">
                <Trash2 className="h-5 w-5 text-white/80 transition-all group-hover:text-red-400" />
              </div>
              <span className="text-[10px] font-semibold text-white/70 drop-shadow">Delete</span>
            </button>
          </>
        )}
      </div>

      {isAdmin && (
        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogContent className="glass">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this video?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently removes the video from the feed. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={deleting}
                onClick={(e) => { e.preventDefault(); deleteAsAdmin(); }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? "Deleting…" : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Bottom info */}
      <div className={`absolute inset-x-0 bottom-24 z-40 px-4 transition-opacity duration-300 ${controlsVisible || paused ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
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
      {!isEmbed && (
        <div
          ref={progressRef}
          onPointerDown={onScrubDown}
          onPointerMove={onScrubMove}
          onPointerUp={onScrubUp}
          onPointerCancel={onScrubUp}
          className={`absolute inset-x-0 bottom-[92px] z-40 flex h-6 touch-none items-center px-3 transition-opacity duration-300 ${controlsVisible || paused || scrubbing ? "opacity-100" : "opacity-0"}`}
        >
          <div className={`relative w-full overflow-visible rounded-full bg-foreground/15 transition-all ${scrubbing ? "h-1.5" : "h-0.5"}`}>
            <div className="h-full rounded-full bg-foreground/90 transition-[width] duration-100" style={{ width: `${progress}%` }} />
            <div
              className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground shadow-lg transition-all ${scrubbing ? "h-4 w-4 opacity-100" : "h-2.5 w-2.5 opacity-0"}`}
              style={{ left: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}
