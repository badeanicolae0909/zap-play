import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav } from "@/components/BottomNav";
import { Search as SearchIcon } from "lucide-react";

export const Route = createFileRoute("/search")({ component: SearchPage });

function SearchPage() {
  const [q, setQ] = useState("");
  const { data: creators } = useQuery({
    queryKey: ["creators-list", q],
    queryFn: async () => {
      const query = supabase.from("creators").select("id, username, display_name, avatar_url, video_count").order("video_count", { ascending: false }).limit(40);
      if (q.trim()) query.ilike("display_name", `%${q.trim()}%`);
      const { data } = await query;
      return data ?? [];
    },
  });

  return (
    <main className="min-h-screen bg-background pb-32 pt-[max(env(safe-area-inset-top),16px)]">
      <div className="mx-auto max-w-md px-4">
        <h1 className="mb-4 text-2xl font-bold">Discover</h1>
        <div className="relative mb-6">
          <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search creators"
            className="h-12 w-full rounded-full glass pl-11 pr-4 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Top creators</h2>
        <div className="grid grid-cols-2 gap-3">
          {creators?.map((c) => (
            <Link key={c.id} to="/creator/$username" params={{ username: c.username }} className="tap-scale glass overflow-hidden rounded-2xl p-4">
              <div className="mx-auto h-16 w-16 overflow-hidden rounded-full gradient-primary">
                {c.avatar_url && <img src={c.avatar_url} alt={c.display_name} className="h-full w-full object-cover" />}
              </div>
              <p className="mt-3 truncate text-center text-sm font-semibold">{c.display_name}</p>
              <p className="truncate text-center text-xs text-muted-foreground">@{c.username}</p>
              <p className="mt-1 text-center text-[10px] text-muted-foreground">{c.video_count} videos</p>
            </Link>
          ))}
        </div>
      </div>
      <BottomNav />
    </main>
  );
}
