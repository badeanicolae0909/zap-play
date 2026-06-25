// Shared Bunkr signed-URL cache used by Feed Manager (pre-resolution)
// and VideoCard (lazy fallback). Keyed by page URL; values expire.
export const bunkrCache = new Map<
  string,
  { src: string; type: string; thumbnail: string | null; expiresAt: number }
>();
