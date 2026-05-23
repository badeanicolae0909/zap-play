import { supabase } from "@/integrations/supabase/client";
import type { FeedVideo } from "@/components/VideoCard";

export async function fetchFeed(limit = 30, creatorId?: string): Promise<FeedVideo[]> {
  let q = supabase
    .from("videos")
    .select("id, video_url, thumbnail_url, caption, tags, like_count, view_count, creator:creators(id, username, display_name, avatar_url)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (creatorId) q = q.eq("creator_id", creatorId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as FeedVideo[];
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
