export default function WizardNav({
  paso,
  onAnterior,
  onSiguiente,
  onEnviar,
  puedeSiguiente,
  puedeEnviar,
  enviando,
  modo,
}) {
  return (
    <div className="wizard-nav">
      {paso > 1 ? (
        <button
          type="button"
          className="btn btn-ghost wizard-nav-btn wizard-nav-prev"
          onClick={onAnterior}
        >
          <i className="bi bi-arrow-left" /> Anterior
        </button>
      ) : (
        <span />
      )}

      {paso < 3 ? (
        <button
          type="button"
          className="btn btn-pri wizard-nav-btn wizard-nav-next"
          onClick={onSiguiente}
          disabled={!puedeSiguiente}
        >
          Siguiente <i className="bi bi-arrow-right" />
        </button>
      ) : (
        <button
          type="button"
          className={`btn btn-full wizard-nav-btn ${modo === 'ok' ? 'btn-pri' : 'btn-danger'}`}
          disabled={!puedeEnviar || enviando}
          onClick={onEnviar}
        >
          {enviando ? (
            <>
              <i className="bi bi-hourglass-split" /> Guardando...
            </>
          ) : modo === 'ok' ? (
            <>
              <i className="bi bi-check2-all" /> Registrar entrega
            </>
          ) : (
            <>
              <i className="bi bi-exclamation-triangle-fill" /> Registrar novedad
            </>
          )}
        </button>
      )}
    </div>
  );
}
