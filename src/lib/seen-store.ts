/**
 * Local "already watched" memory so every app launch surfaces fresh videos.
 * Stores video id -> last-seen timestamp (ms), capped and pruned.
 */
const KEY = "reelx.seen.v1";
const MAX_ENTRIES = 2000;
const TTL_MS = 1000 * 60 * 60 * 24 * 14; // two weeks

type SeenMap = Record<string, number>;

let cache: SeenMap | null = null;

function read(): SeenMap {
  if (cache) return cache;
  if (typeof window === "undefined") return (cache = {});
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as SeenMap) : {};
    const cutoff = Date.now() - TTL_MS;
    const out: SeenMap = {};
    for (const [id, ts] of Object.entries(parsed)) {
      if (typeof ts === "number" && ts > cutoff) out[id] = ts;
    }
    cache = out;
  } catch {
    cache = {};
  }
  return cache;
}

function write(map: SeenMap) {
  cache = map;
  if (typeof window === "undefined") return;
  try {
    let entries = Object.entries(map);
    if (entries.length > MAX_ENTRIES) {
      entries = entries.sort((a, b) => b[1] - a[1]).slice(0, MAX_ENTRIES);
    }
    window.localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* storage full / disabled — ignore */
  }
}

export function getSeenMap(): SeenMap {
  return { ...read() };
}

export function markSeen(id: string) {
  const map = read();
  map[id] = Date.now();
  write(map);
}

/** Forget everything (used when the viewer has watched the whole library). */
export function resetSeen() {
  write({});
}
