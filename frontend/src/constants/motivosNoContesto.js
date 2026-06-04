export const MOTIVOS_NO_CONTESTO = [
  { key: 'chkLlamadas', label: 'Llamadas sin respuesta', icon: 'bi-telephone-x' },
  { key: 'chkWhatsapp', label: 'WhatsApp sin respuesta', icon: 'bi-whatsapp' },
  { key: 'chkClienteAusente', label: 'Cliente ausente', icon: 'bi-person-x' },
  {
    key: 'chkClienteRechaza',
    label: 'Cliente rechaza entrega',
    icon: 'bi-hand-thumbs-down',
  },
  {
    key: 'chkMaterialNoSolicitado',
    label: 'Material no solicitado por el cliente',
    icon: 'bi-box-seam',
  },
  {
    key: 'chkEntregaParcial',
    label: 'Entrega parcial',
    icon: 'bi-boxes',
  },
];

export function motivosNovVacios() {
  return Object.fromEntries(MOTIVOS_NO_CONTESTO.map((m) => [m.key, false]));
}

/** Desde registroBorrador devuelto al consultar (BD) */
export function motivosNovDesdeRegistro(registro = {}) {
  if (registro?.motivosNov) return { ...motivosNovVacios(), ...registro.motivosNov };
  const out = motivosNovVacios();
  for (const m of MOTIVOS_NO_CONTESTO) {
    if (registro[m.key]) out[m.key] = true;
  }
  return out;
}

export function payloadMotivosNov(motivosNov = {}) {
  const out = {};
  for (const m of MOTIVOS_NO_CONTESTO) {
    out[m.key] = Boolean(motivosNov[m.key]);
  }
  return out;
}

export function tieneMotivoNovSeleccionado(motivosNov = {}) {
  return MOTIVOS_NO_CONTESTO.some((m) => motivosNov[m.key]);
}
