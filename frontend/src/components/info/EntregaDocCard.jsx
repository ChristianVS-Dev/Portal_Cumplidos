import InfoDl from './InfoDl.jsx';

export default function EntregaDocCard({ vbeln, entrega, itemsCount, gestionVisitas, onVerDetalle }) {
  if (!vbeln) return null;

  const tipoRaw = entrega?.tipoEntrega || entrega?.tipo_entrega;
  const tipo =
    typeof tipoRaw === 'object'
      ? (tipoRaw.descripcion || tipoRaw.codigo || null)
      : (tipoRaw ?? null);

  const visitasLabel =
    gestionVisitas != null
      ? `${gestionVisitas.visitasRegistradas ?? 0}/${gestionVisitas.maxVisitas ?? 3} visita(s)`
      : null;

  return (
    <div className="sap-info info-entrega">
      {visitasLabel != null && (
        <div className="info-entrega-visitas-chip" title="Visitas registradas en portal para esta entrega">
          <i className="bi bi-geo-alt" /> {visitasLabel}
          {gestionVisitas?.entregaExitosaCompletada && (
            <span className="info-entrega-visitas-cerrado"> · Registrado</span>
          )}
          {gestionVisitas?.entregaFallidaCompletada && !gestionVisitas?.entregaExitosaCompletada && (
            <span className="info-entrega-visitas-cerrado"> · Registrado</span>
          )}
        </div>
      )}
      <InfoDl
        rows={[
          { label: 'Documento', value: vbeln },
          { label: 'Tipo entrega', value: tipo },
          {
            label: 'Fecha documento',
            value: entrega?.fechaCreacion || entrega?.fecha_creacion,
          },
          {
            label: 'Materiales',
            value: itemsCount != null ? `${itemsCount} ítem(s)` : null,
          },
        ]}
      />
      {onVerDetalle && (
        <button type="button" className="btn btn-sec btn-sm btn-ver-detalle" onClick={onVerDetalle}>
          <i className="bi bi-eye-fill" /> Ver detalle de materiales
        </button>
      )}
    </div>
  );
}
