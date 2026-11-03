-- Intento que devuelve SAP y conteo de adjuntos enviados desde el portal.
-- RLS sin políticas para anon/authenticated: solo el API, con service_role, lee y escribe.

alter table public.pc_viaje_dia
  add column if not exists intento integer;

alter table public.pc_viaje_dia
  drop constraint if exists pc_viaje_dia_intento_rango;

alter table public.pc_viaje_dia
  add constraint pc_viaje_dia_intento_rango
  check (intento is null or (intento >= 1 and intento <= 99));

create table if not exists public.pc_adjunto_entrega (
  id uuid primary key default gen_random_uuid(),
  conductor_id uuid not null references public.pc_conductor (id) on delete cascade,
  numero_entrega text not null,
  nombre text not null,
  tipo text not null,
  sha256 text,
  estado_sync text not null default 'pendiente',
  sap_doc_id text,
  lote_id uuid not null,
  vigente boolean not null default true,
  created_at timestamptz not null default now(),
  constraint pc_adjunto_entrega_tipo
    check (tipo in ('cumplido', 'ev_lugar', 'ev_captura', 'ev_aviso')),
  constraint pc_adjunto_entrega_sync
    check (estado_sync in ('pendiente', 'ok', 'error'))
);

create index if not exists pc_adjunto_entrega_vigente_idx
  on public.pc_adjunto_entrega (conductor_id, numero_entrega)
  where vigente;

alter table public.pc_adjunto_entrega enable row level security;
alter table public.pc_adjunto_entrega force row level security;

revoke all on table public.pc_adjunto_entrega from anon, authenticated;
