import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash } from "crypto";

// Create a new video entry in Bunny Stream and return a TUS upload signature.
// The API key never leaves the server — the browser uploads bytes via TUS
// authenticated by a short-lived SHA256 signature.
export const createBunnyUpload = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ title: z.string().min(1).max(255) }).parse(input))
  .handler(async ({ data }) => {
    const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID;
    const apiKey = process.env.BUNNY_STREAM_API_KEY;
    if (!libraryId || !apiKey) throw new Error("Bunny Stream is not configured");

    const res = await fetch(`https://video.bunnycdn.com/library/${libraryId}/videos`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        AccessKey: apiKey,
      },
      body: JSON.stringify({ title: data.title }),
    });
    if (!res.ok) throw new Error(`Bunny create video failed: ${res.status} ${await res.text()}`);
    const video = (await res.json()) as { guid: string };
    const guid = video.guid;

    // TUS auth: SHA256(libraryId + apiKey + expirationTime + videoId)
    const expirationTime = Math.floor(Date.now() / 1000) + 60 * 60 * 6; // 6h
    const signature = createHash("sha256")
      .update(`${libraryId}${apiKey}${expirationTime}${guid}`)
      .digest("hex");

    return {
      guid,
      libraryId,
      signature,
      expirationTime,
      embedUrl: `https://iframe.mediadelivery.net/embed/${libraryId}/${guid}`,
      thumbnailUrl: `https://vz-${libraryId}.b-cdn.net/${guid}/thumbnail.jpg`,
    };
  });
