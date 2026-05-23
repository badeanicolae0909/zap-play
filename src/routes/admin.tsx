import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Upload, Trash2, Plus, Film, Users } from "lucide-react";

export const Route = createFileRoute("/admin")({ component: AdminPage });

function AdminPage() {
  const { user, isAdmin, loading } = useAuth();
  const nav = useNavigate();
  const [tab, setTab] = useState<"upload" | "videos" | "creators">("upload");

  useEffect(() => {
    if (!loading && !user) nav({ to: "/login" });
  }, [loading, user, nav]);

  if (loading) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  if (!user) return null;
  if (!isAdmin) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-xl font-bold">Admins only</h1>
        <p className="text-sm text-muted-foreground">You need an admin role to access the dashboard.</p>
        <Link to="/" className="rounded-full gradient-primary px-5 py-2 text-sm font-semibold text-primary-foreground">Back to feed</Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background pb-12 pt-[max(env(safe-area-inset-top),16px)]">
      <div className="mx-auto max-w-2xl px-5">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gradient">Admin</h1>
          <Link to="/" className="text-sm text-muted-foreground">← Feed</Link>
        </div>
        <div className="mb-6 grid grid-cols-3 gap-2 rounded-2xl glass p-1">
          <TabBtn active={tab === "upload"} onClick={() => setTab("upload")} icon={<Upload className="h-4 w-4" />}>Upload</TabBtn>
          <TabBtn active={tab === "videos"} onClick={() => setTab("videos")} icon={<Film className="h-4 w-4" />}>Videos</TabBtn>
          <TabBtn active={tab === "creators"} onClick={() => setTab("creators")} icon={<Users className="h-4 w-4" />}>Creators</TabBtn>
        </div>

        {tab === "upload" && <UploadTab />}
        {tab === "videos" && <VideosTab />}
        {tab === "creators" && <CreatorsTab />}
      </div>
    </main>
  );
}

function TabBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-medium transition ${active ? "gradient-primary text-primary-foreground" : "text-muted-foreground"}`}>
      {icon}{children}
    </button>
  );
}

function UploadTab() {
  const qc = useQueryClient();
  const { data: creators } = useQuery({
    queryKey: ["creators"],
    queryFn: async () => (await supabase.from("creators").select("id, display_name, username").order("display_name")).data ?? [],
  });
  const [creatorId, setCreatorId] = useState("");
  const [caption, setCaption] = useState("");
  const [tags, setTags] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [thumb, setThumb] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !creatorId) { toast.error("Pick a creator and video file"); return; }
    setBusy(true); setProgress(10);
    try {
      const ext = file.name.split(".").pop();
      const key = `${creatorId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("videos").upload(key, file, { upsert: false, contentType: file.type });
      if (upErr) throw upErr;
      setProgress(60);
      const { data: pub } = supabase.storage.from("videos").getPublicUrl(key);
      let thumbUrl: string | null = null;
      if (thumb) {
        const tkey = `${creatorId}/${Date.now()}.${thumb.name.split(".").pop()}`;
        await supabase.storage.from("thumbnails").upload(tkey, thumb, { contentType: thumb.type });
        thumbUrl = supabase.storage.from("thumbnails").getPublicUrl(tkey).data.publicUrl;
      }
      setProgress(85);
      const { error: insErr } = await supabase.from("videos").insert({
        creator_id: creatorId,
        video_url: pub.publicUrl,
        thumbnail_url: thumbUrl,
        caption: caption || null,
        tags: tags ? tags.split(",").map((t) => t.trim().replace(/^#/, "")).filter(Boolean) : [],
      });
      if (insErr) throw insErr;
      setProgress(100);
      toast.success("Video uploaded");
      setFile(null); setThumb(null); setCaption(""); setTags("");
      qc.invalidateQueries({ queryKey: ["feed"] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
      setTimeout(() => setProgress(0), 500);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Creator</Label>
        <Select value={creatorId} onValueChange={setCreatorId}>
          <SelectTrigger className="h-12 rounded-xl glass"><SelectValue placeholder="Choose creator" /></SelectTrigger>
          <SelectContent>
            {creators?.map((c) => <SelectItem key={c.id} value={c.id}>{c.display_name} (@{c.username})</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <FileDrop label="Video file (MP4)" accept="video/*" onFile={setFile} file={file} />
      <FileDrop label="Thumbnail (optional)" accept="image/*" onFile={setThumb} file={thumb} />
      <div className="space-y-1.5">
        <Label>Caption</Label>
        <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={3} className="glass rounded-xl" placeholder="Write a caption…" />
      </div>
      <div className="space-y-1.5">
        <Label>Tags (comma separated)</Label>
        <Input value={tags} onChange={(e) => setTags(e.target.value)} className="h-12 rounded-xl glass" placeholder="cinematic, travel" />
      </div>
      {progress > 0 && (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full gradient-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}
      <Button type="submit" disabled={busy} className="h-12 w-full rounded-xl gradient-primary text-base font-semibold text-primary-foreground">
        {busy ? "Uploading…" : "Publish video"}
      </Button>
    </form>
  );
}

function FileDrop({ label, accept, file, onFile }: { label: string; accept: string; file: File | null; onFile: (f: File | null) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <label className="flex h-24 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-border glass text-sm text-muted-foreground hover:border-primary">
        <input type="file" accept={accept} className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
        {file ? <span className="truncate px-4 text-foreground">{file.name}</span> : <span>Tap to choose</span>}
      </label>
    </div>
  );
}

function VideosTab() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin-videos"],
    queryFn: async () => (await supabase.from("videos").select("id, caption, view_count, like_count, video_url, thumbnail_url, creator:creators(display_name)").order("created_at", { ascending: false })).data ?? [],
  });
  async function del(id: string) {
    if (!confirm("Delete this video?")) return;
    const { error } = await supabase.from("videos").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["admin-videos"] }); qc.invalidateQueries({ queryKey: ["feed"] }); }
  }
  return (
    <div className="space-y-2">
      {data?.map((v: any) => (
        <div key={v.id} className="flex items-center gap-3 rounded-2xl glass p-3">
          <div className="h-16 w-12 overflow-hidden rounded-lg bg-card">
            {v.thumbnail_url ? <img src={v.thumbnail_url} className="h-full w-full object-cover" alt="" /> : <video src={v.video_url} className="h-full w-full object-cover" muted />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{v.caption || "Untitled"}</p>
            <p className="truncate text-xs text-muted-foreground">{v.creator?.display_name} · {v.view_count} views · {v.like_count} likes</p>
          </div>
          <button onClick={() => del(v.id)} className="tap-scale rounded-full p-2 text-destructive"><Trash2 className="h-4 w-4" /></button>
        </div>
      ))}
    </div>
  );
}

function CreatorsTab() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin-creators"],
    queryFn: async () => (await supabase.from("creators").select("*").order("created_at", { ascending: false })).data ?? [],
  });
  const [form, setForm] = useState({ username: "", display_name: "", bio: "", avatar_url: "" });
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.from("creators").insert({ ...form, bio: form.bio || null, avatar_url: form.avatar_url || null });
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Creator added"); setForm({ username: "", display_name: "", bio: "", avatar_url: "" }); qc.invalidateQueries({ queryKey: ["admin-creators"] }); qc.invalidateQueries({ queryKey: ["creators"] }); }
  }
  async function del(id: string) {
    if (!confirm("Delete this creator and all their videos?")) return;
    const { error } = await supabase.from("creators").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["admin-creators"] }); qc.invalidateQueries({ queryKey: ["feed"] }); }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="space-y-3 rounded-2xl glass p-4">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Plus className="h-4 w-4" /> New creator</h3>
        <Input required placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="h-11 rounded-xl glass" />
        <Input required placeholder="Display name" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} className="h-11 rounded-xl glass" />
        <Input placeholder="Avatar URL" value={form.avatar_url} onChange={(e) => setForm({ ...form, avatar_url: e.target.value })} className="h-11 rounded-xl glass" />
        <Textarea placeholder="Bio" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} rows={2} className="rounded-xl glass" />
        <Button disabled={busy} type="submit" className="h-11 w-full rounded-xl gradient-primary text-primary-foreground">{busy ? "…" : "Add creator"}</Button>
      </form>
      <div className="space-y-2">
        {data?.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-2xl glass p-3">
            <div className="h-10 w-10 overflow-hidden rounded-full gradient-primary">
              {c.avatar_url && <img src={c.avatar_url} className="h-full w-full object-cover" alt="" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{c.display_name}</p>
              <p className="truncate text-xs text-muted-foreground">@{c.username} · {c.video_count} videos</p>
            </div>
            <button onClick={() => del(c.id)} className="tap-scale rounded-full p-2 text-destructive"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
