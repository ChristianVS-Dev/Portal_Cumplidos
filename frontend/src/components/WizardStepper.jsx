const STEPS = [
  { n: 1, label: 'Datos de entrega', icon: 'bi-truck-front-fill' },
  { n: 2, label: 'Adjuntos', icon: 'bi-paperclip' },
  { n: 3, label: 'Confirmación', icon: 'bi-send-fill' },
];

export default function WizardStepper({ pasoActual }) {
  return (
    <nav className="wizard-stepper" aria-label="Pasos del seguimiento">
      {STEPS.map((s, i) => {
        const done = pasoActual > s.n;
        const active = pasoActual === s.n;
        return (
          <div key={s.n} className={`wizard-step ${active ? 'active' : ''} ${done ? 'done' : ''}`}>
            <div className="wizard-step-line-wrap">
              {i > 0 && <div className={`wizard-step-line ${done || active ? 'filled' : ''}`} />}
              <div className="wizard-step-dot">
                {done ? <i className="bi bi-check-lg" /> : s.n}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`wizard-step-line ${done ? 'filled' : ''}`} />
              )}
            </div>
            <span className="wizard-step-lbl">
              <i className={`bi ${s.icon}`} /> {s.label}
            </span>
          </div>
        );
      })}
    </nav>
  );
}
