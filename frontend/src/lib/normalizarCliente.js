/** Asegura cliente plano (strings) para UI y evita renderizar objetos en React */
export function normalizarCliente(input) {
  if (input == null) return null;

  if (typeof input === 'string') {
    const t = input.trim();
    if (!t) return null;
    return { codigo: null, nombre: t, direccion: null, ciudad: null, region: null };
  }

  if (typeof input !== 'object') return null;

  const nombre = flattenTexto(input.nombre);
  const codigo = flattenTexto(input.codigo);
  const direccion = flattenTexto(input.direccion);
  const ciudad = flattenTexto(input.ciudad);
  const region = flattenTexto(input.region);

  if (!nombre && !codigo && !direccion && !ciudad && !region) return null;

  return { codigo, nombre, direccion, ciudad, region };
}

function flattenTexto(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    const t = value.trim();
    return t || null;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'object' && value.nombre != null) {
    return flattenTexto(value.nombre);
  }
  return null;
}

export function resolveClienteDesdeConsulta(d, sap) {
  return (
    normalizarCliente(d?.cliente) ||
    normalizarCliente(d?.entregaVista?.cliente) ||
    normalizarCliente(d?.entrega?.cliente) ||
    normalizarCliente(sap?.cliente) ||
    normalizarCliente({
      codigo: sap?.codigoCliente,
      nombre: sap?.cliente,
      direccion: sap?.direccion,
      ciudad: sap?.ciudad,
      region: sap?.region,
    })
  );
}
