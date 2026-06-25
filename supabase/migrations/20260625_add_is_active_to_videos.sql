-- Add is_active column to videos for soft-deactivation of broken/unavailable sources.
-- Bunny Stream is currently unavailable; this migration sets Bunny-hosted videos inactive
-- so they stop appearing in the feed without deleting them.

ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Deactivate all Bunny Stream videos (mediadelivery.net embed URLs).
UPDATE public.videos SET is_active = false WHERE video_url ILIKE '%mediadelivery.net%';
