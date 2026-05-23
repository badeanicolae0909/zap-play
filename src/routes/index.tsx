import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { VideoFeed } from "@/components/VideoFeed";
import { BottomNav } from "@/components/BottomNav";
import { fetchFeed, fetchUserInteractions } from "@/lib/feed";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({ component: Index });

function Index() {
  const { user } = useAuth();
  const { data: videos, isLoading } = useQuery({
    queryKey: ["feed"],
    queryFn: () => fetchFeed(30),
  });
  const { data: inter } = useQuery({
    queryKey: ["interactions", user?.id],
    queryFn: () => fetchUserInteractions(user!.id),
    enabled: !!user,
  });

  return (
    <main className="fixed inset-0 bg-background">
      {/* Top header */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-center gap-6 px-4 pt-[max(env(safe-area-inset-top),12px)]">
        <span className="text-sm font-medium text-muted-foreground">Following</span>
        <span className="relative text-base font-bold">
          For You
          <span className="absolute -bottom-1 left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-full bg-foreground" />
        </span>
      </header>

      <VideoFeed
        videos={videos ?? []}
        likedSet={inter?.liked}
        savedSet={inter?.saved}
        loading={isLoading}
      />

      <BottomNav />
    </main>
  );
}
