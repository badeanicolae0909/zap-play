import { Link, useLocation } from "@tanstack/react-router";
import { Home, Search, Bookmark, User, Shield } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { haptic } from "@/lib/telegram";

export function BottomNav() {
  const { pathname } = useLocation();
  const { isAdmin, user } = useAuth();

  const tabs = [
    { to: "/", icon: Home, label: "Feed" },
    { to: "/search", icon: Search, label: "Search" },
    { to: "/saved", icon: Bookmark, label: "Saved" },
    { to: user ? "/account" : "/login", icon: User, label: "Me" },
  ] as const;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 pb-[env(safe-area-inset-bottom)]">
      <div className="glass-strong mx-3 mb-3 flex items-center justify-around rounded-2xl border border-border px-2 py-2">
        {tabs.map(({ to, icon: Icon, label }) => {
          const active = pathname === to;
          return (
            <Link
              key={to}
              to={to}
              onClick={() => haptic("light")}
              className="tap-scale flex flex-1 flex-col items-center gap-0.5 rounded-xl px-2 py-1.5"
            >
              <Icon className={`h-5 w-5 transition-colors ${active ? "text-foreground" : "text-muted-foreground"}`} strokeWidth={active ? 2.5 : 2} />
              <span className={`text-[10px] font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
              {active && <div className="absolute -top-0.5 h-0.5 w-6 rounded-full bg-primary glow" />}
            </Link>
          );
        })}
        {isAdmin && (
          <Link to="/admin" onClick={() => haptic("light")} className="tap-scale flex flex-1 flex-col items-center gap-0.5 rounded-xl px-2 py-1.5">
            <Shield className={`h-5 w-5 ${pathname.startsWith("/admin") ? "text-primary" : "text-muted-foreground"}`} />
            <span className="text-[10px] font-medium text-muted-foreground">Admin</span>
          </Link>
        )}
      </div>
    </nav>
  );
}
