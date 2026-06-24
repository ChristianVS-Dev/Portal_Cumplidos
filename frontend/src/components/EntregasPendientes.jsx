export default function EntregasPendientes({
  entregas = [],
  totalEntregas = 0,
  seleccionadoId,
  activoVbeln,
  onSeleccionar,
  onVerDetalle,
  cargando = false,
}) {
  const total = totalEntregas || entregas.length;
  const esEntregaFallida = (item) =>
    item.estadoProceso === 'cumplida' && item.estadoResultado === 'no_contesto';

  const estadoProcesoTexto = (item) => {
    if (esEntregaFallida(item)) return 'Fallida';
    if (item.estadoProceso === 'cumplida') return 'Exitosa';
    if (item.estadoProceso === 'en_proceso') return 'En proceso';
    return 'Pendiente';
  };

  const estadoProcesoTitulo = (item) => {
    if (esEntregaFallida(item)) return 'Entrega fallida (no contestó)';
    if (item.estadoProceso === 'cumplida') return 'Cumplida exitosa';
    if (item.estadoProceso === 'en_proceso') return 'En proceso';
    return 'Sin iniciar';
  };

  return (
    <div className="pendientes-block">
      <div className="section-title">
        <i className="bi bi-list-check" /> Entregas pendientes
        {total > 0 && <span className="pendientes-badge">{total} en ruta</span>}
      </div>
      <p className="pendientes-hint">
        Otras entregas del mismo transporte. Seleccione una para dar seguimiento al cumplido o use{' '}
        <strong>Ver detalle</strong> para ver los materiales.
      </p>

      {cargando ? (
        <div className="search-loading">Actualizando entregas...</div>
      ) : entregas.length === 0 ? (
        <div className="pendientes-empty">
          <i className="bi bi-inbox" />
          Consulte un número de entrega válido para ver el transporte.
        </div>
      ) : (
        <ul className="pendientes-list">
          {entregas.map((item) => {
            const id = item.id || item.vbeln;
            const esActiva = activoVbeln && String(activoVbeln) === String(item.vbeln);
            const estadoClase = esEntregaFallida(item)
              ? 'entrega-fallida'
              : item.estadoProceso || 'sin_iniciar';
            return (
              <li key={id}>
                <div
                  className={`pendiente-card ${seleccionadoId === id || esActiva ? 'selected' : ''}`}
                >
                  <div className="pendiente-card-top">
                    <strong className="pendiente-vbeln">{item.vbeln || item.numero}</strong>
                    <span className="pendiente-estado" title={item.ruta}>
                      {item.ruta || item.estado || 'PENDIENTE'}
                    </span>
                  </div>
                  <div className="pendiente-card-body">{item.cliente}</div>
                  <div className="pendiente-card-sub">
                    {item.direccion}
                    {item.ciudad ? ` · ${item.ciudad}` : ''}
                  </div>
                  {(item.fechaCreacion || item.conductor) && (
                    <div className="pendiente-card-meta">
                      {item.fechaCreacion && (
                        <span>
                          <i className="bi bi-calendar3" /> {item.fechaCreacion}
                        </span>
                      )}
                      {item.transportistaEmpresa && (
                        <span className="pendiente-meta-empresa" title={item.transportistaEmpresa}>
                          <i className="bi bi-truck" /> {item.transportistaEmpresa}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="pendiente-status-stack">
                    <div
                      className={`pendiente-chip pendiente-proceso-badge ${estadoClase}`}
                      title={estadoProcesoTitulo(item)}
                    >
                      <i className="bi bi-flag-fill" aria-hidden />
                      <span>{estadoProcesoTexto(item)}</span>
                    </div>
                    <div className="pendiente-chip pendiente-adjuntos-chip" title="Adjuntos registrados">
                      <i className="bi bi-paperclip" aria-hidden />
                      <span>Adj. {item.totalAdjuntos || 0}</span>
                    </div>
                    <div
                      className="pendiente-chip pendiente-visitas-chip"
                      title="Intentos de visita registrados"
                    >
                      <i className="bi bi-geo-alt" aria-hidden />
                      <span>
                        {item.visitasRegistradas ?? 0}/{item.visitasMax ?? 3}
                      </span>
                    </div>
                  </div>
                  <div className="pendiente-card-actions">
                    <button
                      type="button"
                      className="btn btn-sec btn-sm"
                      onClick={() => onVerDetalle?.(item)}
                    >
                      <i className="bi bi-eye-fill" /> Ver detalle
                    </button>
                    {!esActiva && (
                      <button
                        type="button"
                        className="btn btn-pri btn-sm"
                        onClick={() => onSeleccionar(item)}
                      >
                        <i className="bi bi-check2" /> Seleccionar
                      </button>
                    )}
                    {esActiva && (
                      <span className="pendiente-activa-tag">
                        <i className="bi bi-check-circle-fill" /> Activa
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
