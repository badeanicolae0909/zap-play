// Server-only Bunkr scraper + URL resolver.
// Bunkr serves an HTML album page listing /f/SLUG file pages. Each file page
// contains a `jsCDN` raw mp4 URL and a sign endpoint that mints a short-lived
// signed URL (?token=...&ex=...). Direct media is only playable with that
// signed token, so we resolve at playback time.

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function fetchHtml(url: string): Promise<string> {
  const r = await fetch(url, { headers: { "user-agent": UA, accept: "text/html,*/*" } });
  if (!r.ok) throw new Error(`Fetch ${url} → ${r.status}`);
  return r.text();
}

function unescapeJsString(s: string): string {
  return s.replace(/\\\//g, "/").replace(/\\u002F/gi, "/");
}

function metaContent(html: string, prop: string): string | null {
  const re = new RegExp(`<meta\\s+property="${prop}"\\s+content="([^"]+)"`, "i");
  const m = html.match(re);
  return m ? m[1] : null;
}

export type BunkrItem = {
  pageUrl: string;
  title: string;
  thumbnail: string | null;
  type: "video" | "image" | "other";
};

export async function scrapeBunkrAlbum(albumUrl: string): Promise<BunkrItem[]> {
  const u = new URL(albumUrl);
  const html = await fetchHtml(albumUrl);

  // Items appear as <a href="/f/SLUG"> links. Dedupe and ignore template strings.
  const slugs = new Set<string>();
  for (const m of html.matchAll(/href="\/f\/([A-Za-z0-9_-]{6,})"/g)) {
    slugs.add(m[1]);
  }

  const items: BunkrItem[] = [];
  for (const slug of slugs) {
    const pageUrl = `${u.origin}/f/${slug}`;
    try {
      const page = await fetchHtml(pageUrl);
      const type = (metaContent(page, "og:type") ?? "").toLowerCase();
      const title = metaContent(page, "og:title") ?? slug;
      const thumbnail = metaContent(page, "og:image");
      items.push({
        pageUrl,
        title,
        thumbnail,
        type: type === "video" ? "video" : type === "image" ? "image" : "other",
      });
    } catch {
      // Skip broken items, keep going.
    }
  }
  return items;
}

export type BunkrPlayback = {
  src: string;        // signed direct mp4 URL
  type: string;       // mime type
  thumbnail: string | null;
  expiresAt: number;  // unix seconds
};

export async function resolveBunkrPlayback(pageUrl: string): Promise<BunkrPlayback> {
  const html = await fetchHtml(pageUrl);

  const cdnMatch = html.match(/var\s+jsCDN\s*=\s*"([^"]+)"/);
  if (!cdnMatch) throw new Error("Bunkr: no jsCDN in page");
  const rawCdnUrl = unescapeJsString(cdnMatch[1]);

  const typeMatch = html.match(/var\s+jsType\s*=\s*"([^"]+)"/);
  const type = typeMatch ? unescapeJsString(typeMatch[1]) : "video/mp4";

  const signMatch = html.match(/var\s+signUrl\s*=\s*"([^"]+)"/);
  const signUrl = signMatch ? unescapeJsString(signMatch[1]) : "https://glb-apisign.cdn.cr/sign";

  const thumbnail = metaContent(html, "og:image");

  const orig = new URL(rawCdnUrl);
  const signReq = `${signUrl}?path=${encodeURIComponent(decodeURIComponent(orig.pathname))}`;
  const sr = await fetch(signReq, {
    headers: {
      "user-agent": UA,
      referer: new URL(pageUrl).origin + "/",
      origin: new URL(pageUrl).origin,
    },
  });
  if (!sr.ok) throw new Error(`Bunkr sign → ${sr.status}`);
  const { token, ex } = (await sr.json()) as { token: string; ex: number };
  orig.searchParams.set("token", token);
  orig.searchParams.set("ex", String(ex));

  return { src: orig.toString(), type, thumbnail, expiresAt: Number(ex) };
}
