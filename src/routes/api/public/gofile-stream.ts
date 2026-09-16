import { createFileRoute } from "@tanstack/react-router";

// Streams a Gofile direct link with the account token attached server-side.
// Read-only, GET/HEAD only, gofile.io hosts only, no caller data involved.
async function handle({ request }: { request: Request }) {
  const url = new URL(request.url);
  const target = url.searchParams.get("u");
  if (!target) return new Response("Missing u", { status: 400 });
  const { streamGofile } = await import("@/lib/gofile.server");
  return streamGofile(target, request);
}

export const Route = createFileRoute("/api/public/gofile-stream")({
  server: {
    handlers: {
      GET: handle,
      HEAD: handle,
    },
  },
});
