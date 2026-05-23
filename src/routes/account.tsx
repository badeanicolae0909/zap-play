import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { BottomNav } from "@/components/BottomNav";
import { Link } from "@tanstack/react-router";
import { LogOut, Shield, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useEffect } from "react";

export const Route = createFileRoute("/account")({ component: Account });

function Account() {
  const { user, isAdmin, signOut } = useAuth();
  const nav = useNavigate();
  useEffect(() => { if (!user) nav({ to: "/login" }); }, [user, nav]);
  if (!user) return null;

  async function claimAdmin() {
    // First-user-admin convenience: allowed by trigger? we don't have one,
    // so this insert will fail without service role. Provide instructions.
    const { error } = await supabase.from("user_roles").insert({ user_id: user!.id, role: "admin" });
    if (error) toast.error("Cannot self-promote. Ask an existing admin or use the database to add your first admin role.");
    else toast.success("You are now admin");
  }

  return (
    <main className="min-h-screen bg-background pb-32 pt-[max(env(safe-area-inset-top),16px)]">
      <div className="mx-auto max-w-md px-6">
        <div className="flex flex-col items-center gap-3 py-8">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl gradient-primary text-2xl font-bold text-primary-foreground glow">
            {user.email?.[0]?.toUpperCase()}
          </div>
          <h1 className="text-xl font-bold">{user.email}</h1>
          {isAdmin && (
            <span className="inline-flex items-center gap-1 rounded-full glass px-3 py-1 text-xs font-medium">
              <Shield className="h-3 w-3" /> Admin
            </span>
          )}
        </div>

        <div className="space-y-3">
          <Link to="/saved" className="block tap-scale rounded-2xl glass p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium">Saved videos</span>
              <Sparkles className="h-4 w-4 text-muted-foreground" />
            </div>
          </Link>
          {isAdmin && (
            <Link to="/admin" className="block tap-scale rounded-2xl glass p-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">Admin dashboard</span>
                <Shield className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
          )}
          {!isAdmin && (
            <button onClick={claimAdmin} className="block w-full text-left tap-scale rounded-2xl glass p-4 text-sm text-muted-foreground">
              Become admin (first user only)
            </button>
          )}
          <Button onClick={async () => { await signOut(); nav({ to: "/" }); }} variant="ghost" className="w-full rounded-2xl py-6 text-destructive">
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </div>
      </div>
      <BottomNav />
    </main>
  );
}
