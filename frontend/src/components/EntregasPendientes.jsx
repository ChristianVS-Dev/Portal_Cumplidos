import { useEffect, useMemo, useRef, useState } from 'react';

const TAMANOS = [10, 20, 50];

function sinAcentos(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export default function EntregasPendientes({
  entregas = [],
  totalEntregas = 0,
  seleccionadoId,
  activoVbeln,
  onSeleccionar,
  onVerDetalle,
  consultandoVbeln = null,
  cargando = false,
  titulo = 'Entregas pendientes',
  icono = 'bi-list-check',
  hint = (
    <>
      Otras entregas del mismo transporte. Seleccione una para dar seguimiento al cumplido o use{' '}
      <strong>Ver detalle</strong> para ver los materiales.
    </>
  ),
  vacio = 'Consulte un número de entrega válido para ver el transporte.',
  separado = true,
  controles = false,
  className = '',
  textoBadge = '',
}) {
  const [consulta, setConsulta] = useState('');
  const [tamano, setTamano] = useState(10);
  const [pagina, setPagina] = useState(1);
  const total = totalEntregas || entregas.length;
  const filtradas = useMemo(() => {
    const texto = sinAcentos(consulta.trim());
    if (!texto) return entregas;
    return entregas.filter((item) =>
      sinAcentos(
        [
          item.vbeln,
          item.numero,
          item.cliente,
          item.direccion,
          item.ciudad,
          item.ruta,
          item.estado,
          item.fechaCreacion,
        ].join(' ')
      ).includes(texto)
    );
  }, [consulta, entregas]);
  const paginas = Math.max(1, Math.ceil(filtradas.length / tamano));
  const paginaVisible = Math.min(pagina, paginas);
  const desde = filtradas.length === 0 ? 0 : (paginaVisible - 1) * tamano;
  const visibles = filtradas.slice(desde, desde + tamano);
  const mostrarControles = entregas.length > 0 && (controles || entregas.length > 10);

  const entregaActiva = useRef(activoVbeln);

  useEffect(() => {
    setPagina(1);
  }, [consulta, tamano]);

  useEffect(() => {
    if (entregaActiva.current === activoVbeln) return;
    entregaActiva.current = activoVbeln;
    if (!activoVbeln) return;
    const indice = filtradas.findIndex((item) => String(item.vbeln || item.numero) === String(activoVbeln));
    if (indice >= 0) setPagina(Math.floor(indice / tamano) + 1);
  }, [activoVbeln, filtradas, tamano]);
  const esEntregaFallida = (item) =>
    item.estadoProceso === 'cumplida' && item.estadoResultado === 'no_contesto';

  const estadoProcesoTexto = (item) => {
    if (esEntregaFallida(item)) return 'Novedad';
    if (item.estadoProceso === 'cumplida') return 'Exitosa';
    if (item.estadoProceso === 'en_proceso') return 'En proceso';
    return 'Pendiente';
  };

  const estadoProcesoTitulo = (item) => {
    if (esEntregaFallida(item)) return 'Novedad en entrega';
    if (item.estadoProceso === 'cumplida') return 'Cumplida exitosa';
    if (item.estadoProceso === 'en_proceso') return 'En proceso';
    return 'Sin iniciar';
  };

  return (
    <div className={`pendientes-block${separado ? '' : ' sin-separador'}${className ? ` ${className}` : ''}`}>
      <div className="section-title">
        <i className={`bi ${icono}`} /> {titulo}
        {total > 0 && <span className="pendientes-badge">{textoBadge || `${total} en ruta`}</span>}
      </div>
      <p className="pendientes-hint">{hint}</p>

      {mostrarControles && !cargando && entregas.length > 0 && (
        <div className="pendientes-toolbar">
          <label className="pendientes-buscar">
            <i className="bi bi-search" aria-hidden />
            <input
              type="search"
              value={consulta}
              onChange={(event) => setConsulta(event.target.value)}
              placeholder="Buscar número, cliente o dirección"
              aria-label="Buscar entregas"
            />
          </label>
          <label className="pendientes-tamano">
            Ver
            <select
              value={tamano}
              onChange={(event) => setTamano(Number(event.target.value))}
              aria-label="Entregas por página"
            >
              {TAMANOS.map((opcion) => (
                <option key={opcion} value={opcion}>
                  {opcion}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {cargando ? (
        <div className="search-loading">Actualizando entregas...</div>
      ) : entregas.length === 0 ? (
        <div className="pendientes-empty">
          <i className="bi bi-inbox" />
          {vacio}
        </div>
      ) : filtradas.length === 0 ? (
        <div className="pendientes-empty">
          <i className="bi bi-search" />
          Ninguna entrega coincide con la búsqueda.
        </div>
      ) : (
        <>
        <ul className="pendientes-list">
          {visibles.map((item) => {
            const id = item.id || item.vbeln;
            const esActiva = activoVbeln && String(activoVbeln) === String(item.vbeln);
            const consultandoEsta = consultandoVbeln && String(consultandoVbeln) === String(item.vbeln || item.numero);
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
                      disabled={Boolean(consultandoVbeln)}
                    >
                      <i className="bi bi-eye-fill" /> Ver detalle
                    </button>
                    {!esActiva && (
                      <button
                        type="button"
                        className="btn btn-pri btn-sm"
                        onClick={() => onSeleccionar(item)}
                        disabled={Boolean(consultandoVbeln)}
                      >
                        <i className={`bi ${consultandoEsta ? 'bi-hourglass-split' : 'bi-check2'}`} />
                        {consultandoEsta ? 'Consultando...' : 'Seleccionar'}
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
        {filtradas.length > tamano && (
          <div className="pendientes-paginacion">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setPagina((actual) => Math.max(1, actual - 1))}
              disabled={paginaVisible <= 1}
            >
              Anterior
            </button>
            <span>
              {desde + 1}–{Math.min(desde + tamano, filtradas.length)} de {filtradas.length}
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setPagina((actual) => Math.min(paginas, actual + 1))}
              disabled={paginaVisible >= paginas}
            >
              Siguiente
            </button>
          </div>
        )}
        </>
      )}
    </div>
  );
}
