import { useMemo, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { X } from "lucide-react";

export type MentionCreator = { id: string; display_name: string; username: string };

type Props = {
  creators: MentionCreator[];
  value: string;
  onChange: (v: string) => void;
  /** creator ids the video is mirrored to */
  mirrors: string[];
  onMirrorsChange: (ids: string[]) => void;
  rows?: number;
  placeholder?: string;
};

/**
 * Caption textarea with "@" creator mentions. Picking a creator inserts
 * @username into the caption and mirrors the video onto that profile.
 */
export function MentionCaptionInput({
  creators,
  value,
  onChange,
  mirrors,
  onMirrorsChange,
  rows = 3,
  placeholder = "Write a caption… type @ to mirror to another creator",
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [anchor, setAnchor] = useState(0);

  const matches = useMemo(() => {
    if (query === null) return [];
    const q = query.toLowerCase();
    return creators
      .filter((c) => !q || c.username.toLowerCase().includes(q) || c.display_name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [creators, query]);

  function detect(text: string, caret: number) {
    const upto = text.slice(0, caret);
    const at = upto.lastIndexOf("@");
    if (at === -1) return setQuery(null);
    const frag = upto.slice(at + 1);
    if (/\s/.test(frag)) return setQuery(null);
    setAnchor(at);
    setQuery(frag);
  }

  function pick(c: MentionCreator) {
    const el = ref.current;
    const caret = el?.selectionStart ?? value.length;
    const next = `${value.slice(0, anchor)}@${c.username} ${value.slice(caret)}`;
    onChange(next);
    setQuery(null);
    if (!mirrors.includes(c.id)) onMirrorsChange([...mirrors, c.id]);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = anchor + c.username.length + 2;
      el?.setSelectionRange(pos, pos);
    });
  }

  return (
    <div className="relative space-y-2">
      <Textarea
        ref={ref}
        value={value}
        rows={rows}
        placeholder={placeholder}
        className="glass rounded-xl"
        onChange={(e) => {
          onChange(e.target.value);
          detect(e.target.value, e.target.selectionStart ?? e.target.value.length);
        }}
        onKeyUp={(e) => detect(e.currentTarget.value, e.currentTarget.selectionStart ?? 0)}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
      />

      {query !== null && matches.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl glass border border-border/20">
          <div className="max-h-52 overflow-y-auto">
            {matches.map((c) => (
              <button
                key={c.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(c)}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition hover:bg-foreground/5"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full gradient-primary text-[10px] font-bold text-primary-foreground">
                  {c.display_name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{c.display_name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">@{c.username}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {mirrors.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {mirrors.map((id) => {
            const c = creators.find((x) => x.id === id);
            if (!c) return null;
            return (
              <span key={id} className="flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-medium">
                Also on @{c.username}
                <button type="button" onClick={() => onMirrorsChange(mirrors.filter((m) => m !== id))} aria-label="Remove mirror">
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
