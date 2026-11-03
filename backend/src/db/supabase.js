import { createClient } from '@supabase/supabase-js';
import { config } from '../config/index.js';

let cliente = null;

export function supabaseConfigurado() {
  return Boolean(config.supabase.url && config.supabase.secretKey);
}

export function getSupabase() {
  if (!supabaseConfigurado()) {
    console.error('[supabase] Falta SUPABASE_URL o SUPABASE_SECRET_KEY en el API');
    throw Object.assign(new Error('El acceso no está disponible en este momento.'), { status: 503 });
  }
  if (!cliente) {
    cliente = createClient(config.supabase.url, config.supabase.secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cliente;
}
