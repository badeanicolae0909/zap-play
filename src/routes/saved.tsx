import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav } from "@/components/BottomNav";
import { VideoFeed } from "@/components/VideoFeed";
import type { FeedVideo } from "@/components/VideoCard";

export const Route = createFileRoute("/saved")({ component: Saved });

function Saved() {
  const { user } = useAuth();
  const nav = useNavigate();
  useEffect(() => { if (user === null) {} }, [user]);

  const { data, isLoading } = useQuery({
    queryKey: ["saved", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data: favs } = await supabase
        .from("favorites")
        .select("video:videos(id, video_url, thumbnail_url, caption, tags, like_count, view_count, creator:creators(id, username, display_name, avatar_url))")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      return (favs ?? []).map((f) => f.video).filter(Boolean) as unknown as FeedVideo[];
    },
    enabled: !!user,
  });

  if (!user) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 pb-32">
        <p className="text-muted-foreground">Sign in to view saved videos</p>
        <button onClick={() => nav({ to: "/login" })} className="rounded-full gradient-primary px-5 py-2 text-sm font-semibold text-primary-foreground">Sign in</button>
        <BottomNav />
      </main>
    );
  }

  return (
    <main className="fixed inset-0 bg-background">
      <header className="absolute inset-x-0 top-0 z-30 px-4 pt-[max(env(safe-area-inset-top),12px)]">
        <h1 className="text-center text-base font-bold">Saved</h1>
      </header>
      <VideoFeed videos={data ?? []} loading={isLoading} emptyText="No saved videos yet" />
      <BottomNav />
    </main>
  );
}
