import { useState } from 'react';
import { buscarEntrega, reemplazarAdjuntosEntrega } from '../api/client.js';
import { sapEmpresaDesdeConsulta, sapPlacaDesdeConsulta } from '../lib/datosConductor.js';
import AdjuntosEntrega from './AdjuntosEntrega.jsx';
import ClienteInfoCard from './info/ClienteInfoCard.jsx';
import FileDropZone from './FileDropZone.jsx';
import InfoDl from './info/InfoDl.jsx';

const AVISO_TIPO = 'Solo se admiten PDF, JPG o PNG.';

export default function ConsultaEntregaModal({ abierto, onCerrar }) {
  const [numero, setNumero] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [resultado, setResultado] = useState(null);
  const [archivos, setArchivos] = useState([]);
  const [observacion, setObservacion] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [recargaAdjuntos, setRecargaAdjuntos] = useState(0);

  const tomarArchivos = (lista) => {
    const validos = lista.filter((archivo) => /\.(pdf|jpe?g|png)$/i.test(archivo.name));
    setArchivos(validos);
    if (lista.length !== validos.length) setError(AVISO_TIPO);
    else setError((actual) => (actual === AVISO_TIPO ? '' : actual));
  };

  if (!abierto) return null;

  const buscar = async (event) => {
    event?.preventDefault();
    const vbeln = numero.trim();
    if (!vbeln || buscando) return;
    setBuscando(true);
    setError('');
    setAviso('');
    setArchivos([]);
    setObservacion('');
    setResultado(null);
    try {
      const res = await buscarEntrega(vbeln);
      if (!res.data?.encontrado) {
        setError(res.mensaje || 'No se encontró la entrega.');
        return;
      }
      setResultado(res.data);
    } catch (err) {
      setError(err.message || 'No se pudo consultar la entrega.');
    } finally {
      setBuscando(false);
    }
  };

  const enviarAdjunto = async (event) => {
    event.preventDefault();
    const nota = observacion.trim();
    if (!resultado?.vbeln || !archivos.length || !nota || enviando) return;
    setEnviando(true);
    setError('');
    setAviso('');
    try {
      const res = await reemplazarAdjuntosEntrega(resultado.vbeln, archivos, nota);
      setArchivos([]);
      setObservacion('');
      setAviso(res.mensaje || 'El adjunto se envió a SAP.');
      setRecargaAdjuntos((valor) => valor + 1);
    } catch (err) {
      setError(err.message || 'No se pudo enviar el adjunto a SAP.');
    } finally {
      setEnviando(false);
    }
  };

  const entrega = resultado?.entrega || resultado?.entregaVista;
  const tipoRaw = entrega?.tipo_entrega || entrega?.tipoEntrega;
  const tipo =
    typeof tipoRaw === 'object' ? tipoRaw.descripcion || tipoRaw.codigo || null : tipoRaw || null;

  return (
    <div className="modal-overlay" onClick={onCerrar} role="presentation">
      <div
        className="modal-card modal-card-wide modal-card-consulta"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="consulta-entrega-titulo"
      >
        <div className="section-bar" id="consulta-entrega-titulo">
          <i className="bi bi-search" aria-hidden /> Consultar entrega
          <button type="button" className="modal-close-btn" onClick={onCerrar} aria-label="Cerrar">
            <i className="bi bi-x-lg" />
          </button>
        </div>
        <div className="section-body">
          <p className="modal-desc">
            Escriba el número de una entrega de su ruta para ver la información y los adjuntos que están en SAP.
          </p>
          <form className="consulta-entrega-busca" onSubmit={buscar}>
            <div className="ig">
              <label htmlFor="consulta-entrega-numero">
                <i className="bi bi-hash" aria-hidden /> Número de entrega
              </label>
              <input
                id="consulta-entrega-numero"
                inputMode="numeric"
                autoComplete="off"
                value={numero}
                placeholder="Ej. 46676641"
                onChange={(event) => setNumero(event.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-sec" disabled={buscando || !numero.trim()}>
              {buscando ? 'Consultando...' : 'Buscar'}
            </button>
          </form>

          {error && error !== AVISO_TIPO && (
            <p className="adjuntos-error" role="alert">
              {error}
            </p>
          )}

          {resultado && (
            <>
              <InfoDl
                className="sap-info"
                rows={[
                  { label: 'Documento', value: resultado.vbeln },
                  { label: 'Tipo', value: tipo },
                  { label: 'Fecha', value: entrega?.fecha_creacion || entrega?.fechaCreacion },
                  { label: 'Empresa', value: sapEmpresaDesdeConsulta(resultado) },
                  { label: 'Placa', value: sapPlacaDesdeConsulta(resultado) },
                  { label: 'Transporte', value: resultado.transporte?.tknum || resultado.tknum },
                ]}
              />
              {resultado.cliente && <ClienteInfoCard cliente={resultado.cliente} />}
              <AdjuntosEntrega vbeln={resultado.vbeln} recarga={recargaAdjuntos} />
              <form className="consulta-entrega-subir" onSubmit={enviarAdjunto}>
                <p className="adjuntos-estado">
                  El archivo nuevo se suma a los que ya están en SAP. Si ya había un cumplido, la observación se notifica por correo. No se borra el anterior ni se registra otra entrega.
                </p>
                <FileDropZone
                  files={archivos}
                  onChange={tomarArchivos}
                  disabled={enviando}
                  title="Arrastra los archivos aquí"
                  disabledTitle="Arrastra los archivos aquí"
                  hint="PDF, JPG o PNG"
                  buttonLabel="Adjuntar archivos"
                />
                {error === AVISO_TIPO && (
                  <p className="adjuntos-error" role="alert">
                    {error}
                  </p>
                )}
                <div className="ig">
                  <label htmlFor="consulta-entrega-observacion">
                    <i className="bi bi-chat-left-text" aria-hidden /> Observación <span className="req">*</span>
                  </label>
                  <textarea
                    id="consulta-entrega-observacion"
                    value={observacion}
                    maxLength={500}
                    required
                    placeholder="Escriba el motivo de este adjunto"
                    disabled={enviando}
                    onChange={(event) => setObservacion(event.target.value)}
                  />
                </div>
                {aviso && (
                  <p className="sync-ok" role="status">
                    <i className="bi bi-check-circle" aria-hidden /> {aviso}
                  </p>
                )}
                <button type="submit" className="btn btn-pri btn-full" disabled={enviando || archivos.length === 0 || !observacion.trim()}>
                  <i className="bi bi-cloud-upload" aria-hidden />
                  {enviando ? 'Enviando a SAP...' : 'Enviar adjunto a SAP'}
                </button>
              </form>
            </>
          )}

          <div className="modal-actions">
            <button type="button" className="btn btn-sec btn-full" onClick={onCerrar}>
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
