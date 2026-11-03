import { useEffect, useState } from 'react';
import { listarAdjuntosEntrega, urlAdjuntoEntrega } from '../api/client.js';

function tamanoLegible(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AdjuntosEntrega({ vbeln, recarga = 0 }) {
  const [adjuntos, setAdjuntos] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const numero = String(vbeln || '').trim();
    if (!numero) return undefined;
    let vivo = true;
    setCargando(true);
    setError('');
    listarAdjuntosEntrega(numero)
      .then((res) => {
        if (vivo) setAdjuntos(res.data?.adjuntos || []);
      })
      .catch((err) => {
        if (vivo) setError(err.message || 'No se pudieron consultar los adjuntos');
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, [vbeln, recarga]);

  return (
    <section className="adjuntos-entrega">
      <div className="section-bar">
        <i className="bi bi-paperclip" aria-hidden /> Adjuntos en SAP
      </div>
      <div className="adjuntos-cuerpo">
      {cargando && <p className="adjuntos-estado">Cargando adjuntos...</p>}
      {error && (
        <p className="adjuntos-error" role="alert">
          {error}
        </p>
      )}
      {!cargando && !error && adjuntos.length === 0 && (
        <p className="adjuntos-estado">Esta entrega no tiene adjuntos cargados desde el portal.</p>
      )}
      {adjuntos.length > 0 && (
        <ul className="adjuntos-lista">
          {adjuntos.map((item) => (
            <li key={item.docId}>
              <div>
                <strong>{item.nombre}</strong>
                <span>
                  {tamanoLegible(item.tamano)}
                  {item.fecha ? ` · ${item.fecha}` : ''}
                  {item.hora ? ` ${item.hora}` : ''}
                </span>
              </div>
              <div className="adjuntos-acciones">
                <a className="btn btn-sec btn-sm" href={urlAdjuntoEntrega(vbeln, item.docId, true)} target="_blank" rel="noreferrer">
                  Ver
                </a>
                <a className="btn btn-sec btn-sm" href={urlAdjuntoEntrega(vbeln, item.docId)} target="_blank" rel="noreferrer">
                  Descargar
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
      </div>
    </section>
  );
}
