-- ============================================================
-- PALIER — Schéma Supabase
-- Exécutez ce fichier dans l'éditeur SQL de votre projet Supabase
-- ============================================================

-- Activer l'extension UUID si besoin
create extension if not exists "uuid-ossp";

-- ============================================================
-- TABLES
-- ============================================================

-- Profils utilisateurs (complète auth.users de Supabase)
create table public.profiles (
  id          uuid references auth.users on delete cascade primary key,
  email       text,
  prenom      text not null,
  photo_url   text,
  quartier    text not null,
  bio         text,
  trust_score integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Publications
create table public.posts (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references public.profiles(id) on delete cascade not null,
  type        text not null check (type in ('besoin', 'offre')),
  categorie   text not null check (categorie in ('Entraide', 'Animal', 'Sortie', 'Covoiturage', 'Objet', 'Autre')),
  description text not null check (char_length(description) >= 10 and char_length(description) <= 300),
  quartier    text not null,
  is_resolved boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Conversations (fils de messages entre deux personnes)
create table public.conversations (
  id            uuid default gen_random_uuid() primary key,
  post_id       uuid references public.posts(id) on delete set null,
  participant_1 uuid references public.profiles(id) on delete cascade not null,
  participant_2 uuid references public.profiles(id) on delete cascade not null,
  created_at    timestamptz not null default now(),
  unique (post_id, participant_1, participant_2)
);

-- Messages
create table public.messages (
  id              uuid default gen_random_uuid() primary key,
  conversation_id uuid references public.conversations(id) on delete cascade not null,
  sender_id       uuid references public.profiles(id) on delete cascade not null,
  content         text not null check (char_length(content) >= 1 and char_length(content) <= 2000),
  read            boolean not null default false,
  created_at      timestamptz not null default now()
);

-- Signalements
create table public.reports (
  id          uuid default gen_random_uuid() primary key,
  reporter_id uuid references public.profiles(id) on delete cascade not null,
  target_type text not null check (target_type in ('post', 'profile')),
  target_id   uuid not null,
  reason      text not null,
  resolved    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================

create index idx_posts_quartier       on public.posts(quartier);
create index idx_posts_user_id        on public.posts(user_id);
create index idx_posts_created_at     on public.posts(created_at desc);
create index idx_posts_categorie      on public.posts(categorie);
create index idx_messages_conv        on public.messages(conversation_id, created_at);
create index idx_messages_unread      on public.messages(conversation_id, read) where read = false;
create index idx_conversations_p1     on public.conversations(participant_1);
create index idx_conversations_p2     on public.conversations(participant_2);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

alter table public.profiles      enable row level security;
alter table public.posts         enable row level security;
alter table public.conversations enable row level security;
alter table public.messages      enable row level security;
alter table public.reports       enable row level security;

-- PROFILES
create policy "Profils visibles par tous" on public.profiles
  for select using (true);

create policy "Modifier son propre profil" on public.profiles
  for update using (auth.uid() = id);

create policy "Créer son profil" on public.profiles
  for insert with check (auth.uid() = id);

create policy "Supprimer son propre profil" on public.profiles
  for delete using (auth.uid() = id);

-- POSTS
create policy "Posts visibles par tous" on public.posts
  for select using (true);

create policy "Créer un post (utilisateur connecté)" on public.posts
  for insert with check (auth.uid() = user_id);

create policy "Modifier son propre post" on public.posts
  for update using (auth.uid() = user_id);

create policy "Supprimer son propre post" on public.posts
  for delete using (auth.uid() = user_id);

-- CONVERSATIONS
create policy "Voir ses propres conversations" on public.conversations
  for select using (
    auth.uid() = participant_1 or auth.uid() = participant_2
  );

create policy "Créer une conversation" on public.conversations
  for insert with check (
    auth.uid() = participant_1 or auth.uid() = participant_2
  );

-- MESSAGES
create policy "Voir les messages de ses conversations" on public.messages
  for select using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (c.participant_1 = auth.uid() or c.participant_2 = auth.uid())
    )
  );

create policy "Envoyer un message dans ses conversations" on public.messages
  for insert with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (c.participant_1 = auth.uid() or c.participant_2 = auth.uid())
    )
  );

create policy "Marquer ses messages comme lus" on public.messages
  for update using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (c.participant_1 = auth.uid() or c.participant_2 = auth.uid())
    )
  );

-- REPORTS
create policy "Créer un signalement" on public.reports
  for insert with check (auth.uid() = reporter_id);

create policy "Voir ses propres signalements" on public.reports
  for select using (auth.uid() = reporter_id);

-- ============================================================
-- REALTIME
-- ============================================================

-- Activer la réplication temps réel pour les messages
alter publication supabase_realtime add table public.messages;

-- ============================================================
-- STORAGE (bucket pour les avatars)
-- ============================================================

-- Créez un bucket "avatars" dans Supabase Storage (interface web)
-- puis appliquez ces politiques :

-- insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true);

-- create policy "Avatar public en lecture" on storage.objects
--   for select using (bucket_id = 'avatars');

-- create policy "Upload son propre avatar" on storage.objects
--   for insert with check (
--     bucket_id = 'avatars'
--     and auth.uid()::text = (storage.foldername(name))[1]
--   );

-- create policy "Modifier son propre avatar" on storage.objects
--   for update using (
--     bucket_id = 'avatars'
--     and auth.uid()::text = (storage.foldername(name))[1]
--   );

-- ============================================================
-- TRIGGER : updated_at automatique sur profiles
-- ============================================================

create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger on_profiles_updated
  before update on public.profiles
  for each row execute procedure public.handle_updated_at();

-- ============================================================
-- TRIGGER : incrémenter trust_score lors d'une résolution
-- ============================================================

create or replace function public.increment_trust_on_resolve()
returns trigger language plpgsql security definer as $$
begin
  if new.is_resolved = true and old.is_resolved = false then
    update public.profiles
    set trust_score = trust_score + 1
    where id = new.user_id;
  end if;
  return new;
end;
$$;

create trigger on_post_resolved
  after update on public.posts
  for each row execute procedure public.increment_trust_on_resolve();

-- ============================================================
-- MIGRATION : Confidentialité granulaire (à exécuter si la
-- table profiles existe déjà depuis la version initiale)
-- ============================================================

alter table public.profiles
  add column if not exists age        integer check (age >= 16 and age <= 120),
  add column if not exists gender     text check (gender in ('Homme','Femme','Non-binaire','Ne pas préciser')),
  add column if not exists show_age   boolean not null default true,
  add column if not exists show_gender boolean not null default true,
  add column if not exists show_bio   boolean not null default true,
  add column if not exists show_photo boolean not null default true;
