import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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

  const { data: video, isLoading } = useQuery({
    queryKey: ["video", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("videos")
        .select("id, video_url, thumbnail_url, caption, tags, like_count, view_count, creator:creators(id, username, display_name, avatar_url)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as FeedVideo | null;
    },
  });

  const { data: inter } = useQuery({
    queryKey: ["interactions", user?.id],
    queryFn: () => fetchUserInteractions(user!.id),
    enabled: !!user,
  });

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
        videos={video ? [video] : []}
        likedSet={inter?.liked}
        savedSet={inter?.saved}
        loading={isLoading}
        emptyText="Video not found."
      />
    </main>
  );
}
