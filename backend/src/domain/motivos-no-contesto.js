/** Motivos de novedad «no contestó» — alineados con campos en pc_registro_cumplido */
export const MOTIVOS_NO_CONTESTO = [
  { key: 'chkLlamadas', column: 'chk_llamadas', label: 'Llamadas sin respuesta' },
  { key: 'chkWhatsapp', column: 'chk_whatsapp', label: 'WhatsApp sin respuesta' },
  { key: 'chkClienteAusente', column: 'chk_cliente_ausente', label: 'Cliente ausente' },
  {
    key: 'chkClienteRechaza',
    column: 'chk_cliente_rechaza',
    label: 'Cliente rechaza entrega',
  },
  {
    key: 'chkMaterialNoSolicitado',
    column: 'chk_material_no_solicitado',
    label: 'Material no solicitado por el cliente',
  },
  {
    key: 'chkEntregaParcial',
    column: 'chk_entrega_parcial',
    label: 'Entrega parcial',
  },
];

export function tieneAlgunaMotivoNov(datos = {}) {
  return MOTIVOS_NO_CONTESTO.some((m) => Boolean(datos[m.key]));
}

export function labelsMotivosActivos(datos = {}) {
  return MOTIVOS_NO_CONTESTO.filter((m) => Boolean(datos[m.key])).map((m) => m.label);
}

/** Desde fila MySQL (snake_case) o payload camelCase del formulario */
export function motivosNovDesdeRegistro(registro = {}) {
  return Object.fromEntries(
    MOTIVOS_NO_CONTESTO.map((m) => [
      m.key,
      Boolean(registro[m.key] ?? registro[m.column]),
    ])
  );
}

export function labelsMotivosDesdeRegistro(registro = {}) {
  const map = Object.fromEntries(
    MOTIVOS_NO_CONTESTO.map((m) => [m.key, registro[m.key] ?? registro[m.column]])
  );
  return labelsMotivosActivos(map);
}

export function bindMotivosSqlParams(datos = {}) {
  return Object.fromEntries(
    MOTIVOS_NO_CONTESTO.map((m) => [m.key, datos[m.key] ? 1 : 0])
  );
}

/** Fragmentos SQL para UPDATE (column = :param) */
export function motivosSqlSetClause() {
  return MOTIVOS_NO_CONTESTO.map((m) => `${m.column} = :${m.key}`).join(',\n      ');
}
