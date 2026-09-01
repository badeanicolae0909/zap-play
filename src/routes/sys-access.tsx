import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Lock } from "lucide-react";

export const Route = createFileRoute("/sys-access")({
  component: SysAccess,
  head: () => ({
    meta: [
      { title: "Restricted area" },
      { name: "description", content: "Restricted maintenance access for site operators." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Restricted area" },
      { property: "og:description", content: "Restricted maintenance access for site operators." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Restricted area" },
      { name: "twitter:description", content: "Restricted maintenance access for site operators." },
    ],
  }),
});

function SysAccess() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const uid = data.user?.id;
      const { data: role } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", uid!)
        .eq("role", "admin")
        .maybeSingle();
      if (!role) {
        await supabase.auth.signOut();
        throw new Error("Access denied");
      }
      toast.success("Signed in");
      nav({ to: "/admin", search: { tab: undefined, edit: undefined } });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl gradient-primary glow">
            <Lock className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Restricted area</h1>
          <p className="text-sm text-muted-foreground">Operator sign-in required</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required className="glass h-12 rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required className="glass h-12 rounded-xl" />
          </div>
          <Button disabled={loading} type="submit" className="h-12 w-full rounded-xl gradient-primary text-base font-semibold text-primary-foreground hover:opacity-90">
            {loading ? "…" : "Sign in"}
          </Button>
        </form>
      </div>
    </main>
  );
}
