# Gofile video import

Add Gofile folder links as a second import source in the admin panel, alongside the existing Bunkr/Turbo importer.

## What I verified

Gofile's public API no longer lets guests read shared folders. A live test just now:

- creating a guest token works (`POST /accounts`)
- the website token the old community scripts scraped from `gofile.io/dist/js/config.js` no longer exists
- reading a folder returns `error-notPremium`

So folder listing needs a token from a Gofile **Premium** account. Since you don't have one yet, the importer will be built now and stay dormant until a token is saved — it will show a clear "Gofile token not configured" message instead of failing silently.

Second consequence: Gofile's direct file links only serve media to a request carrying the account token as a cookie, so a plain video tag cannot play them. The app will therefore play Gofile videos through a small streaming endpoint of our own that attaches the token server-side and forwards the video (with range support, so seeking and the scrubber keep working).

## What gets built

1. **Gofile reader (server-side)**
   - List a shared folder from a `gofile.io/d/<id>` link, walk nested subfolders, keep video files only, return name, size, duration where available, direct link, and a thumbnail when Gofile provides one.
   - Handle and surface the real failure reasons: no token, bad/expired token, non-Premium token, folder not found, password-protected folder, rate limiting.

2. **Admin import panel**
   - New "Import from Gofile" card mirroring the Bunkr one: paste link, preview the found videos with checkboxes and select-all, pick or create the creator, optional caption with @mentions, then bulk import.
   - Duplicate guard so re-importing the same folder doesn't create repeat entries.

3. **Playback**
   - Gofile URLs are recognised as their own source kind and routed through the streaming endpoint, so they behave like normal uploads in the feed player (autoplay, scrub, buffered bar).

4. **Token setup**
   - A secure field to save the Gofile Premium API token whenever you get one. Nothing else changes when you add it — the importer simply starts working.

## Technical notes

- `src/lib/gofile.server.ts`: `listGofileFolder(url)` — `GET https://api.gofile.io/contents/<id>?wt=&cache=true` with `Authorization: Bearer $GOFILE_API_TOKEN`, recursive child folder walk, video MIME/extension filter, normalised item shape matching `BunkrItem`.
- `src/lib/gofile.functions.ts`: `scrapeGofile` and `importGofile` server fns, `.middleware([requireSupabaseAuth])` + the same `assertAdmin` role check used by `bunkr.functions.ts`; insert via `supabaseAdmin` imported inside the handler.
- `src/routes/api/public/gofile-stream.ts`: server route proxying `?u=<gofile direct link>`, allow-listing `*.gofile.io` hosts only, forwarding `Range`/`If-Range` and returning upstream `206`/`Content-Range`/`Content-Type`, with `Cookie: accountToken=$GOFILE_API_TOKEN`. No caller PII, read-only, GET/HEAD only.
- `src/lib/video-source.ts`: new `gofile` branch returning `{ kind: "video", src: "/api/public/gofile-stream?u=..." }` so `VideoCard` needs no change.
- `src/lib/feed.ts`: treat the proxied path as a direct upload in `isDirectUpload` so Gofile clips can fill the instant-start opening slots.
- Secret `GOFILE_API_TOKEN` requested via the secret form; all reads inside handlers.
- No schema change: Gofile videos are ordinary `videos` rows.
