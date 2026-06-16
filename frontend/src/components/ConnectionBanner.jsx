export default function ConnectionBanner({ tipo = 'sin_api', detalle = null }) {
  const labels = {
    sin_api: 'Sin conexión con el API del portal',
    sin_sap: 'SAP no responde en este momento',
    general: 'Sin red en el dispositivo',
  };

  const hints = {
    sin_api:
      'La app móvil no alcanza el API Node (no es la BD). Verifique Docker (api + túnel), la URL en .env.mobile y vuelva a ejecutar npm run mobile:sync.',
    general:
      'Active Wi‑Fi o datos móviles. Sin red no se puede contactar al servidor del portal.',
    sin_sap: 'El API del portal responde, pero SAP no está disponible en este momento.',
  };

  return (
    <div className="conn-banner">
      <div className="conn-banner-inner">
        <i className="bi bi-wifi-off" />
        <div>
          <strong>{labels[tipo] || labels.general}</strong>
          <span>{hints[tipo] || hints.sin_api}</span>
          {detalle ? <span className="conn-banner-detail">{detalle}</span> : null}
        </div>
      </div>
    </div>
  );
}
