import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  detalleEntregaEmpresa,
  getConfiguredApiBase,
  leerListaEmpresa,
  listarEntregasEmpresa,
  precalentarVistasEmpresa,
  reemplazarAdjuntosEntrega,
} from '../api/client.js';
import AdjuntosEntrega from '../components/AdjuntosEntrega.jsx';
import BrandLogo from '../components/BrandLogo.jsx';
import ConnectionBanner from '../components/ConnectionBanner.jsx';
import FileDropZone from '../components/FileDropZone.jsx';
import InfoDl from '../components/info/InfoDl.jsx';
import { useAppConnectivity } from '../hooks/useAppConnectivity.js';
import { isNativeApp } from '../platform/config.js';

const VISTAS = [
  { id: 'dia', etiqueta: 'Del día' },
  { id: 'pendientes', etiqueta: 'Pendientes' },
  { id: 'programadas', etiqueta: 'Programadas' },
  { id: 'todas', etiqueta: 'Todas' },
];

function hoyBogota() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return {
    fecha: now.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' }),
    hora: now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  };
}

function estadoEntrega(item) {
  if (item.pendiente) return { clase: 'sin_iniciar', texto: 'Pendiente' };
  if (item.entregada) return { clase: 'cumplida', texto: 'Entregada' };
  return { clase: 'en_proceso', texto: item.grupo || 'En ruta' };
}

export default function PortalEmpresa({ acceso, onSalir }) {
  const cuenta = acceso?.conductor || {};
  const clock = useClock();
  const { apiOnline, deviceOnline, apiReachable } = useAppConnectivity();
  const [fecha, setFecha] = useState(acceso?.fecha || hoyBogota());
  const [vista, setVista] = useState('dia');
  const [dias, setDias] = useState(7);
  const [pagina, setPagina] = useState(1);
  const [busqueda, setBusqueda] = useState('');
  const [lista, setLista] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [seleccion, setSeleccion] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [abriendo, setAbriendo] = useState(false);
  const [archivos, setArchivos] = useState([]);
  const [observacion, setObservacion] = useState('');
  const [copias, setCopias] = useState([]);
  const [copia, setCopia] = useState('');
  const [modalEnvio, setModalEnvio] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [recargaAdjuntos, setRecargaAdjuntos] = useState(0);
  const detalleRef = useRef(null);
  const listaRef = useRef(null);

  const cargar = useCallback(async (fresco = false) => {
    const params = { fecha, vista, pagina, limite: 50, dias };
    const inmediata = fresco ? null : leerListaEmpresa(params);
    if (inmediata?.data) {
      setLista(inmediata.data);
      setError('');
      setCargando(false);
      precalentarVistasEmpresa(params);
      return;
    }
    setCargando(true);
    setError('');
    try {
      const res = await listarEntregasEmpresa(params, { fresco: Boolean(fresco) });
      setLista(res.data);
      precalentarVistasEmpresa(params);
    } catch (err) {
      setLista(null);
      setError(err.message || 'No se pudieron consultar las entregas de la empresa');
    } finally {
      setCargando(false);
    }
  }, [fecha, vista, pagina, dias]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (!seleccion) return;
    if (window.matchMedia('(min-width: 801px)').matches) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    detalleRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }, [seleccion]);

  const abrir = async (numero) => {
    setSeleccion(numero);
    setDetalle(null);
    setArchivos([]);
    setObservacion('');
    setCopias([]);
    setCopia('');
    setModalEnvio(false);
    setAviso('');
    setError('');
    setAbriendo(true);
    try {
      const res = await detalleEntregaEmpresa(numero);
      setDetalle(res.data);
    } catch (err) {
      setError(err.message || 'No se pudo abrir la entrega');
    } finally {
      setAbriendo(false);
    }
  };

  const abrirEnvio = () => {
    if (!detalle?.puedeAdjuntar || !seleccion || !archivos.length || enviando) return;
    setError('');
    setModalEnvio(true);
  };

  const cerrarEnvio = () => {
    if (enviando) return;
    setModalEnvio(false);
  };

  const correoCopiaValido = (valor) => {
    const correo = String(valor || '').trim().toLowerCase();
    return correo.length > 0 && correo.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo);
  };

  const agregarCopia = () => {
    const correo = copia.trim().toLowerCase();
    if (!correo) return false;
    if (!correoCopiaValido(correo)) {
      setError('Hay un correo de copia que no es válido');
      return false;
    }
    if (copias.includes(correo)) {
      setCopia('');
      setError('');
      return true;
    }
    if (copias.length >= 5) {
      setError('Puede agregar hasta 5 correos de copia');
      return false;
    }
    setCopias((lista) => [...lista, correo]);
    setCopia('');
    setError('');
    return true;
  };

  const enviar = async (event) => {
    event.preventDefault();
    if (!detalle?.puedeAdjuntar || !seleccion || !archivos.length || !observacion.trim() || enviando) return;
    const pendientes = [...copias];
    const suelta = copia.trim().toLowerCase();
    if (suelta) {
      if (!correoCopiaValido(suelta)) {
        setError('Hay un correo de copia que no es válido');
        return;
      }
      if (!pendientes.includes(suelta) && pendientes.length >= 5) {
        setError('Puede agregar hasta 5 correos de copia');
        return;
      }
      if (!pendientes.includes(suelta)) pendientes.push(suelta);
    }
    setEnviando(true);
    setAviso('');
    setError('');
    try {
      const res = await reemplazarAdjuntosEntrega(seleccion, archivos, observacion.trim(), pendientes);
      setArchivos([]);
      setObservacion('');
      setCopias([]);
      setCopia('');
      setModalEnvio(false);
      if (res.data?.avisoError) setError(res.mensaje || res.data.avisoError);
      else setAviso(res.mensaje || 'El adjunto se envió a SAP.');
      setRecargaAdjuntos((valor) => valor + 1);
    } catch (err) {
      setError(err.message || 'SAP no confirmó el adjunto. No se envió el correo.');
    } finally {
      setEnviando(false);
    }
  };

  const empresa = lista?.transportista?.nombre || cuenta.empresa || 'Empresa';
  const nit = lista?.transportista?.nit || cuenta.nit || '';
  const codigo = cuenta.transportistaCodigo || '';
  const listaVisible = lista && lista.vista === vista && Number(lista.pagina) === Number(pagina) ? lista : null;
  const entregas = listaVisible?.entregas || [];
  const entrega = detalle?.entrega;
  const vistaActiva = VISTAS.find((item) => item.id === vista)?.etiqueta || 'Del día';
  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return entregas;
    return entregas.filter((item) =>
      [item.numero, item.cliente, item.ciudad, item.direccion, item.placa, item.conductor, item.transporte]
        .join(' ')
        .toLowerCase()
        .includes(texto)
    );
  }, [busqueda, entregas]);

  useEffect(() => {
    const panel = detalleRef.current;
    const lista = listaRef.current;
    if (!panel || !lista || typeof ResizeObserver === 'undefined') return undefined;
    const medir = () => {
      if (window.matchMedia('(max-width: 800px)').matches) {
        lista.style.height = '';
        return;
      }
      const minimo = Math.min(window.innerHeight * 0.72, 820);
      lista.style.height = `${Math.max(minimo, panel.scrollHeight)}px`;
    };
    const obs = new ResizeObserver(medir);
    obs.observe(panel);
    medir();
    window.addEventListener('resize', medir);
    return () => {
      obs.disconnect();
      window.removeEventListener('resize', medir);
      lista.style.height = '';
    };
  }, [entrega, abriendo, seleccion, aviso, cargando, visibles.length, archivos.length]);

  return (
    <div className="pw empresa-portal">
      {!apiOnline && (
        <ConnectionBanner
          tipo={!deviceOnline ? 'general' : 'sin_api'}
          detalle={
            isNativeApp() && deviceOnline && !apiReachable
              ? `API configurado: ${getConfiguredApiBase()}`
              : null
          }
        />
      )}

      <div className="page-top">
        <div>
          <div className="breadcrumb">
            <i className="bi bi-grid-3x3-gap-fill" /> Logística
            <i className="bi bi-chevron-right" /> Transportistas
          </div>
          <div className="page-title">Portal de Cumplidos</div>
          <div className="page-sub">Seguimiento guiado · Empresa</div>
        </div>
      </div>

      <div className={`header-card ${!apiOnline ? 'api-offline' : ''}`}>
        <div className="prog-wrap">
          <div className="prog-bar" style={{ width: seleccion ? '72%' : '28%' }} />
        </div>
        <div className="header-top">
          <div className="logo-row">
            <BrandLogo />
          </div>
          <div className="header-right">
            <div className="clock-box">
              <div className="clock-date">{clock.fecha}</div>
              <div className="clock-time">{clock.hora}</div>
            </div>
            <div className="status-row">
              <div className="sdot" />
              <span className="slbl">{apiOnline ? 'En línea' : 'Sin conexión'}</span>
              {onSalir && (
                <button type="button" className="btn-link-field" onClick={onSalir}>
                  Salir
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="hero-inner">
          <div className="hero-left">
            <div className="pill">
              <div className="pill-dot" />
              <span className="pill-txt">{vistaActiva}</span>
            </div>
            <div className="hero-title">
              Seguimiento de <em>entregas</em>
            </div>
            <div className="hero-sub">
              {empresa}
              {nit ? ` · NIT ${nit}` : ''}
              {codigo ? ` · código ${codigo}` : ''}
            </div>
          </div>
        </div>
      </div>

      <section className="empresa-mando" aria-label="Filtros de entregas">
        <div className="empresa-vistas" role="tablist" aria-label="Vista de entregas">
          {VISTAS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={vista === item.id}
              className={vista === item.id ? 'is-active' : ''}
              onClick={() => {
                setVista(item.id);
                setPagina(1);
                setBusqueda('');
                setSeleccion(null);
                setDetalle(null);
              }}
            >
              {item.etiqueta}
            </button>
          ))}
        </div>

        <div className="empresa-herramientas">
          <label className="ig">
            Fecha
            <input
              type="date"
              value={fecha}
              onChange={(e) => {
                setFecha(e.target.value);
                setPagina(1);
              }}
            />
          </label>
          <label className="pendientes-buscar">
            <i className="bi bi-search" aria-hidden />
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar número, cliente o placa"
              aria-label="Buscar en esta página"
            />
          </label>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => cargar(true)} disabled={cargando}>
            <i className="bi bi-arrow-repeat" /> {cargando ? 'Consultando...' : 'Actualizar'}
          </button>
        </div>

        {lista?.totales && (
          <dl className="empresa-cifras">
            <div className="cifra-dia"><dt>Del día</dt><dd>{lista.totales.delDia}</dd></div>
            <div className="cifra-pendientes"><dt>Pendientes</dt><dd>{lista.totales.pendientes}</dd></div>
            <div className="cifra-programadas"><dt>Programadas</dt><dd>{lista.totales.programadas}</dd></div>
            <div className="cifra-transportes"><dt>Transportes</dt><dd>{lista.totales.transportes}</dd></div>
          </dl>
        )}
      </section>

      {lista?.truncado && (
        <div className="alert-nov show" role="status">
          <i className="bi bi-exclamation-triangle-fill" />
          <div>
            <span className="alert-nov-title">Hay demasiados transportes en esta ventana</span>
            <span className="alert-nov-sub">Baje los días para ver el listado completo.</span>
            <label className="empresa-dias">
              Días
              <select
                value={dias}
                onChange={(e) => {
                  setDias(Number(e.target.value));
                  setPagina(1);
                }}
              >
                {[3, 7, 14, 30].map((valor) => (
                  <option key={valor} value={valor}>{valor}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
      )}

      {error && !modalEnvio && (
        <div className="err-bar show" role="alert">
          <i className="bi bi-x-octagon-fill" /> {error}
        </div>
      )}

      <div className="empresa-trabajo">
        <section className="empresa-lista" aria-busy={cargando} ref={listaRef}>
          <div className="section-bar">
            <i className="bi bi-signpost-split" /> Entregas
            {lista?.total > 0 && <span className="step-badge">{lista.total}</span>}
          </div>
          <div className="section-body empresa-lista-cuerpo">
          <p className="pendientes-hint">Toque una entrega para ver el conductor, la placa y el adjunto.</p>

          {cargando && !entregas.length && (
            <div className="pendientes-empty">
              <i className="bi bi-hourglass-split" /> Consultando las entregas de la empresa...
            </div>
          )}
          {!cargando && !entregas.length && (
            <div className="pendientes-empty">
              <i className="bi bi-inbox" /> No hay entregas en esta vista.
            </div>
          )}
          {!cargando && entregas.length > 0 && !visibles.length && (
            <div className="pendientes-empty">
              <i className="bi bi-search" /> Ninguna entrega de esta página coincide con la búsqueda.
            </div>
          )}

          {visibles.length > 0 && (
          <ul className="pendientes-list">
            {visibles.map((item) => {
              const estado = estadoEntrega(item);
              const activa = seleccion === item.numero;
              return (
                <li key={item.numero}>
                  <button
                    type="button"
                    className={`pendiente-card${activa ? ' selected' : ''}`}
                    onClick={() => abrir(item.numero)}
                  >
                    <div className="pendiente-card-top">
                      <strong className="pendiente-vbeln">{item.numero}</strong>
                      <span className={`pendiente-chip pendiente-proceso-badge ${estado.clase}`}>{estado.texto}</span>
                    </div>
                    <div className="pendiente-card-body">{item.cliente || 'Sin cliente'}</div>
                    <div className="pendiente-card-sub">
                      {item.direccion || 'Sin dirección'}
                      {item.ciudad ? ` · ${item.ciudad}` : ''}
                    </div>
                    <div className="pendiente-card-meta">
                      <span><i className="bi bi-truck" /> Placa {item.placa || '—'}</span>
                      <span><i className="bi bi-person" /> {item.conductor || 'Sin conductor'}</span>
                      {item.fechaEntrega && (
                        <span><i className="bi bi-calendar3" /> {item.fechaEntrega}</span>
                      )}
                    </div>
                    {activa && (
                      <span className="pendiente-activa-tag">
                        <i className="bi bi-check-circle-fill" /> Seleccionada
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          )}

          {lista && lista.paginas > 1 && (
            <div className="pendientes-paginacion">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={pagina <= 1 || cargando}
                onClick={() => setPagina((n) => Math.max(1, n - 1))}
              >
                Anterior
              </button>
              <span>Página {lista.pagina} de {lista.paginas}</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={pagina >= lista.paginas || cargando}
                onClick={() => setPagina((n) => n + 1)}
              >
                Siguiente
              </button>
            </div>
          )}
          </div>
        </section>

        <aside className="empresa-detalle" ref={detalleRef}>
          <div className="section-bar">
            <i className="bi bi-paperclip" />
            {entrega ? `Entrega ${entrega.numero}` : 'Adjunto'}
          </div>
          <div className="section-body">
            {!seleccion && (
              <div className="pendientes-empty">
                <i className="bi bi-list-ul" /> Toque una entrega de la lista para ver el conductor, la placa y adjuntar el cumplido.
              </div>
            )}
            {abriendo && (
              <div className="pendientes-empty">
                <i className="bi bi-hourglass-split" /> Abriendo la entrega...
              </div>
            )}
            {seleccion && !abriendo && !entrega && (
              <div className="pendientes-empty">
                <i className="bi bi-inbox" /> No se pudo mostrar esta entrega.
              </div>
            )}
            {entrega && (
              <>
                {aviso && (
                  <p className="sync-ok" role="status">
                    <i className="bi bi-check2-circle" /> {aviso}
                  </p>
                )}
                <InfoDl
                  title="Cliente"
                  icon="bi-person-badge-fill"
                  className="sap-info info-cliente"
                  rows={[
                    { label: 'Nombre', value: entrega.cliente },
                    { label: 'Dirección', value: entrega.direccion },
                    { label: 'Ciudad', value: entrega.ciudad },
                    { label: 'Tipo', value: entrega.tipo },
                  ]}
                />
                <InfoDl
                  title="Transporte"
                  icon="bi-truck-front-fill"
                  className="sap-info info-transporte"
                  rows={[
                    { label: 'Transporte', value: entrega.transporte },
                    { label: 'Descripción', value: entrega.nombreTransporte },
                    { label: 'Placa', value: entrega.placa },
                    { label: 'Conductor', value: entrega.conductor },
                  ]}
                />
                {detalle.puedeAdjuntar ? (
                  <div className="empresa-subir">
                    <p className="wizard-panel-intro">
                      Elija los archivos. La observación y el correo de copia se escriben al enviar.
                    </p>
                    <FileDropZone
                      files={archivos}
                      onChange={setArchivos}
                      disabled={enviando}
                      title="Arrastra los archivos aquí"
                      hint="PDF, JPG o PNG"
                      buttonLabel="Adjuntar archivos"
                    />
                    <button
                      className="btn btn-pri btn-full"
                      type="button"
                      onClick={abrirEnvio}
                      disabled={enviando || !archivos.length}
                    >
                      Enviar adjunto
                    </button>
                    <AdjuntosEntrega vbeln={entrega.numero} recarga={recargaAdjuntos} />
                  </div>
                ) : (
                  <div className="alert-nov show" role="status">
                    <i className="bi bi-exclamation-triangle-fill" />
                    <div>
                      <span className="alert-nov-title">Esta entrega no admite un adjunto</span>
                      <span className="alert-nov-sub">No pertenece a esta empresa o ya no se puede cargar.</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </aside>
      </div>

      {modalEnvio && (
        <div className="modal-overlay" role="presentation" onClick={cerrarEnvio}>
          <div
            className="modal-card modal-card-terminos"
            role="dialog"
            aria-modal="true"
            aria-labelledby="envio-adjunto-titulo"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="section-bar">
              <i className="bi bi-send" /> Enviar adjunto
              <button type="button" className="modal-close-btn" onClick={cerrarEnvio} disabled={enviando} aria-label="Cerrar">
                <i className="bi bi-x-lg" />
              </button>
            </div>
            <form className="section-body" onSubmit={enviar}>
              <p className="modal-desc">
                El correo sale solo si SAP confirma el archivo. Si SAP no lo confirma, verá el error y no se envía el aviso.
              </p>
              {error && (
                <div className="err-bar show" role="alert">
                  <i className="bi bi-x-octagon-fill" /> {error}
                </div>
              )}
              <label className="ig empresa-obs" htmlFor="envio-observacion">
                Observación
                <textarea
                  id="envio-observacion"
                  value={observacion}
                  maxLength={500}
                  onChange={(e) => setObservacion(e.target.value)}
                  disabled={enviando}
                  required
                  placeholder="Motivo del adjunto"
                />
              </label>
              <div className="empresa-copia-fila">
                <label className="ig" htmlFor="envio-copia">
                  Correos de copia
                  <input
                    id="envio-copia"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={copia}
                    maxLength={120}
                    onChange={(e) => setCopia(e.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter') return;
                      event.preventDefault();
                      agregarCopia();
                    }}
                    disabled={enviando}
                    placeholder="Opcional. Hasta 5 correos"
                  />
                </label>
                <button type="button" className="btn btn-ghost" onClick={agregarCopia} disabled={enviando || !copia.trim()}>
                  Agregar
                </button>
              </div>
              {copias.length > 0 && (
                <ul className="empresa-copias">
                  {copias.map((correo) => (
                    <li key={correo} className="empresa-copia">
                      <span>{correo}</span>
                      <button
                        type="button"
                        onClick={() => setCopias((lista) => lista.filter((item) => item !== correo))}
                        disabled={enviando}
                        aria-label={`Quitar ${correo}`}
                      >
                        <i className="bi bi-x-lg" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="empresa-modal-acciones">
                <button type="button" className="btn btn-ghost" onClick={cerrarEnvio} disabled={enviando}>
                  Cancelar
                </button>
                <button className="btn btn-pri" type="submit" disabled={enviando || !observacion.trim()}>
                  {enviando ? 'Enviando a SAP...' : 'Enviar adjunto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
