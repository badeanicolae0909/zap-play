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
  const pool = creatorId ? limit : Math.max(limit * 2, 60);
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

  const direct = shuffle(all.filter((v) => isDirectUpload(v.video_url)));
  const link = shuffle(all.filter((v) => !isDirectUpload(v.video_url)));

  // Interleave starting with a direct upload so the first card plays instantly,
  // giving link-based videos time to resolve in the background.
  const out: FeedVideo[] = [];
  let di = 0, li = 0;
  while (out.length < limit && (di < direct.length || li < link.length)) {
    if (di < direct.length) out.push(direct[di++]);
    if (out.length < limit && li < link.length) out.push(link[li++]);
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
