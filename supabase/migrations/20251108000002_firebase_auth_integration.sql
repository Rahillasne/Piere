-- Firebase Auth Integration: User Mapping Table
-- Maps Firebase UIDs to Supabase user_ids for database operations

-- Create user_auth_mapping table
create table if not exists public.user_auth_mapping (
  id uuid default gen_random_uuid() primary key,
  firebase_uid text unique not null,
  supabase_user_id uuid references auth.users(id) on delete cascade not null,
  email text,
  display_name text,
  photo_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create index on firebase_uid for fast lookups
create index if not exists idx_user_auth_mapping_firebase_uid on public.user_auth_mapping(firebase_uid);

-- Create index on supabase_user_id for reverse lookups
create index if not exists idx_user_auth_mapping_supabase_user_id on public.user_auth_mapping(supabase_user_id);

-- Enable Row Level Security
alter table public.user_auth_mapping enable row level security;

-- RLS Policy: Users can read their own mapping
create policy "Users can read their own auth mapping"
  on public.user_auth_mapping
  for select
  using (auth.uid() = supabase_user_id);

-- RLS Policy: Users can insert their own mapping (during first login)
create policy "Users can insert their own auth mapping"
  on public.user_auth_mapping
  for insert
  with check (auth.uid() = supabase_user_id);

-- RLS Policy: Users can update their own mapping
create policy "Users can update their own auth mapping"
  on public.user_auth_mapping
  for update
  using (auth.uid() = supabase_user_id);

-- Function to automatically update updated_at timestamp
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Trigger to update updated_at on row update
create trigger set_updated_at
  before update on public.user_auth_mapping
  for each row
  execute function public.handle_updated_at();

-- Grant permissions
grant select, insert, update on public.user_auth_mapping to authenticated;
grant select, insert, update on public.user_auth_mapping to anon;
