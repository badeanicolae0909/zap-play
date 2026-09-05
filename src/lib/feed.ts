import { supabase } from "@/integrations/supabase/client";
import type { FeedVideo } from "@/components/VideoCard";
import { resolveVideoSource } from "./video-source";
import { resolveBunkr } from "./bunkr.functions";
import { bunkrCache } from "./bunkr-cache";

// Direct media (mp4/webm/etc.) or Supabase-storage hosted videos load instantly.
// External links (bunkr/turbo/iframe) need a server resolve round-trip, so we
// interleave them with direct ones — direct first — to keep playback snappy.
const DIRECT_EXT = /\.(mp4|webm|m3u8|mov|m4v|ogv)(\?|#|$)/i;
function isDirectUpload(url: string): boolean {
  if (!url) return false;
  if (DIRECT_EXT.test(url)) return true;
  return /\/storage\/v1\/object\/public\/videos\//i.test(url);
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const PAGE = 1000;

async function fetchAllActive(creatorId?: string): Promise<FeedVideo[]> {
  const out: FeedVideo[] = [];
  for (let from = 0; from < 5000; from += PAGE) {
    let q = supabase
      .from("videos")
      .select("id, video_url, thumbnail_url, caption, tags, like_count, view_count, creator:creators(id, username, display_name, avatar_url)")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (creatorId) q = q.eq("creator_id", creatorId);
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as unknown as FeedVideo[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

export async function fetchFeed(limit = 30, creatorId?: string): Promise<FeedVideo[]> {
  const all = await fetchAllActive(creatorId);

  // Single-creator feeds keep chronological order.
  if (creatorId) return all.slice(0, limit);
  if (!all.length) return [];

  // ---- Watch-history aware rotation -------------------------------------
  // Videos the viewer has never seen come first (in random order); already
  // seen ones follow, oldest-watched first. Once the whole library has been
  // watched the memory resets so rotation starts over instead of freezing.
  let seen = getSeenMap();
  const unseenCount = all.filter((v) => !(v.id in seen)).length;
  if (unseenCount < Math.min(10, Math.ceil(all.length * 0.05))) {
    resetSeen();
    seen = {};
  }

  const now = Date.now();
  const scored = all.map((v) => {
    const last = seen[v.id];
    // Lower score = earlier in the feed.
    const base = last === undefined ? 0 : 1 + Math.max(0, 1 - (now - last) / (1000 * 60 * 60 * 24 * 7));
    return { v, score: base + Math.random() * 0.9 };
  });
  scored.sort((a, b) => a.score - b.score);
  const ranked = scored.map((s) => s.v);

  // ---- Creator spacing ---------------------------------------------------
  // Walk the ranked list and avoid two videos from the same creator in a row
  // (and no more than 2 from a creator within any 5-video window).
  const out: FeedVideo[] = [];
  const remaining = ranked.slice();
  const recent: string[] = [];
  while (out.length < limit && remaining.length) {
    let pickIdx = remaining.findIndex((v) => {
      const cid = v.creator?.id ?? "_none";
      if (recent[recent.length - 1] === cid) return false;
      return recent.slice(-5).filter((c) => c === cid).length < 2;
    });
    if (pickIdx === -1) pickIdx = 0;
    const [next] = remaining.splice(pickIdx, 1);
    out.push(next);
    recent.push(next.creator?.id ?? "_none");
  }

  // Keep the very first slots on instantly playable uploads so the app never
  // opens on a spinner — pull one forward if the opener needs resolving.
  for (let i = 0; i < Math.min(3, out.length); i++) {
    if (isDirectUpload(out[i].video_url)) continue;
    const swap = out.findIndex((v, j) => j > i && isDirectUpload(v.video_url));
    if (swap > -1) {
      const [d] = out.splice(swap, 1);
      out.splice(i, 0, d);
    }
  }

  return out;


export async function fetchUserInteractions(userId: string) {
  const [{ data: likes }, { data: favs }] = await Promise.all([
    supabase.from("likes").select("video_id").eq("user_id", userId),
    supabase.from("favorites").select("video_id").eq("user_id", userId),
  ]);
  return {
    liked: new Set((likes ?? []).map((l) => l.video_id)),
    saved: new Set((favs ?? []).map((f) => f.video_id)),
  };
}

/**
 * Pre-resolve Bunkr page URLs for the first `count` videos so the pool never
 * shows a loading spinner for the initially visible window.
 * Modifies videos in-place with _resolvedSrc.
 */
export async function preResolveBunkr(videos: FeedVideo[], count: number): Promise<void> {
  const toResolve = videos.slice(0, count).filter((v) => {
    const src = resolveVideoSource(v.video_url);
    return src.kind === "bunkr";
  });
  if (!toResolve.length) return;

  await Promise.allSettled(
    toResolve.map(async (v) => {
      try {
        const res = await resolveBunkr({ data: { pageUrl: v.video_url } });
        bunkrCache.set(v.video_url, res);
        v._resolvedSrc = res.src;
      } catch {
        v._resolvedSrc = null;
      }
    })
  );
}
