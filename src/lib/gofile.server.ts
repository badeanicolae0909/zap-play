// Server-only Gofile reader.
// Gofile's API only returns shared-folder contents for Premium accounts, so a
// GOFILE_API_TOKEN (account API token from the Gofile profile page) is required.
// Direct file links also only serve media when the request carries the account
// token, hence playback goes through /api/public/gofile-stream.

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export type GofileItem = {
  pageUrl: string; // direct gofile link (stored as video_url)
  title: string;
  thumbnail: string | null;
  type: "video" | "image" | "other";
  size: number | null;
  duration: number | null;
};

const VIDEO_EXT = /\.(mp4|webm|mov|m4v|mkv|avi|ogv|m3u8)$/i;

export function gofileContentId(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (host !== "gofile.io") throw new Error("Not a gofile.io URL");
  const m = u.pathname.match(/^\/(?:d|f)\/([A-Za-z0-9]+)/);
  if (!m) throw new Error("URL must look like https://gofile.io/d/<id>");
  return m[1];
}

type GofileChild = {
  id: string;
  type: string;
  name?: string;
  mimetype?: string;
  size?: number;
  link?: string;
  thumbnail?: string;
  duration?: number;
  children?: Record<string, GofileChild> | GofileChild[];
};

function token(): string {
  const t = process.env["GOFILE_API_TOKEN"];
  if (!t) {
    throw new Error(
      "Gofile is not connected yet — add a Gofile Premium API token in the app settings to enable importing."
    );
  }
  return t;
}

async function fetchContents(id: string, apiToken: string, password?: string): Promise<GofileChild> {
  const url = new URL(`https://api.gofile.io/contents/${id}`);
  url.searchParams.set("cache", "true");
  if (password) url.searchParams.set("password", password);

  const r = await fetch(url.toString(), {
    headers: {
      authorization: `Bearer ${apiToken}`,
      "user-agent": UA,
      accept: "application/json",
      referer: "https://gofile.io/",
    },
  });

  if (r.status === 401) throw new Error("Gofile rejected the API token (unauthorized). Check the saved token.");
  if (r.status === 429) throw new Error("Gofile is rate limiting us — wait a minute and try again.");
  if (!r.ok) throw new Error(`Gofile API error (${r.status})`);

  const body = (await r.json()) as { status?: string; data?: GofileChild };
  const status = body.status ?? "";
  if (status === "error-notPremium")
    throw new Error("This Gofile token is not on a Premium account — folder contents can't be read.");
  if (status === "error-notFound") throw new Error("Gofile folder not found (link may have expired).");
  if (status === "error-passwordRequired" || status === "error-passwordWrong")
    throw new Error("This Gofile folder is password protected.");
  if (status !== "ok" || !body.data) throw new Error(`Gofile API returned: ${status || "unknown error"}`);
  return body.data;
}

function childList(node: GofileChild): GofileChild[] {
  const c = node.children;
  if (!c) return [];
  return Array.isArray(c) ? c : Object.values(c);
}

function toItem(c: GofileChild): GofileItem | null {
  if (!c.link) return null;
  const name = c.name ?? c.id;
  const mime = (c.mimetype ?? "").toLowerCase();
  const isVideo = mime.startsWith("video/") || VIDEO_EXT.test(name);
  return {
    pageUrl: c.link,
    title: name,
    thumbnail: c.thumbnail ?? null,
    type: isVideo ? "video" : mime.startsWith("image/") ? "image" : "other",
    size: typeof c.size === "number" ? c.size : null,
    duration: typeof c.duration === "number" ? Math.round(c.duration) : null,
  };
}

/**
 * List every video inside a shared Gofile folder, walking nested subfolders
 * (depth-limited so a pathological share can't hang the request).
 */
export async function listGofileFolder(rawUrl: string, password?: string): Promise<GofileItem[]> {
  const apiToken = token();
  const rootId = gofileContentId(rawUrl);

  const out: GofileItem[] = [];
  const seenFolders = new Set<string>();
  const queue: Array<{ id: string; depth: number }> = [{ id: rootId, depth: 0 }];

  while (queue.length && out.length < 500) {
    const { id, depth } = queue.shift()!;
    if (seenFolders.has(id)) continue;
    seenFolders.add(id);

    const node = await fetchContents(id, apiToken, password);
    for (const child of childList(node)) {
      if (child.type === "folder") {
        if (depth < 3) queue.push({ id: child.id, depth: depth + 1 });
        continue;
      }
      const item = toItem(child);
      if (item && item.type === "video") out.push(item);
    }
  }

  return out;
}

const ALLOWED_STREAM_HOST = /(^|\.)gofile\.io$/i;

/** Proxy a Gofile direct link with the account cookie attached, honouring Range. */
export async function streamGofile(rawUrl: string, req: Request): Promise<Response> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return new Response("Bad url", { status: 400 });
  }
  if (u.protocol !== "https:" || !ALLOWED_STREAM_HOST.test(u.hostname)) {
    return new Response("Forbidden host", { status: 403 });
  }

  const apiToken = process.env["GOFILE_API_TOKEN"];
  if (!apiToken) return new Response("Gofile not configured", { status: 503 });

  const headers: Record<string, string> = {
    "user-agent": UA,
    accept: "*/*",
    referer: "https://gofile.io/",
    cookie: `accountToken=${apiToken}`,
  };
  const range = req.headers.get("range");
  if (range) headers["range"] = range;
  const ifRange = req.headers.get("if-range");
  if (ifRange) headers["if-range"] = ifRange;

  const upstream = await fetch(u.toString(), {
    method: req.method === "HEAD" ? "HEAD" : "GET",
    headers,
    redirect: "follow",
  });

  const out = new Headers();
  for (const h of ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }
  if (!out.has("content-type")) out.set("content-type", "video/mp4");
  if (!out.has("accept-ranges")) out.set("accept-ranges", "bytes");
  out.set("cache-control", "private, max-age=3600");

  return new Response(req.method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers: out,
  });
}
