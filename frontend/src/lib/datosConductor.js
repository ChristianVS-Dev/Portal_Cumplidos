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

export function sapEmpresaDesdeConsulta(d) {
  const t = d?.transporte;
  const sap = d?.sap || d?.entregaLocal;
  return (
    t?.transportista?.nombre ||
    sap?.transportistaEmpresa ||
    sap?.transportistaAsignado ||
    ''
  );
}

export function sapPlacaDesdeConsulta(d) {
  const t = d?.transporte;
  const sap = d?.sap || d?.entregaLocal;
  return t?.placa || sap?.placaAsignada || sap?.placaSap || '';
}

export function payloadCorreccionConductor(form, sapConductor) {
  const sapNom = sapConductor?.nom || '';
  const sapPla = sapConductor?.pla || '';
  const empresaCorregida =
    Boolean(sapNom.trim()) && normalizarEmpresa(form.nom) !== normalizarEmpresa(sapNom);
  const placaCorregida =
    Boolean(sapPla.trim()) && normalizarPlaca(form.pla) !== normalizarPlaca(sapPla);
  return {
    datosConductorCorregidos: empresaCorregida || placaCorregida,
    datosConductorSap: {
      transportista: sapNom,
      placa: sapPla,
    },
  };
}
