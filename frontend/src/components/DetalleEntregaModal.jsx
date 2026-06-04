import InfoDl from './info/InfoDl.jsx';
import { normalizarCliente } from '../lib/normalizarCliente.js';

export default function DetalleEntregaModal({ abierto, onCerrar, vbeln, entrega, items = [], cargando = false }) {
  if (!abierto) return null;

  const cliente = normalizarCliente(entrega?.cliente);
  const tipoRaw = entrega?.tipo_entrega || entrega?.tipoEntrega;
  const tipo =
    typeof tipoRaw === 'object'
      ? (tipoRaw.descripcion || tipoRaw.codigo || null)
      : (tipoRaw ?? null);

  return (
    <div className="modal-overlay" onClick={onCerrar} role="presentation">
      <div
        className="modal-card modal-card-wide"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="detalle-entrega-titulo"
      >
        <div className="section-bar">
          <i className="bi bi-box-seam-fill" /> Detalle de entrega
          <button type="button" className="modal-close-btn" onClick={onCerrar} aria-label="Cerrar">
            <i className="bi bi-x-lg" />
          </button>
        </div>
        <div className="section-body">
          <p className="modal-desc">
            <strong>Documento:</strong> {vbeln}
            {tipo && (
              <>
                {' '}
                · <strong>Tipo:</strong> {tipo}
              </>
            )}
            {entrega?.fecha_creacion && (
              <>
                {' '}
                · <strong>Fecha:</strong> {entrega.fecha_creacion}
              </>
            )}
          </p>

          {cliente?.nombre && (
            <InfoDl
              className="sap-info info-cliente modal-cliente"
              rows={[
                { label: 'Cliente', value: cliente.nombre },
                { label: 'Dirección', value: cliente.direccion },
                { label: 'Ciudad', value: cliente.ciudad },
              ]}
            />
          )}

          {cargando ? (
            <div className="search-loading">Cargando ítems...</div>
          ) : items.length === 0 ? (
            <div className="pendientes-empty">
              <i className="bi bi-inbox" />
              Sin ítems para esta entrega.
            </div>
          ) : (
            <div className="items-table-wrap">
              <table className="items-table">
                <thead>
                  <tr>
                    <th>Pos.</th>
                    <th>Material</th>
                    <th>Descripción</th>
                    <th>Cant.</th>
                    <th>U.M.</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={`${it.posicion}-${it.material}`}>
                      <td>{it.posicion}</td>
                      <td>{it.material}</td>
                      <td>{it.descripcion}</td>
                      <td>{it.cantidad}</td>
                      <td>{it.unidad}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
