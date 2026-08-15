import { Link } from "@tanstack/react-router";

/**
 * Renders a caption, turning @username mentions into links to that creator profile.
 */
export function CaptionText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(@[A-Za-z0-9_.]+)/g);
  return (
    <p className={className}>
      {parts.map((p, i) => {
        if (p.startsWith("@") && p.length > 1) {
          const username = p.slice(1).replace(/[.]+$/, "");
          return (
            <Link
              key={i}
              to="/creator/$username"
              params={{ username }}
              onClick={(e) => e.stopPropagation()}
              className="font-semibold text-primary"
            >
              @{username}
            </Link>
          );
        }
        return <span key={i}>{p}</span>;
      })}
    </p>
  );
}
