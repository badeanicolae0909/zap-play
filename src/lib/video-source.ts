// Resolve a user-provided URL into a playable source.
// Direct media files (.mp4/.webm/.m3u8/.mov) play in <video>.
// Everything else (page URLs from hosts like turbo.cr, YouTube, Vimeo, Streamable, etc.)
// is rendered via an <iframe> embed.

export type VideoSource =
  | { kind: "video"; src: string }
  | { kind: "iframe"; src: string }
  | { kind: "bunkr"; src: string }; // page URL — needs server-side resolve to signed mp4

const DIRECT_MEDIA = /\.(mp4|webm|m3u8|mov|m4v|ogv)(\?|#|$)/i;

export function resolveVideoSource(rawUrl: string): VideoSource {
  const url = rawUrl.trim();
  if (!url) return { kind: "video", src: url };

  // Direct media file -> native <video>
  if (DIRECT_MEDIA.test(url)) return { kind: "video", src: url };

  let u: URL;
  try { u = new URL(url); } catch { return { kind: "video", src: url }; }

  const host = u.hostname.replace(/^www\./, "");
  const path = u.pathname;

  // YouTube
  if (host === "youtube.com" || host === "m.youtube.com") {
    const id = u.searchParams.get("v");
    if (id) return { kind: "iframe", src: `https://www.youtube.com/embed/${id}?autoplay=1&playsinline=1&rel=0&modestbranding=1` };
    const shorts = path.match(/^\/shorts\/([^/]+)/);
    if (shorts) return { kind: "iframe", src: `https://www.youtube.com/embed/${shorts[1]}?autoplay=1&playsinline=1&rel=0&modestbranding=1` };
  }
  if (host === "youtu.be") {
    const id = path.slice(1).split("/")[0];
    if (id) return { kind: "iframe", src: `https://www.youtube.com/embed/${id}?autoplay=1&playsinline=1&rel=0&modestbranding=1` };
  }

  // Vimeo
  if (host === "vimeo.com") {
    const id = path.split("/").filter(Boolean)[0];
    if (id && /^\d+$/.test(id)) return { kind: "iframe", src: `https://player.vimeo.com/video/${id}?autoplay=1&playsinline=1` };
  }
  if (host === "player.vimeo.com") return { kind: "iframe", src: url };

  // Streamable
  if (host === "streamable.com") {
    const id = path.split("/").filter(Boolean)[0];
    if (id) return { kind: "iframe", src: `https://streamable.com/e/${id}?autoplay=1&muted=0` };
  }

  // Turbo.cr — serves video through an obfuscated /embed/<id> iframe
  // (WASM-signed URLs that aren't reproducible server-side). Embed the iframe directly.
  if (host === "turbo.cr" || host.endsWith(".turbo.cr")) {
    const m = path.match(/^\/(?:v|f|embed)\/([A-Za-z0-9_-]+)/);
    if (m) return { kind: "iframe", src: `${u.origin}/embed/${m[1]}` };
  }

  // Bunkr file pages — store the page URL, resolve to signed mp4 at playback time.
  // Bunkr rotates TLDs frequently; keep this list wide.
  if (/(^|\.)(bunkr|bunkrr)\.(ac|ax|black|ci|cr|fi|is|la|media|ph|pk|red|ru|si|site|st|sk|to|ws)$/i.test(host)) {
    if (/^\/(f|v)\//.test(path)) return { kind: "bunkr", src: url };
  }

  // Streamtape / mixdrop / doodstream / dood.* — common /v/ID -> /e/ID embed pattern
  if (
    host.includes("streamtape") ||
    host.includes("mixdrop") ||
    host.includes("doodstream") ||
    host.startsWith("dood.") ||
    host.includes("filemoon") ||
    host.includes("voe.sx")
  ) {
    const m = path.match(/^\/(?:v|d|e)\/([^/]+)/);
    if (m) return { kind: "iframe", src: `${u.origin}/e/${m[1]}` };
  }

  // Fallback: treat as iframe embed of the raw page.
  return { kind: "iframe", src: url };
}
