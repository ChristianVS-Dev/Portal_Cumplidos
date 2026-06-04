import { Fragment } from 'react';

/** Convierte cualquier valor de API a texto seguro para React */
export function displayValue(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  if (typeof value === 'object') {
    if (value.nombre != null) return displayValue(value.nombre);
    if (value.descripcion != null) return displayValue(value.descripcion);
    if (value.label != null) return displayValue(value.label);
  }
  return '';
}

/** Lista de definición reutilizable para bloques de consulta SAP */
export default function InfoDl({ title, icon, rows = [], className = 'sap-info' }) {
  const visibles = rows
    .map((r) => ({ label: r.label, value: displayValue(r.value) }))
    .filter((r) => r.value !== '');

  if (!visibles.length) return null;

  return (
    <div className={className}>
      {title && (
        <div className="info-block-title">
          {icon && <i className={`bi ${icon}`} />} {title}
        </div>
      )}
      <dl>
        {visibles.map((r) => (
          <Fragment key={r.label}>
            <dt>{r.label}</dt>
            <dd>{r.value}</dd>
          </Fragment>
        ))}
      </dl>
    </div>
  );
}
