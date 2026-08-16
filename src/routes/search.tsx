import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav } from "@/components/BottomNav";
import { Search as SearchIcon, Play } from "lucide-react";

export const Route = createFileRoute("/search")({ component: SearchPage });

function SearchPage() {
  const [q, setQ] = useState("");
  const { data: creators } = useQuery({
    queryKey: ["creators-list", q],
    queryFn: async () => {
      const query = supabase.from("creators").select("id, username, display_name, avatar_url, video_count, like_count, follower_count").order("video_count", { ascending: false }).limit(40);
      if (q.trim()) query.ilike("display_name", `%${q.trim()}%`);
      const { data } = await query;
      return data ?? [];
    },
  });

  return (
    <main className="min-h-screen bg-background pb-32 pt-[max(env(safe-area-inset-top),16px)]">
      <div className="mx-auto max-w-md px-4">
        <h1 className="mb-4 text-2xl font-bold tracking-tight">Discover</h1>
        <div className="relative mb-6">
          <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search creators"
            className="h-12 w-full rounded-full glass pl-11 pr-4 text-sm outline-none transition focus:ring-2 focus:ring-primary"
          />
        </div>

        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Top creators</h2>
        <div className="grid grid-cols-2 gap-3">
          {creators?.map((c) => (
            <CreatorCard key={c.id} creator={c} />
          ))}
        </div>
      </div>
      <BottomNav />
    </main>
  );
}

function CreatorCard({
  creator,
}: {
  creator: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    video_count: number;
    like_count: number;
    follower_count: number;
  };
}) {
  const initials = creator.display_name?.[0]?.toUpperCase() ?? creator.username?.[0]?.toUpperCase() ?? "?";
  const hasImage = !!creator.avatar_url;

  return (
    <Link
      to="/creator/$username"
      params={{ username: creator.username }}
      className="group tap-scale relative flex flex-col overflow-hidden rounded-2xl glass shadow-elegant transition hover:shadow-glow"
    >
      {/* Background image fills the whole card */}
      <div className="absolute inset-0">
        {hasImage ? (
          <img
            src={creator.avatar_url!}
            alt={creator.display_name}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="h-full w-full gradient-primary" />
        )}
      </div>

      {/* Dark overlay so text is readable */}
      <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/70 to-background/95" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

      <div className="relative flex flex-1 flex-col items-center p-5 pt-6">
        {/* Small avatar badge — optional, now at top */}
        <div className="relative h-12 w-12">
          <div className="absolute -inset-0.5 rounded-full gradient-primary opacity-70 blur-sm transition duration-300 group-hover:opacity-100" />
          <div className="relative h-full w-full overflow-hidden rounded-full border-2 border-background/80 bg-card">
            {hasImage ? (
              <img
                src={creator.avatar_url!}
                alt={creator.display_name}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm font-bold text-primary-foreground gradient-primary">
                {initials}
              </div>
            )}
          </div>
        </div>

        <div className="mt-3 w-full text-center">
          <p className="truncate text-sm font-semibold leading-tight text-white drop-shadow-sm">{creator.display_name}</p>
          <p className="truncate text-xs text-white/80 drop-shadow-sm">@{creator.username}</p>
        </div>

        {/* Stats row */}
        <div className="mt-4 flex w-full items-center justify-between gap-1 rounded-xl bg-black/40 px-3 py-2 text-[10px] font-medium text-white backdrop-blur-sm">
          <Stat value={creator.video_count} label="videos" />
          <div className="h-3 w-px bg-white/20" />
          <Stat value={creator.like_count} label="likes" />
          <div className="h-3 w-px bg-white/20" />
          <Stat value={creator.follower_count} label="fans" />
        </div>
      </div>

      {/* Bottom play hint */}
      <div className="pointer-events-none absolute bottom-3 right-3 flex h-7 w-7 items-center justify-center rounded-full bg-white/10 opacity-0 transition-opacity duration-300 group-active:opacity-100">
        <Play className="h-3.5 w-3.5 fill-white text-white" />
      </div>
    </Link>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center leading-none">
      <span className="text-[11px] font-bold">{fmt(value)}</span>
      <span className="mt-0.5 text-[9px] uppercase tracking-wide text-white/70">{label}</span>
    </div>
  );
}


function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}
