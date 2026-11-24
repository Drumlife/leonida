-- Synchronisation de Leonida Tracker entre appareils, sans compte.
-- Une ligne par « code de synchro » ; seule l'empreinte SHA-256 du code est stockée.
-- Aucun accès direct à la table : tout passe par leonida_load / leonida_save.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.leonida_saves (
  key_hash   text primary key,
  data       jsonb not null,
  version    bigint not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.leonida_saves enable row level security;
-- Pas de politique RLS : ni anon ni authenticated ne lisent ou n'écrivent la table directement.
revoke all on public.leonida_saves from anon, authenticated;

-- Lit la sauvegarde liée à un code. Retourne null si le code n'a encore rien enregistré.
create or replace function public.leonida_load(p_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if p_key is null or length(p_key) < 20 then
    raise exception 'code de synchro invalide';
  end if;
  select s.data, s.version, s.updated_at into r
  from public.leonida_saves s
  where s.key_hash = encode(extensions.digest(p_key, 'sha256'), 'hex');
  if not found then
    return null;
  end if;
  return jsonb_build_object('data', r.data, 'version', r.version, 'updated_at', r.updated_at);
end;
$$;

-- Enregistre si la version de base correspond (verrou optimiste).
-- Sinon renvoie {ok:false, version, data} pour que l'appareil fusionne et réessaie.
create or replace function public.leonida_save(p_key text, p_data jsonb, p_version bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  h   text;
  cur record;
begin
  if p_key is null or length(p_key) < 20 then
    raise exception 'code de synchro invalide';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'données invalides';
  end if;
  if octet_length(p_data::text) > 5000000 then
    raise exception 'sauvegarde trop volumineuse (5 Mo max)';
  end if;

  h := encode(extensions.digest(p_key, 'sha256'), 'hex');
  select s.version, s.data into cur from public.leonida_saves s where s.key_hash = h for update;

  if not found then
    insert into public.leonida_saves (key_hash, data, version) values (h, p_data, 1)
    on conflict (key_hash) do nothing;
    if found then
      return jsonb_build_object('ok', true, 'version', 1);
    end if;
    select s.version, s.data into cur from public.leonida_saves s where s.key_hash = h for update;
  end if;

  if cur.version <> p_version then
    return jsonb_build_object('ok', false, 'version', cur.version, 'data', cur.data);
  end if;

  update public.leonida_saves
     set data = p_data, version = cur.version + 1, updated_at = now()
   where key_hash = h;
  return jsonb_build_object('ok', true, 'version', cur.version + 1);
end;
$$;

revoke all on function public.leonida_load(text) from public;
revoke all on function public.leonida_save(text, jsonb, bigint) from public;
grant execute on function public.leonida_load(text) to anon, authenticated;
grant execute on function public.leonida_save(text, jsonb, bigint) to anon, authenticated;
