export default function CampoDesdeSap({
  icon,
  label,
  value,
  onChange,
  sapValue,
  bloqueado,
  onCorregir,
  onRestablecer,
  soloLectura = false,
  hintSap = 'Precargado desde el transporte (SAP).',
}) {
  const vieneDeSap = Boolean(String(sapValue || '').trim());
  const locked = soloLectura || (vieneDeSap && bloqueado);

  let hint = hintSap;
  if (!vieneDeSap) {
    hint = 'No vino en el transporte; ingréselo manualmente.';
  } else if (!locked) {
    hint = `Valor de SAP: ${sapValue}. Puede corregirlo si no coincide.`;
  }

  return (
    <div className="ig">
      <label>
        <i className={`bi ${icon}`} /> {label} <span className="req">*</span>
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={locked}
        disabled={locked}
      />
      <p className="field-hint field-hint-row">
        <span>{hint}</span>
        {vieneDeSap && !soloLectura && (
          locked ? (
            <button type="button" className="btn-link-field" onClick={onCorregir}>
              Corregir
            </button>
          ) : (
            <button type="button" className="btn-link-field" onClick={onRestablecer}>
              Restablecer
            </button>
          )
        )}
      </p>
    </div>
  );
}
