
-- Roles
create type public.app_role as enum ('admin', 'user');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  telegram_id bigint unique,
  username text unique,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

-- Categories
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  created_at timestamptz not null default now()
);
alter table public.categories enable row level security;

-- Creators
create table public.creators (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  display_name text not null,
  bio text,
  avatar_url text,
  cover_url text,
  social_links jsonb default '{}'::jsonb,
  follower_count int not null default 0,
  like_count int not null default 0,
  video_count int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.creators enable row level security;

-- Videos
create table public.videos (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creators(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  video_url text not null,
  thumbnail_url text,
  caption text,
  tags text[] default '{}',
  duration_seconds numeric,
  view_count int not null default 0,
  like_count int not null default 0,
  is_featured boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.videos enable row level security;
create index videos_created_at_idx on public.videos (created_at desc);
create index videos_creator_idx on public.videos (creator_id);

-- Interactions
create table public.likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, video_id)
);
alter table public.likes enable row level security;

create table public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, video_id)
);
alter table public.favorites enable row level security;

create table public.video_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  video_id uuid not null references public.videos(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.video_views enable row level security;

-- RLS: public read for creators/videos/categories
create policy "public read creators" on public.creators for select using (true);
create policy "public read videos" on public.videos for select using (true);
create policy "public read categories" on public.categories for select using (true);

-- Admin write
create policy "admins manage creators" on public.creators for all
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));
create policy "admins manage videos" on public.videos for all
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));
create policy "admins manage categories" on public.categories for all
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- Profiles
create policy "profiles select own" on public.profiles for select using (auth.uid() = id);
create policy "profiles update own" on public.profiles for update using (auth.uid() = id);
create policy "profiles insert own" on public.profiles for insert with check (auth.uid() = id);

-- User roles: users can read own roles
create policy "read own roles" on public.user_roles for select using (auth.uid() = user_id);

-- Likes / favorites / views
create policy "likes select own" on public.likes for select using (auth.uid() = user_id);
create policy "likes insert own" on public.likes for insert with check (auth.uid() = user_id);
create policy "likes delete own" on public.likes for delete using (auth.uid() = user_id);

create policy "favs select own" on public.favorites for select using (auth.uid() = user_id);
create policy "favs insert own" on public.favorites for insert with check (auth.uid() = user_id);
create policy "favs delete own" on public.favorites for delete using (auth.uid() = user_id);

create policy "views insert any" on public.video_views for insert with check (true);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Counters
create or replace function public.bump_video_likes() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    update public.videos set like_count = like_count + 1 where id = new.video_id;
    update public.creators set like_count = like_count + 1
      where id = (select creator_id from public.videos where id = new.video_id);
  elsif tg_op = 'DELETE' then
    update public.videos set like_count = greatest(like_count - 1, 0) where id = old.video_id;
    update public.creators set like_count = greatest(like_count - 1, 0)
      where id = (select creator_id from public.videos where id = old.video_id);
  end if;
  return null;
end; $$;
create trigger likes_count_trg after insert or delete on public.likes
for each row execute function public.bump_video_likes();

create or replace function public.bump_video_views() returns trigger language plpgsql as $$
begin
  update public.videos set view_count = view_count + 1 where id = new.video_id;
  return null;
end; $$;
create trigger views_count_trg after insert on public.video_views
for each row execute function public.bump_video_views();

create or replace function public.bump_creator_video_count() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    update public.creators set video_count = video_count + 1 where id = new.creator_id;
  elsif tg_op = 'DELETE' then
    update public.creators set video_count = greatest(video_count - 1, 0) where id = old.creator_id;
  end if;
  return null;
end; $$;
create trigger creators_videos_count_trg after insert or delete on public.videos
for each row execute function public.bump_creator_video_count();

-- Storage buckets
insert into storage.buckets (id, name, public) values
  ('videos', 'videos', true),
  ('thumbnails', 'thumbnails', true),
  ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "public read videos bucket" on storage.objects for select using (bucket_id = 'videos');
create policy "public read thumbs bucket" on storage.objects for select using (bucket_id = 'thumbnails');
create policy "public read avatars bucket" on storage.objects for select using (bucket_id = 'avatars');

create policy "admins write videos bucket" on storage.objects for insert
  with check (bucket_id = 'videos' and public.has_role(auth.uid(), 'admin'));
create policy "admins update videos bucket" on storage.objects for update
  using (bucket_id = 'videos' and public.has_role(auth.uid(), 'admin'));
create policy "admins delete videos bucket" on storage.objects for delete
  using (bucket_id = 'videos' and public.has_role(auth.uid(), 'admin'));

create policy "admins write thumbs bucket" on storage.objects for insert
  with check (bucket_id = 'thumbnails' and public.has_role(auth.uid(), 'admin'));
create policy "admins write avatars bucket" on storage.objects for insert
  with check (bucket_id = 'avatars' and public.has_role(auth.uid(), 'admin'));
