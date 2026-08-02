create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  nickname text,
  public_id char(8),
  avatar_url text,
  bio text,
  created_at timestamptz default now()
);
alter table public.profiles add column if not exists nickname text;
alter table public.profiles add column if not exists public_id char(8);
alter table public.profiles add column if not exists bio text;
create unique index if not exists profiles_nickname_unique on public.profiles (lower(nickname)) where nickname is not null;
create unique index if not exists profiles_public_id_unique on public.profiles (public_id) where public_id is not null;

create table if not exists public.account_aliases (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null,
  email text not null
);
create unique index if not exists account_aliases_nickname_unique on public.account_aliases (lower(nickname));
create unique index if not exists account_aliases_email_unique on public.account_aliases (lower(email));

create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  title text not null,
  author text,
  description text,
  cover_url text,
  format text check (format in ('epub','pdf','docx')),
  file_url text,
  total_pages int default 1,
  content jsonb not null default '[]'::jsonb,
  genre text,
  language text default 'Português',
  published_year int,
  publisher text,
  tags text[] default '{}',
  reads_count int not null default 0,
  created_at timestamptz default now()
);
alter table public.books add column if not exists description text;
alter table public.books add column if not exists content jsonb not null default '[]'::jsonb;
alter table public.books add column if not exists genre text;
alter table public.books add column if not exists language text default 'Português';
alter table public.books add column if not exists published_year int;
alter table public.books add column if not exists publisher text;
alter table public.books add column if not exists tags text[] default '{}';
alter table public.books add column if not exists reads_count int not null default 0;

create table if not exists public.created_books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  author text,
  description text,
  cover_url text,
  status text default 'draft' check (status in ('draft','published')),
  genre text,
  language text default 'Português',
  published_year int,
  publisher text,
  tags text[] default '{}',
  reads_count int not null default 0,
  created_at timestamptz default now()
);
alter table public.created_books add column if not exists description text;
alter table public.created_books add column if not exists genre text;
alter table public.created_books add column if not exists language text default 'Português';
alter table public.created_books add column if not exists published_year int;
alter table public.created_books add column if not exists publisher text;
alter table public.created_books add column if not exists tags text[] default '{}';
alter table public.created_books alter column author drop default;

create table if not exists public.chapters (
  id uuid primary key default gen_random_uuid(),
  created_book_id uuid not null references public.created_books(id) on delete cascade,
  title text,
  content text,
  order_index int
);

create table if not exists public.reading_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  book_id uuid not null,
  book_source text check (book_source in ('imported','created')),
  current_page int default 0,
  anchor_offset bigint not null default 0,
  percent numeric default 0,
  updated_at timestamptz default now(),
  unique (user_id, book_id, book_source)
);

alter table public.reading_progress add column if not exists anchor_offset bigint not null default 0;

create table if not exists public.customization_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  font text default 'serif',
  theme text default 'light',
  margin int default 24,
  line_spacing numeric default 1.4
);

create table if not exists public.book_reads (
  user_id uuid not null references public.profiles(id) on delete cascade,
  book_id uuid not null,
  book_source text not null check (book_source in ('imported','created')),
  read_at timestamptz default now(),
  primary key (user_id, book_id, book_source)
);

create table if not exists public.shelf_items (
  user_id uuid not null references public.profiles(id) on delete cascade,
  book_id uuid not null,
  book_source text not null check (book_source in ('imported','created')),
  status text not null default 'saved' check (status in ('saved','wishlist','reading','completed')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (user_id, book_id, book_source)
);

create table if not exists public.book_reactions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  book_id uuid not null,
  book_source text not null check (book_source in ('imported','created')),
  reaction text not null check (reaction in ('like','dislike')),
  created_at timestamptz default now(),
  primary key (user_id, book_id, book_source)
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  book_id uuid not null,
  book_source text not null check (book_source in ('imported','created')),
  rating int not null check (rating between 1 and 5),
  content text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, book_id, book_source)
);

create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  activity_type text not null,
  book_id uuid,
  book_source text check (book_source in ('imported','created')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  book_id uuid not null,
  book_source text not null check (book_source in ('imported','created')),
  page_number int not null,
  anchor_offset bigint not null default 0,
  note text,
  created_at timestamptz default now(),
  unique (user_id, book_id, book_source, page_number)
);

alter table public.bookmarks add column if not exists anchor_offset bigint not null default 0;

create table if not exists public.highlights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  book_id uuid not null,
  book_source text not null check (book_source in ('imported','created')),
  anchor_start bigint not null,
  anchor_end bigint not null,
  selected_text text not null,
  color text not null default 'yellow' check (color in ('yellow','green','blue','pink')),
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  check (anchor_end >= anchor_start)
);
create index if not exists highlights_reader_lookup on public.highlights (user_id, book_id, book_source, anchor_start, anchor_end);

create or replace function public.generate_reader_id()
returns char(8) language plpgsql as $$
declare candidate char(8);
begin
  loop
    candidate := lpad((floor(random() * 100000000))::bigint::text, 8, '0');
    exit when not exists (select 1 from public.profiles where public_id = candidate);
  end loop;
  return candidate;
end;
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare handle text;
begin
  handle := lower(coalesce(new.raw_user_meta_data->>'nickname', split_part(new.email, '@', 1)));
  insert into public.profiles (id, display_name, nickname, public_id)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', handle), handle, public.generate_reader_id())
  on conflict (id) do update set display_name = excluded.display_name, nickname = coalesce(public.profiles.nickname, excluded.nickname), public_id = coalesce(public.profiles.public_id, excluded.public_id);
  insert into public.account_aliases (user_id, nickname, email) values (new.id, handle, lower(new.email))
  on conflict (user_id) do update set nickname = excluded.nickname, email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

update public.profiles set public_id = public.generate_reader_id() where public_id is null;

create or replace function public.register_book_read(target_book_id uuid, target_source text)
returns boolean language plpgsql security definer set search_path = public as $$
declare owner_id uuid; inserted_count int;
begin
  if auth.uid() is null then return false; end if;
  if target_source = 'imported' then select user_id into owner_id from public.books where id = target_book_id;
  else select user_id into owner_id from public.created_books where id = target_book_id and status = 'published'; end if;
  if owner_id is null or owner_id = auth.uid() then return false; end if;
  insert into public.book_reads (user_id, book_id, book_source) values (auth.uid(), target_book_id, target_source)
  on conflict do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count > 0 then
    if target_source = 'imported' then update public.books set reads_count = reads_count + 1 where id = target_book_id;
    else update public.created_books set reads_count = reads_count + 1 where id = target_book_id; end if;
  end if;
  return inserted_count > 0;
end;
$$;
grant execute on function public.register_book_read(uuid, text) to authenticated;

create or replace function public.get_reader_rankings()
returns table (user_id uuid, books_read bigint, pages_read bigint, streak_days int)
language sql security definer set search_path = public as $$
  select p.id,
    (select count(*) from public.book_reads br where br.user_id = p.id) as books_read,
    coalesce((select sum(greatest(rp.current_page, 0)) from public.reading_progress rp where rp.user_id = p.id), 0)::bigint as pages_read,
    coalesce((select count(distinct date(br.read_at)) from public.book_reads br where br.user_id = p.id and br.read_at >= now() - interval '30 days'), 0)::int as streak_days
  from public.profiles p;
$$;
grant execute on function public.get_reader_rankings() to anon, authenticated;

insert into public.account_aliases (user_id, nickname, email)
select u.id,
  lower(coalesce(nullif(u.raw_user_meta_data->>'nickname', ''), split_part(u.email, '@', 1) || '_' || right(u.id::text, 4))),
  lower(u.email)
from auth.users u
where u.email is not null
on conflict (user_id) do update set email = excluded.email;

alter table public.profiles enable row level security;
alter table public.account_aliases enable row level security;
alter table public.books enable row level security;
alter table public.created_books enable row level security;
alter table public.chapters enable row level security;
alter table public.reading_progress enable row level security;
alter table public.customization_settings enable row level security;
alter table public.book_reads enable row level security;
alter table public.shelf_items enable row level security;
alter table public.book_reactions enable row level security;
alter table public.reviews enable row level security;
alter table public.follows enable row level security;
alter table public.activities enable row level security;
alter table public.bookmarks enable row level security;
alter table public.highlights enable row level security;

do $$ declare p record; begin
  for p in select schemaname, tablename, policyname from pg_policies where schemaname='public' loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

create policy "profiles_public_read" on public.profiles for select using (true);
create policy "profiles_update_own" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
create policy "aliases_service_only" on public.account_aliases for select using (false);
create policy "books_public_metadata" on public.books for select using (true);
create policy "books_insert_own" on public.books for insert to authenticated with check (auth.uid() = user_id);
create policy "books_update_own" on public.books for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "books_delete_own" on public.books for delete to authenticated using (auth.uid() = user_id);
create policy "created_books_public_read" on public.created_books for select using (status = 'published' or auth.uid() = user_id);
create policy "created_books_insert_own" on public.created_books for insert to authenticated with check (auth.uid() = user_id);
create policy "created_books_update_own" on public.created_books for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "created_books_delete_own" on public.created_books for delete to authenticated using (auth.uid() = user_id);
create policy "chapters_authenticated_read" on public.chapters for select to authenticated using (exists (select 1 from public.created_books b where b.id = created_book_id and (b.status = 'published' or b.user_id = auth.uid())));
create policy "chapters_insert_own" on public.chapters for insert to authenticated with check (exists (select 1 from public.created_books b where b.id = created_book_id and b.user_id = auth.uid()));
create policy "chapters_update_own" on public.chapters for update to authenticated using (exists (select 1 from public.created_books b where b.id = created_book_id and b.user_id = auth.uid()));
create policy "chapters_delete_own" on public.chapters for delete to authenticated using (exists (select 1 from public.created_books b where b.id = created_book_id and b.user_id = auth.uid()));
create policy "progress_manage_own" on public.reading_progress for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "settings_manage_own" on public.customization_settings for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "reads_insert_own" on public.book_reads for insert to authenticated with check (auth.uid() = user_id);
create policy "reads_view_own" on public.book_reads for select to authenticated using (auth.uid() = user_id);
create policy "shelf_manage_own" on public.shelf_items for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "reactions_public_read" on public.book_reactions for select using (true);
create policy "reactions_manage_own" on public.book_reactions for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "reviews_public_read" on public.reviews for select using (true);
create policy "reviews_insert_own" on public.reviews for insert to authenticated with check (auth.uid() = user_id);
create policy "reviews_update_own" on public.reviews for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "reviews_delete_own" on public.reviews for delete to authenticated using (auth.uid() = user_id);
create policy "follows_public_read" on public.follows for select using (true);
create policy "follows_manage_own" on public.follows for all to authenticated using (auth.uid() = follower_id) with check (auth.uid() = follower_id);
create policy "activities_public_read" on public.activities for select using (true);
create policy "activities_insert_own" on public.activities for insert to authenticated with check (auth.uid() = user_id);
create policy "bookmarks_manage_own" on public.bookmarks for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "highlights_manage_own" on public.highlights for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on public.account_aliases from anon, authenticated;
revoke all on public.books from anon;
grant select (id, user_id, title, author, description, cover_url, format, total_pages, genre, language, published_year, publisher, tags, reads_count, created_at) on public.books to anon;
grant select, insert, update, delete on public.books to authenticated;
grant select on public.profiles, public.created_books, public.reviews, public.book_reactions, public.follows, public.activities to anon, authenticated;
grant insert, update, delete on public.created_books, public.reviews, public.book_reactions, public.follows, public.activities to authenticated;
grant select, insert, update, delete on public.chapters, public.reading_progress, public.customization_settings, public.book_reads, public.shelf_items, public.bookmarks, public.highlights to authenticated;

insert into storage.buckets (id, name, public) values ('covers', 'covers', true), ('avatars', 'avatars', true), ('uploads', 'uploads', false) on conflict (id) do nothing;
drop policy if exists "cover_public_read" on storage.objects;
drop policy if exists "cover_upload_own" on storage.objects;
drop policy if exists "cover_update_own" on storage.objects;
drop policy if exists "cover_delete_own" on storage.objects;
drop policy if exists "avatar_public_read" on storage.objects;
drop policy if exists "avatar_upload_own" on storage.objects;
drop policy if exists "avatar_update_own" on storage.objects;
drop policy if exists "uploads_manage_own" on storage.objects;
create policy "cover_public_read" on storage.objects for select using (bucket_id = 'covers');
create policy "cover_upload_own" on storage.objects for insert to authenticated with check (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "cover_update_own" on storage.objects for update to authenticated using (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "cover_delete_own" on storage.objects for delete to authenticated using (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatar_public_read" on storage.objects for select using (bucket_id = 'avatars');
create policy "avatar_upload_own" on storage.objects for insert to authenticated with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatar_update_own" on storage.objects for update to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "uploads_manage_own" on storage.objects for all to authenticated using (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text);
