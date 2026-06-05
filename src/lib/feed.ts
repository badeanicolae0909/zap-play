import { supabase } from "@/integrations/supabase/client";
import type { FeedVideo } from "@/components/VideoCard";

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
  // Pull a wider pool so we have room to interleave + randomize per visit.
  // Pull a much wider pool so every creator gets representation in the mix.
  const pool = creatorId ? limit : 500;
  let q = supabase
    .from("videos")
    .select("id, video_url, thumbnail_url, caption, tags, like_count, view_count, creator:creators(id, username, display_name, avatar_url)")
    .order("created_at", { ascending: false })
    .limit(pool);
  if (creatorId) q = q.eq("creator_id", creatorId);
  const { data, error } = await q;
  if (error) throw error;
  const all = (data ?? []) as unknown as FeedVideo[];

  // Single-creator feeds keep chronological order.
  if (creatorId) return all.slice(0, limit);

  // Group by creator, shuffle each group, then round-robin so every creator
  // gets a turn before any creator gets a second video. This guarantees
  // diversity across the visible feed instead of bunching one creator together.
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
    // First pass: prioritize direct uploads so the very first card plays
    // instantly. After that, just round-robin in shuffled order.
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
      // Avoid same creator twice in a row when alternatives still exist.
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
