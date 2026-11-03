-- Confirmación del correo al crear la cuenta.
-- Las cuentas que ya existen quedan confirmadas (default true) y pueden seguir ingresando.
-- No aplicar sin autorización: altera public.pc_conductor.

alter table public.pc_conductor
  add column if not exists email_confirmado boolean not null default true,
  add column if not exists confirm_token_hash text,
  add column if not exists confirm_expira_en timestamptz;

create index if not exists pc_conductor_confirm_token
  on public.pc_conductor (confirm_token_hash)
  where confirm_token_hash is not null;
