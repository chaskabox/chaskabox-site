-- ============================================================
-- ChaskaBox — Supabase database schema
-- Run this in your Supabase project: SQL Editor → New query → paste → Run
-- ============================================================

-- 1. Profiles (one row per customer, linked to auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  phone text,
  birthday date,
  created_at timestamptz default now()
);

-- 2. Orders (customer order history)
create table if not exists public.orders (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  items jsonb not null default '[]',   -- [{id,name,price,qty,img}]
  subtotal numeric not null default 0,
  delivery_fee numeric not null default 0,
  total numeric not null default 0,
  pay_method text,                      -- 'COD' | 'JazzCash'
  name text,
  phone text,
  address text,
  city text,
  video_requested boolean not null default false, -- 🎬 customer wants a packing video
  status text not null default 'pending', -- pending | confirmed | shipped | delivered | cancelled
  created_at timestamptz default now()
);
create index if not exists orders_user_idx on public.orders(user_id, created_at desc);

-- 3. Saved addresses
create table if not exists public.addresses (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'Home',  -- Home | Office | Other
  full_name text,
  phone text,
  address text not null,
  city text,
  is_default boolean not null default false,
  created_at timestamptz default now()
);
create index if not exists addresses_user_idx on public.addresses(user_id);

-- 4. Wishlist (synced across devices)
create table if not exists public.wishlist (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id integer not null,
  created_at timestamptz default now(),
  unique(user_id, product_id)
);
create index if not exists wishlist_user_idx on public.wishlist(user_id);

-- ============================================================
-- Row Level Security: users can ONLY touch their own rows
-- ============================================================
alter table public.profiles  enable row level security;
alter table public.orders    enable row level security;
alter table public.addresses enable row level security;
alter table public.wishlist  enable row level security;

-- profiles
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- orders
drop policy if exists "own orders" on public.orders;
create policy "own orders" on public.orders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- addresses
drop policy if exists "own addresses" on public.addresses;
create policy "own addresses" on public.addresses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- wishlist
drop policy if exists "own wishlist" on public.wishlist;
create policy "own wishlist" on public.wishlist
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- Auto-create a profile row whenever a new user signs up
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- PART 3 migration: birthday column for Birthday Club
-- (Run this if you already ran the schema above before Part 3)
-- ============================================================
alter table public.profiles add column if not exists birthday date;

-- ============================================================
-- PACKING VIDEO migration: video_requested on orders
-- (Run this if you already ran the schema above before packing videos)
-- ============================================================
alter table public.orders add column if not exists video_requested boolean not null default false;
