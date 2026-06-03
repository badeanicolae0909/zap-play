import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { scrapeBunkrAlbum, resolveBunkrPlayback, type BunkrItem } from "./bunkr.server";

// Bunkr operates under many rotating TLDs; turbo.cr is part of the same network
// and serves file pages with the same jsCDN/signUrl shape, so we treat it the same.
const BUNKR_HOST = /(^|\.)(bunkr|bunkrr|turbo)\.(ac|ax|black|ci|cr|fi|is|la|media|ph|pk|red|ru|si|site|st|sk|to|ws)$/i;

function assertBunkrUrl(raw: string): URL {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error("Invalid URL"); }
  const host = u.hostname.toLowerCase();
  if (host === "gofile.io" || host.endsWith(".gofile.io")) {
    throw new Error(
      "Gofile.io can't be scraped: their API now requires a Premium account to read shared content (returns error-notPremium for guest tokens). No workaround is possible without a paid gofile API key."
    );
  }
  if (!BUNKR_HOST.test(u.hostname)) throw new Error("Not a bunkr/turbo URL");
  return u;
}

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

// Admin: scrape an album, return preview items.
export const scrapeBunkr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ albumUrl: z.string().url().max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const u = assertBunkrUrl(data.albumUrl);
    // Album page: scrape all items. Single file page (/f/ or /v/): return that one item.
    if (/^\/a\//.test(u.pathname)) {
      const items = await scrapeBunkrAlbum(u.toString());
      return { items: items.filter((i) => i.type === "video") };
    }
    if (/^\/(f|v)\//.test(u.pathname)) {
      const { scrapeBunkrSingle } = await import("./bunkr.server");
      const item = await scrapeBunkrSingle(u.toString());
      return { items: item && item.type === "video" ? [item] : [] };
    }
    throw new Error("URL must be a /a/<id> album or /f|v/<slug> file page");
  });

// Admin: bulk-insert selected items as videos for a creator.
export const importBunkr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      creatorId: z.string().uuid(),
      items: z.array(
        z.object({
          pageUrl: z.string().url(),
          title: z.string().max(500),
          thumbnail: z.string().url().nullable(),
        })
      ).min(1).max(200),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const rows = data.items.map((it) => ({
      creator_id: data.creatorId,
      video_url: it.pageUrl,
      thumbnail_url: it.thumbnail,
      caption: it.title.replace(/\.[a-z0-9]{2,5}$/i, "").slice(0, 200),
      tags: [] as string[],
    }));
    const { error, count } = await supabaseAdmin
      .from("videos")
      .insert(rows, { count: "exact" });
    if (error) throw new Error(error.message);
    return { inserted: count ?? rows.length };
  });

// Public: resolve a bunkr file page URL into a playable signed mp4 URL.
// Called at playback time because signed URLs expire.
export const resolveBunkr = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ pageUrl: z.string().url().max(500) }).parse(d))
  .handler(async ({ data }) => {
    const u = assertBunkrUrl(data.pageUrl);
    if (!/^\/(f|v)\//.test(u.pathname)) throw new Error("URL must be a /f/<slug> or /v/<slug> file page");
    return resolveBunkrPlayback(u.toString());
  });

export type { BunkrItem };
