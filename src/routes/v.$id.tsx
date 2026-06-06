import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { VideoFeed } from "@/components/VideoFeed";
import { useAuth } from "@/lib/auth";
import { fetchUserInteractions } from "@/lib/feed";
import type { FeedVideo } from "@/components/VideoCard";

export const Route = createFileRoute("/v/$id")({ component: VideoPage });

function VideoPage() {
  const { id } = Route.useParams();
  const router = useRouter();
  const { user } = useAuth();

  // Fetch the tapped video first to discover its creator, then fetch the full
  // creator feed so the user can swipe through the rest like on the main feed.
  const { data, isLoading } = useQuery({
    queryKey: ["video-creator-feed", id],
    queryFn: async () => {
      const { data: target, error: e1 } = await supabase
        .from("videos")
        .select("id, video_url, thumbnail_url, caption, tags, like_count, view_count, creator_id, creator:creators(id, username, display_name, avatar_url)")
        .eq("id", id)
        .maybeSingle();
      if (e1) throw e1;
      if (!target) return { target: null as FeedVideo | null, list: [] as FeedVideo[] };

      const { data: list, error: e2 } = await supabase
        .from("videos")
        .select("id, video_url, thumbnail_url, caption, tags, like_count, view_count, creator:creators(id, username, display_name, avatar_url)")
        .eq("creator_id", (target as { creator_id: string }).creator_id)
        .order("created_at", { ascending: false });
      if (e2) throw e2;

      return {
        target: target as unknown as FeedVideo,
        list: (list ?? []) as unknown as FeedVideo[],
      };
    },
  });

  const { data: inter } = useQuery({
    queryKey: ["interactions", user?.id],
    queryFn: () => fetchUserInteractions(user!.id),
    enabled: !!user,
  });

  // Keep the creator's chronological order; start the feed at the tapped video
  // so the user can scroll up to the next (newer) or down to the previous (older).
  const initialIndex = useMemo(() => {
    if (!data?.target) return 0;
    const idx = data.list.findIndex((v) => v.id === data.target!.id);
    return idx < 0 ? 0 : idx;
  }, [data]);

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
