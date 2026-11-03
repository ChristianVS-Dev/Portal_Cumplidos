-- Contraseña y recuperación. La clave solo se guarda como hash.
-- Aplicada en el proyecto Portal_Cumplidos (xietddxxjsuuaajxtzeu).

alter table public.pc_conductor
  add column if not exists password_hash text,
  add column if not exists email text,
  add column if not exists es_contacto boolean not null default false,
  add column if not exists reset_token_hash text,
  add column if not exists reset_expira_en timestamptz;

create unique index if not exists pc_conductor_email_unico
  on public.pc_conductor (lower(email))
  where email is not null;

create index if not exists pc_conductor_reset_token
  on public.pc_conductor (reset_token_hash)
  where reset_token_hash is not null;
