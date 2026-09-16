import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { GofileItem } from "./gofile.server";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

// Admin: list the videos inside a shared Gofile folder.
export const scrapeGofile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        folderUrl: z.string().url().max(500),
        password: z.string().max(200).optional(),
      })
      .parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { listGofileFolder } = await import("./gofile.server");
    const items = await listGofileFolder(data.folderUrl, data.password);
    return { items };
  });

// Admin: bulk-insert selected Gofile videos for a creator, skipping duplicates.
export const importGofile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        creatorId: z.string().uuid(),
        caption: z.string().max(300).optional(),
        items: z
          .array(
            z.object({
              pageUrl: z.string().url(),
              title: z.string().max(500),
              thumbnail: z.string().url().nullable(),
              duration: z.number().int().nonnegative().nullable().optional(),
            })
          )
          .min(1)
          .max(300),
      })
      .parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const urls = data.items.map((i) => i.pageUrl);
    const { data: existing, error: exErr } = await supabaseAdmin
      .from("videos")
      .select("video_url")
      .in("video_url", urls);
    if (exErr) throw new Error(exErr.message);
    const seen = new Set((existing ?? []).map((r) => r.video_url));

    const fresh = data.items.filter((i) => !seen.has(i.pageUrl));
    if (!fresh.length) return { inserted: 0, skipped: data.items.length };

    const rows = fresh.map((it) => ({
      creator_id: data.creatorId,
      video_url: it.pageUrl,
      thumbnail_url: it.thumbnail,
      caption: (data.caption?.trim() || it.title.replace(/\.[a-z0-9]{2,5}$/i, "")).slice(0, 200),
      duration_seconds: it.duration ?? null,
      tags: [] as string[],
    }));

    const { error, count } = await supabaseAdmin.from("videos").insert(rows, { count: "exact" });
    if (error) throw new Error(error.message);
    return { inserted: count ?? rows.length, skipped: data.items.length - fresh.length };
  });

export type { GofileItem };
