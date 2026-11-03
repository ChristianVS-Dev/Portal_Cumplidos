-- Trazabilidad del portal: sincronizaciones, entregas reasignadas y acciones del conductor.
-- RLS sin políticas para anon/authenticated: solo el API, con service_role, lee y escribe.

create table if not exists public.pc_sincronizacion (
  id uuid primary key default gen_random_uuid(),
  conductor_id uuid not null references public.pc_conductor (id) on delete cascade,
  placa text not null,
  revisadas integer not null default 0,
  propias integer not null default 0,
  ocultadas integer not null default 0,
  mensaje text,
  created_at timestamptz not null default now(),
  constraint pc_sincronizacion_conteos
    check (revisadas >= 0 and propias >= 0 and ocultadas >= 0)
);

create index if not exists pc_sincronizacion_conductor_idx
  on public.pc_sincronizacion (conductor_id, created_at desc);

create table if not exists public.pc_trazabilidad (
  id uuid primary key default gen_random_uuid(),
  conductor_id uuid not null references public.pc_conductor (id) on delete cascade,
  sesion_id uuid references public.pc_sesion (id) on delete set null,
  sincronizacion_id uuid references public.pc_sincronizacion (id) on delete set null,
  accion text not null,
  numero_entrega text,
  doc_id text,
  resultado text not null default 'ok',
  detalle jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint pc_trazabilidad_accion check (accion in (
    'sincronizar',
    'ocultar_entrega',
    'seleccionar_entrega',
    'rechazar_entrega',
    'ver_detalle',
    'listar_adjuntos',
    'ver_adjunto',
    'descargar_adjunto',
    'eliminar_adjunto',
    'enviar_adjuntos',
    'reemplazar_adjuntos',
    'restaurar_entrega',
    'actualizar_entrega'
  )),
  constraint pc_trazabilidad_resultado check (resultado in ('ok', 'rechazado', 'error'))
);

create index if not exists pc_trazabilidad_conductor_idx
  on public.pc_trazabilidad (conductor_id, created_at desc);

create index if not exists pc_trazabilidad_entrega_idx
  on public.pc_trazabilidad (numero_entrega, created_at desc)
  where numero_entrega is not null;

alter table public.pc_viaje_dia
  add column if not exists pertenencia text not null default 'propia',
  add column if not exists motivo text,
  add column if not exists sincronizacion_id uuid;

alter table public.pc_viaje_dia
  drop constraint if exists pc_viaje_dia_pertenencia_chk;

alter table public.pc_viaje_dia
  add constraint pc_viaje_dia_pertenencia_chk
  check (pertenencia in ('propia', 'ajena', 'desconocida'));

alter table public.pc_viaje_dia
  drop constraint if exists pc_viaje_dia_sincronizacion_fk;

alter table public.pc_viaje_dia
  add constraint pc_viaje_dia_sincronizacion_fk
  foreign key (sincronizacion_id) references public.pc_sincronizacion (id) on delete set null;

create index if not exists pc_viaje_dia_visibles_idx
  on public.pc_viaje_dia (conductor_id, placa, fecha)
  where pertenencia <> 'ajena';

alter table public.pc_sincronizacion enable row level security;
alter table public.pc_sincronizacion force row level security;
alter table public.pc_trazabilidad enable row level security;
alter table public.pc_trazabilidad force row level security;

revoke all on table public.pc_sincronizacion from anon, authenticated;
revoke all on table public.pc_trazabilidad from anon, authenticated;
