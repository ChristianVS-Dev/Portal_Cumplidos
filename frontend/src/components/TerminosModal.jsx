import { TERMINOS_PARRAFOS, TERMINOS_TITULO } from '../constants/terminos.js';

export default function TerminosModal({
  abierto,
  modo = 'obligatorio',
  onAceptar,
  onCerrar,
}) {
  if (!abierto) return null;

  const consulta = modo === 'consulta';

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onClick={consulta ? onCerrar : undefined}
    >
      <div
        className="modal-card modal-card-terminos"
        role="dialog"
        aria-modal="true"
        aria-labelledby="terminos-titulo"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="section-bar">
          <i className="bi bi-shield-check" /> {TERMINOS_TITULO}
          {consulta && (
            <button
              type="button"
              className="modal-close-btn"
              onClick={onCerrar}
              aria-label="Cerrar"
            >
              <i className="bi bi-x-lg" />
            </button>
          )}
        </div>
        <div className="section-body">
          <p className="modal-desc">
            {consulta
              ? 'Estos son los términos vigentes del portal. Ya los aceptó en este dispositivo.'
              : 'Debe aceptarlos una vez en este dispositivo para registrar cumplidos. No se pedirán de nuevo en cada entrega.'}
          </p>
          <div className="terminos-texto">
            {TERMINOS_PARRAFOS.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          <div className="modal-actions">
            {consulta ? (
              <button type="button" className="btn btn-pri btn-full" onClick={onCerrar}>
                Cerrar
              </button>
            ) : (
              <button type="button" className="btn btn-pri btn-full" onClick={onAceptar}>
                Aceptar y continuar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
