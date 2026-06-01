import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Upload, Trash2, Plus, Film, Users, Shield, Download, Loader2, Pencil } from "lucide-react";
import { scrapeBunkr, importBunkr } from "@/lib/bunkr.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export const Route = createFileRoute("/admin")({ component: AdminPage });

function AdminPage() {
  const { user, isAdmin, isAnonymous, loading } = useAuth();
  const [tab, setTab] = useState<"upload" | "videos" | "creators">("upload");
  const [claiming, setClaiming] = useState(false);

  if (loading) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;

  async function claimAdmin() {
    if (!user) return;
    setClaiming(true);
    const { error } = await supabase.from("user_roles").insert({ user_id: user.id, role: "admin" });
    setClaiming(false);
    if (error) toast.error(error.message);
    else { toast.success("You are now admin"); window.location.reload(); }
  }

  if (!isAdmin) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl gradient-primary glow">
          <Shield className="h-8 w-8 text-primary-foreground" />
        </div>
        <h1 className="text-xl font-bold">Admin access</h1>
        <p className="max-w-xs text-sm text-muted-foreground">
          Claim the admin role for this app. Only works if no admin exists yet.
        </p>
        <Button disabled={claiming || !user} onClick={claimAdmin} className="rounded-full gradient-primary px-6 py-3 text-sm font-semibold text-primary-foreground">
          {claiming ? "Claiming…" : "Claim admin role"}
        </Button>
        {isAnonymous && (
          <p className="max-w-xs text-[11px] text-muted-foreground">
            Tip: you can also sign in with email first via <Link to="/login" className="underline">/login</Link> to keep your admin role across devices.
          </p>
        )}
        <Link to="/" className="text-xs text-muted-foreground">← Back to feed</Link>
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
  const [mode, setMode] = useState<"file" | "url">("url");
  const [creatorId, setCreatorId] = useState("");
  const [caption, setCaption] = useState("");
  const [tags, setTags] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [thumb, setThumb] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [thumbUrl, setThumbUrl] = useState("");
  const [featured, setFeatured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!creatorId) { toast.error("Pick a creator"); return; }
    setBusy(true); setProgress(10);
    try {
      let finalVideoUrl = "";
      let finalThumbUrl: string | null = null;

      if (mode === "file") {
        if (!file) { toast.error("Pick a video file"); setBusy(false); return; }
        const ext = file.name.split(".").pop();
        const key = `${creatorId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("videos").upload(key, file, { upsert: false, contentType: file.type });
        if (upErr) throw upErr;
        setProgress(60);
        finalVideoUrl = supabase.storage.from("videos").getPublicUrl(key).data.publicUrl;
        if (thumb) {
          const tkey = `${creatorId}/${Date.now()}.${thumb.name.split(".").pop()}`;
          await supabase.storage.from("thumbnails").upload(tkey, thumb, { contentType: thumb.type });
          finalThumbUrl = supabase.storage.from("thumbnails").getPublicUrl(tkey).data.publicUrl;
        }
      } else {
        if (!videoUrl.trim()) { toast.error("Paste a video URL"); setBusy(false); return; }
        try { new URL(videoUrl.trim()); } catch { toast.error("Invalid URL"); setBusy(false); return; }
        finalVideoUrl = videoUrl.trim();
        finalThumbUrl = thumbUrl.trim() || null;
        setProgress(60);
      }

      setProgress(85);
      const { error: insErr } = await supabase.from("videos").insert({
        creator_id: creatorId,
        video_url: finalVideoUrl,
        thumbnail_url: finalThumbUrl,
        caption: caption || null,
        is_featured: featured,
        tags: tags ? tags.split(",").map((t) => t.trim().replace(/^#/, "")).filter(Boolean) : [],
      });
      if (insErr) throw insErr;
      setProgress(100);
      toast.success("Video published");
      setFile(null); setThumb(null); setVideoUrl(""); setThumbUrl(""); setCaption(""); setTags(""); setFeatured(false);
      qc.invalidateQueries({ queryKey: ["feed"] });
      qc.invalidateQueries({ queryKey: ["admin-videos"] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
      setTimeout(() => setProgress(0), 500);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-2 rounded-2xl glass p-1">
        <button type="button" onClick={() => setMode("url")} className={`rounded-xl px-3 py-2.5 text-sm font-medium transition ${mode === "url" ? "gradient-primary text-primary-foreground" : "text-muted-foreground"}`}>From URL</button>
        <button type="button" onClick={() => setMode("file")} className={`rounded-xl px-3 py-2.5 text-sm font-medium transition ${mode === "file" ? "gradient-primary text-primary-foreground" : "text-muted-foreground"}`}>Upload file</button>
      </div>

      <div className="space-y-1.5">
        <Label>Creator</Label>
        <Select value={creatorId} onValueChange={setCreatorId}>
          <SelectTrigger className="h-12 rounded-xl glass"><SelectValue placeholder="Choose creator" /></SelectTrigger>
          <SelectContent>
            {creators?.map((c) => <SelectItem key={c.id} value={c.id}>{c.display_name} (@{c.username})</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {mode === "file" ? (
        <>
          <FileDrop label="Video file (MP4)" accept="video/*" onFile={setFile} file={file} />
          <FileDrop label="Thumbnail (optional)" accept="image/*" onFile={setThumb} file={thumb} />
        </>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label>Video URL</Label>
            <Input
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://… .mp4 / .webm / .m3u8"
              className="h-12 rounded-xl glass"
            />
            <p className="text-[11px] text-muted-foreground">Direct MP4/WebM/HLS links play inline. Page URLs from YouTube, Vimeo, Streamable, Turbo.cr, Streamtape, etc. are auto-embedded as players.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Thumbnail URL (optional)</Label>
            <Input
              value={thumbUrl}
              onChange={(e) => setThumbUrl(e.target.value)}
              placeholder="https://… .jpg / .png"
              className="h-12 rounded-xl glass"
            />
          </div>
        </>
      )}

      <div className="space-y-1.5">
        <Label>Caption</Label>
        <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={3} className="glass rounded-xl" placeholder="Write a caption…" />
      </div>
      <div className="space-y-1.5">
        <Label>Tags (comma separated)</Label>
        <Input value={tags} onChange={(e) => setTags(e.target.value)} className="h-12 rounded-xl glass" placeholder="cinematic, travel" />
      </div>
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} className="h-4 w-4 rounded" />
        Feature this video (boosted in the feed)
      </label>
      {progress > 0 && (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full gradient-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}
      <Button type="submit" disabled={busy} className="h-12 w-full rounded-xl gradient-primary text-base font-semibold text-primary-foreground">
        {busy ? "Publishing…" : "Publish video"}
      </Button>

      <BunkrImport creators={creators ?? []} />
    </form>
  );
}

function BunkrImport({ creators }: { creators: Array<{ id: string; display_name: string; username: string }> }) {
  const qc = useQueryClient();
  const [albumUrl, setAlbumUrl] = useState("");
  const [creatorId, setCreatorId] = useState("");
  const [items, setItems] = useState<Array<{ pageUrl: string; title: string; thumbnail: string | null }>>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scraping, setScraping] = useState(false);
  const [importing, setImporting] = useState(false);

  async function doScrape() {
    if (!albumUrl.trim()) return;
    setScraping(true); setItems([]); setSelected(new Set());
    try {
      const res = await scrapeBunkr({ data: { albumUrl: albumUrl.trim() } });
      setItems(res.items);
      setSelected(new Set(res.items.map((i) => i.pageUrl)));
      if (!res.items.length) toast.message("No videos found in album");
    } catch (e) { toast.error((e as Error).message); }
    finally { setScraping(false); }
  }

  async function doImport() {
    if (!creatorId) { toast.error("Pick a creator"); return; }
    const picked = items.filter((i) => selected.has(i.pageUrl));
    if (!picked.length) { toast.error("Select at least one video"); return; }
    setImporting(true);
    try {
      const res = await importBunkr({ data: { creatorId, items: picked } });
      toast.success(`Imported ${res.inserted} video${res.inserted === 1 ? "" : "s"}`);
      setItems([]); setSelected(new Set()); setAlbumUrl("");
      qc.invalidateQueries({ queryKey: ["feed"] });
      qc.invalidateQueries({ queryKey: ["admin-videos"] });
    } catch (e) { toast.error((e as Error).message); }
    finally { setImporting(false); }
  }

  function toggle(url: string) {
    setSelected((s) => { const n = new Set(s); n.has(url) ? n.delete(url) : n.add(url); return n; });
  }

  return (
    <div className="mt-2 space-y-3 rounded-2xl glass p-4">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Download className="h-4 w-4" /> Import from Bunkr album</h3>
      <p className="text-[11px] text-muted-foreground">
        Paste a bunkr.cr / bunkr.si album URL (e.g. <code>https://bunkr.cr/a/cYHmvZyn</code>). Videos play with our custom player and autoplay like TikTok.
      </p>
      <div className="flex gap-2">
        <Input
          value={albumUrl}
          onChange={(e) => setAlbumUrl(e.target.value)}
          placeholder="https://bunkr.cr/a/…"
          className="h-11 flex-1 rounded-xl glass"
        />
        <Button type="button" onClick={doScrape} disabled={scraping || !albumUrl.trim()} className="h-11 rounded-xl">
          {scraping ? <Loader2 className="h-4 w-4 animate-spin" /> : "Scan"}
        </Button>
      </div>

      {items.length > 0 && (
        <>
          <div className="space-y-1.5">
            <Label>Creator to attribute videos</Label>
            <Select value={creatorId} onValueChange={setCreatorId}>
              <SelectTrigger className="h-11 rounded-xl glass"><SelectValue placeholder="Choose creator" /></SelectTrigger>
              <SelectContent>
                {creators.map((c) => <SelectItem key={c.id} value={c.id}>{c.display_name} (@{c.username})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{selected.size} of {items.length} selected</span>
            <div className="flex gap-3">
              <button type="button" onClick={() => setSelected(new Set(items.map((i) => i.pageUrl)))} className="underline">All</button>
              <button type="button" onClick={() => setSelected(new Set())} className="underline">None</button>
            </div>
          </div>

          <div className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto">
            {items.map((it) => {
              const on = selected.has(it.pageUrl);
              return (
                <button
                  key={it.pageUrl}
                  type="button"
                  onClick={() => toggle(it.pageUrl)}
                  className={`relative aspect-[9/16] overflow-hidden rounded-lg border-2 transition ${on ? "border-primary" : "border-transparent opacity-60"}`}
                >
                  {it.thumbnail ? (
                    <img src={it.thumbnail} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-card text-[10px] text-muted-foreground">No preview</div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1 py-0.5 text-[9px]">{it.title}</div>
                </button>
              );
            })}
          </div>

          <Button type="button" onClick={doImport} disabled={importing || !creatorId || !selected.size} className="h-11 w-full rounded-xl gradient-primary text-primary-foreground">
            {importing ? "Importing…" : `Import ${selected.size} video${selected.size === 1 ? "" : "s"}`}
          </Button>
        </>
      )}
    </div>
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
    queryFn: async () => (await supabase.from("videos").select("id, caption, view_count, like_count, video_url, thumbnail_url, creator_id, creator:creators(display_name)").order("created_at", { ascending: false })).data ?? [],
  });
  const { data: creators } = useQuery({
    queryKey: ["creators"],
    queryFn: async () => (await supabase.from("creators").select("id, display_name, username").order("display_name")).data ?? [],
  });
  async function del(id: string) {
    if (!confirm("Delete this video?")) return;
    const { error } = await supabase.from("videos").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["admin-videos"] }); qc.invalidateQueries({ queryKey: ["feed"] }); }
  }
  async function reassign(id: string, creator_id: string) {
    const { error } = await supabase.from("videos").update({ creator_id }).eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Creator updated");
      qc.invalidateQueries({ queryKey: ["admin-videos"] });
      qc.invalidateQueries({ queryKey: ["feed"] });
      qc.invalidateQueries({ queryKey: ["admin-creators"] });
    }
  }
  return (
    <div className="space-y-2">
      {data?.map((v: any) => (
        <div key={v.id} className="flex items-center gap-3 rounded-2xl glass p-3">
          <div className="h-16 w-12 overflow-hidden rounded-lg bg-card">
            {v.thumbnail_url ? <img src={v.thumbnail_url} className="h-full w-full object-cover" alt="" /> : <video src={v.video_url} className="h-full w-full object-cover" muted />}
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="truncate text-sm font-medium">{v.caption || "Untitled"}</p>
            <p className="truncate text-xs text-muted-foreground">{v.view_count} views · {v.like_count} likes</p>
            <Select value={v.creator_id} onValueChange={(val) => reassign(v.id, val)}>
              <SelectTrigger className="h-8 rounded-lg glass text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {creators?.map((c) => <SelectItem key={c.id} value={c.id}>{c.display_name} (@{c.username})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <button onClick={() => del(v.id)} className="tap-scale rounded-full p-2 text-destructive"><Trash2 className="h-4 w-4" /></button>
        </div>
      ))}
    </div>
  );
}

type CreatorRow = {
  id: string;
  username: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  video_count: number;
};

function CreatorsTab() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin-creators"],
    queryFn: async () => ((await supabase.from("creators").select("*").order("created_at", { ascending: false })).data ?? []) as CreatorRow[],
  });
  const [form, setForm] = useState({ username: "", display_name: "", bio: "", avatar_url: "" });
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<CreatorRow | null>(null);

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
            <button onClick={() => setEditing(c)} className="tap-scale rounded-full p-2 text-muted-foreground hover:text-foreground" aria-label="Edit"><Pencil className="h-4 w-4" /></button>
            <button onClick={() => del(c.id)} className="tap-scale rounded-full p-2 text-destructive"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
      <EditCreatorDialog creator={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function EditCreatorDialog({ creator, onClose }: { creator: CreatorRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ username: "", display_name: "", bio: "", avatar_url: "", cover_url: "" });
  const [busy, setBusy] = useState(false);

  // Sync form when opening a different creator
  const currentId = creator?.id ?? "";
  const [loadedId, setLoadedId] = useState("");
  if (creator && loadedId !== currentId) {
    setLoadedId(currentId);
    setForm({
      username: creator.username,
      display_name: creator.display_name,
      bio: creator.bio ?? "",
      avatar_url: creator.avatar_url ?? "",
      cover_url: creator.cover_url ?? "",
    });
  }

  async function save() {
    if (!creator) return;
    setBusy(true);
    const { error } = await supabase.from("creators").update({
      username: form.username,
      display_name: form.display_name,
      bio: form.bio || null,
      avatar_url: form.avatar_url || null,
      cover_url: form.cover_url || null,
    }).eq("id", creator.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Creator updated");
    qc.invalidateQueries({ queryKey: ["admin-creators"] });
    qc.invalidateQueries({ queryKey: ["creators"] });
    qc.invalidateQueries({ queryKey: ["creator", form.username] });
    onClose();
  }

  return (
    <Dialog open={!!creator} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="glass">
        <DialogHeader><DialogTitle>Edit creator</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Username</Label><Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="h-11 rounded-xl glass" /></div>
          <div className="space-y-1.5"><Label>Display name</Label><Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} className="h-11 rounded-xl glass" /></div>
          <div className="space-y-1.5"><Label>Avatar URL</Label><Input value={form.avatar_url} onChange={(e) => setForm({ ...form, avatar_url: e.target.value })} className="h-11 rounded-xl glass" /></div>
          <div className="space-y-1.5"><Label>Cover URL</Label><Input value={form.cover_url} onChange={(e) => setForm({ ...form, cover_url: e.target.value })} className="h-11 rounded-xl glass" /></div>
          <div className="space-y-1.5"><Label>Bio</Label><Textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} rows={3} className="rounded-xl glass" /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy} className="gradient-primary text-primary-foreground">{busy ? "Saving…" : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
