-- Proyecto Supabase Portal_Cumplidos.
-- Ingreso por cédula + placa. La sesión vive aquí y no depende de SAP.
-- RLS activo y sin políticas para anon/authenticated: solo el API, con service_role, lee y escribe.

create table public.pc_conductor (
  id uuid primary key default gen_random_uuid(),
  cedula text not null,
  nombre text,
  telefono text,
  empresa text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pc_conductor_cedula_unique unique (cedula),
  constraint pc_conductor_cedula_formato check (cedula ~ '^[0-9]{5,15}$')
);

create table public.pc_conductor_placa (
  id uuid primary key default gen_random_uuid(),
  conductor_id uuid not null references public.pc_conductor (id) on delete cascade,
  placa text not null,
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  constraint pc_conductor_placa_par_unico unique (conductor_id, placa),
  constraint pc_conductor_placa_formato check (placa ~ '^[A-Z0-9]{4,10}$')
);

create unique index pc_conductor_placa_activa_unica
  on public.pc_conductor_placa (placa)
  where activa;

create table public.pc_sesion (
  id uuid primary key default gen_random_uuid(),
  conductor_id uuid not null references public.pc_conductor (id) on delete cascade,
  placa text not null,
  token_hash text not null,
  expira_en timestamptz not null,
  revocada_en timestamptz,
  created_at timestamptz not null default now(),
  ultimo_acceso_en timestamptz not null default now(),
  constraint pc_sesion_token_unique unique (token_hash)
);

create index pc_sesion_conductor_activa_idx
  on public.pc_sesion (conductor_id)
  where revocada_en is null;

create table public.pc_viaje_dia (
  id uuid primary key default gen_random_uuid(),
  conductor_id uuid not null references public.pc_conductor (id) on delete cascade,
  placa text not null,
  fecha date not null,
  numero_entrega text not null,
  tknum text,
  cliente text,
  direccion text,
  ciudad text,
  estado text,
  orden integer,
  fuente text not null default 'cache',
  sincronizado_en timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pc_viaje_dia_unico unique (conductor_id, fecha, numero_entrega),
  constraint pc_viaje_dia_fuente check (fuente in ('sap', 'cache'))
);

create index pc_viaje_dia_lookup_idx
  on public.pc_viaje_dia (conductor_id, placa, fecha);
