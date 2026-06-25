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

export async function fetchFeed(limit = 30, creatorId?: string): Promise<FeedVideo[]> {
  const pool = creatorId ? limit : 500;
  let q = supabase
    .from("videos")
    .select("id, video_url, thumbnail_url, caption, tags, like_count, view_count, creator:creators(id, username, display_name, avatar_url)")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(pool);
  if (creatorId) q = q.eq("creator_id", creatorId);
  const { data, error } = await q;
  if (error) throw error;
  const all = (data ?? []) as unknown as FeedVideo[];

  // Single-creator feeds keep chronological order.
  if (creatorId) return all.slice(0, limit);

  // Group by creator, shuffle each group, then round-robin so every creator
  // gets a turn before any creator gets a second video.
  const byCreator = new Map<string, FeedVideo[]>();
  for (const v of all) {
    const key = v.creator?.id ?? "_none";
    if (!byCreator.has(key)) byCreator.set(key, []);
    byCreator.get(key)!.push(v);
  }
  const buckets = shuffle(Array.from(byCreator.values()).map((g) => shuffle(g)));

  const out: FeedVideo[] = [];
  let lastCreator: string | null = null;
  let firstPass = true;
  while (out.length < limit && buckets.some((b) => b.length)) {
    const order = buckets
      .map((b, i) => ({ b, i }))
      .filter((x) => x.b.length > 0)
      .sort((a, b) => {
        if (!firstPass) return 0;
        const ad = isDirectUpload(a.b[0].video_url) ? 0 : 1;
        const bd = isDirectUpload(b.b[0].video_url) ? 0 : 1;
        return ad - bd;
      });
    for (const { b } of order) {
      if (out.length >= limit) break;
      const cid = b[0].creator?.id ?? "_none";
      if (cid === lastCreator && order.some((o) => (o.b[0].creator?.id ?? "_none") !== lastCreator)) continue;
      const next = b.shift()!;
      out.push(next);
      lastCreator = cid;
    }
    firstPass = false;
  }
  return out;
}

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
