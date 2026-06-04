export default function ConnectionBanner({ tipo = 'sin_api' }) {
  const labels = {
    sin_api: 'Sin conexión con el servidor',
    sin_sap: 'SAP no responde en este momento',
    general: 'Problema de conectividad detectado',
  };

  return (
    <div className="conn-banner">
      <div className="conn-banner-inner">
        <i className="bi bi-wifi-off" />
        <div>
          <strong>{labels[tipo] || labels.general}</strong>
          <span>
            Verifique su red e intente de nuevo. Los datos del formulario no se enviarán hasta
            restablecer la conexión.
          </span>
        </div>
      </div>
    </div>
  );
}
