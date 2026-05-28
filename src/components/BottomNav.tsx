import { Link, useLocation } from "@tanstack/react-router";
import { Home, Search, Bookmark, Shield } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { haptic } from "@/lib/telegram";

export function BottomNav() {
  const { pathname } = useLocation();
  const { isAdmin } = useAuth();
  const isFeed = pathname === "/";
  const [visible, setVisible] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isFeed) { setVisible(true); return; }
    const show = () => {
      setVisible(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setVisible(false), 2000);
    };
    show();
    window.addEventListener("pointerdown", show, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", show);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [isFeed]);

  const tabs = [
    { to: "/", icon: Home, label: "Feed" },
    { to: "/search", icon: Search, label: "Search" },
    { to: "/saved", icon: Bookmark, label: "Saved" },
  ] as const;

  return (
    <nav
      className={`fixed bottom-0 left-0 right-0 z-40 pb-[env(safe-area-inset-bottom)] transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-0 pointer-events-none"}`}
    >
      <div className="glass-strong mx-4 mb-2 flex items-center justify-around rounded-full border border-border px-1.5 py-1">
        {tabs.map(({ to, icon: Icon, label }) => {
          const active = pathname === to;
          return (
            <Link
              key={to}
              to={to}
              onClick={() => haptic("light")}
              className="tap-scale relative flex flex-1 items-center justify-center rounded-full px-2 py-1.5"
              aria-label={label}
            >
              <Icon className={`h-4 w-4 transition-colors ${active ? "text-foreground" : "text-muted-foreground"}`} strokeWidth={active ? 2.5 : 2} />
              {active && <div className="absolute -top-0.5 h-0.5 w-5 rounded-full bg-primary glow" />}
            </Link>
          );
        })}
        <Link
          to="/admin"
          onClick={() => haptic("light")}
          className="tap-scale relative flex flex-1 items-center justify-center rounded-full px-2 py-1.5"
          aria-label={isAdmin ? "Admin" : "Claim admin"}
        >
          <Shield className={`h-4 w-4 ${pathname.startsWith("/admin") ? "text-primary" : "text-muted-foreground"}`} strokeWidth={isAdmin ? 2.5 : 2} />
        </Link>
      </div>
    </nav>
  );
}
