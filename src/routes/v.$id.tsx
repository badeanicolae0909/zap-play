import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { VideoFeed } from "@/components/VideoFeed";
import { useAuth } from "@/lib/auth";
import { fetchUserInteractions } from "@/lib/feed";
import type { FeedVideo } from "@/components/VideoCard";

export const Route = createFileRoute("/v/$id")({
  validateSearch: (s: Record<string, unknown>) => ({
    from: typeof s.from === "string" ? s.from : undefined,
  }),
  component: VideoPage,
});

const SELECT =
  "id, video_url, thumbnail_url, caption, tags, like_count, view_count, created_at, creator_id, creator:creators(id, username, display_name, avatar_url)";

function VideoPage() {
  const { id } = Route.useParams();
  const { from } = Route.useSearch();
  const router = useRouter();
  const { user } = useAuth();

  // Build the swipe list from the profile the user came from (so mirrored
  // videos keep the browsing context of that creator), otherwise fall back to
  // the video's own creator.
  const { data, isLoading } = useQuery({
    queryKey: ["video-creator-feed", id, from ?? null],
    queryFn: async () => {
      const { data: target, error: e1 } = await supabase
        .from("videos")
        .select(SELECT)
        .eq("id", id)
        .eq("is_active", true)
        .maybeSingle();
      if (e1) throw e1;
      if (!target) return { target: null as FeedVideo | null, list: [] as FeedVideo[] };

      let creatorId = (target as { creator_id: string }).creator_id;
      if (from) {
        const { data: c } = await supabase.from("creators").select("id").eq("username", from).maybeSingle();
        if (c) creatorId = c.id;
      }

      const [{ data: own, error: e2 }, { data: mirrors }] = await Promise.all([
        supabase.from("videos").select(SELECT).eq("creator_id", creatorId).eq("is_active", true).order("created_at", { ascending: false }),
        supabase.from("video_mirrors").select("video_id").eq("creator_id", creatorId),
      ]);
      if (e2) throw e2;

      let rows = (own ?? []) as unknown as (FeedVideo & { created_at: string })[];
      const mirrorIds = (mirrors ?? []).map((m) => m.video_id).filter((mid) => !rows.some((r) => r.id === mid));
      if (mirrorIds.length) {
        const { data: mv } = await supabase.from("videos").select(SELECT).in("id", mirrorIds).eq("is_active", true);
        rows = [...rows, ...((mv ?? []) as unknown as (FeedVideo & { created_at: string })[])].sort((a, b) =>
          a.created_at < b.created_at ? 1 : -1
        );
      }

      if (!rows.some((r) => r.id === id)) {
        rows = [target as unknown as FeedVideo & { created_at: string }, ...rows];
      }

      return { target: target as unknown as FeedVideo, list: rows as unknown as FeedVideo[] };
    },
  });

  const initialIndex = useMemo(() => {
    if (!data?.target) return 0;
    const idx = data.list.findIndex((v) => v.id === data.target!.id);
    return idx < 0 ? 0 : idx;
  }, [data]);

  const { data: inter } = useQuery({
    queryKey: ["interactions", user?.id],
    queryFn: () => fetchUserInteractions(user!.id),
    enabled: !!user,
  });

  const ordered = useMemo<FeedVideo[]>(() => (data?.list ?? []) as FeedVideo[], [data]);

  return (
    <main className="fixed inset-0 bg-background">
      <button
        onClick={() => router.history.back()}
        aria-label="Back"
        className="glass tap-scale absolute left-3 z-40 rounded-full p-2"
        style={{ top: "max(env(safe-area-inset-top), 12px)" }}
      >
        <ChevronLeft className="h-5 w-5" />
      </button>

      <VideoFeed
        videos={ordered}
        likedSet={inter?.liked}
        savedSet={inter?.saved}
        loading={isLoading}
        emptyText="Video not found."
        initialIndex={initialIndex}
      />
    </main>
  );
}
