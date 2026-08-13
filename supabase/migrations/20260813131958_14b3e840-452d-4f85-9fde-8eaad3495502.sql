CREATE TABLE public.video_mirrors (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (video_id, creator_id)
);
GRANT SELECT ON public.video_mirrors TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_mirrors TO authenticated;
GRANT ALL ON public.video_mirrors TO service_role;
ALTER TABLE public.video_mirrors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read video mirrors" ON public.video_mirrors FOR SELECT USING (true);
CREATE POLICY "admins manage video mirrors" ON public.video_mirrors FOR ALL USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX video_mirrors_creator_idx ON public.video_mirrors(creator_id);