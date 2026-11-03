export function normalizarEmpresa(valor) {
  return String(valor || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

export function normalizarPlaca(valor) {
  return String(valor || '')
    .replace(/[\s\-.]/g, '')
    .toUpperCase();
}

export function detectarCorreccionConductor(enviado = {}, sap = {}) {
  const sapEmpresa =
    sap.transportistaEmpresa ||
    sap.transportistaAsignado ||
    sap.empresa_transportista ||
    sap.transportista ||
    '';
  const sapPlaca =
    sap.placaAsignada || sap.placaSap || sap.placa_sap || sap.placa_asignada || sap.placa || '';

  const empresaCorregida =
    Boolean(String(sapEmpresa).trim()) &&
    normalizarEmpresa(enviado.transportista) !== normalizarEmpresa(sapEmpresa);
  const placaCorregida =
    Boolean(String(sapPlaca).trim()) &&
    normalizarPlaca(enviado.placa) !== normalizarPlaca(sapPlaca);

  return {
    corregido: empresaCorregida || placaCorregida,
    empresaCorregida,
    placaCorregida,
    sap: { transportista: sapEmpresa, placa: sapPlaca },
    enviado: {
      transportista: String(enviado.transportista || '').trim(),
      placa: String(enviado.placa || '').trim(),
    },
  };
}
