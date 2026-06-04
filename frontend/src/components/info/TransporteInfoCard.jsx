import InfoDl from './InfoDl.jsx';

function fmtInicioRuta(t) {
  if (!t?.fechaInicioRuta) return null;
  const h = t.horaInicioRuta ? ` ${t.horaInicioRuta}` : '';
  return `${t.fechaInicioRuta}${h}`;
}

export default function TransporteInfoCard({ transporte, totalEntregas }) {
  if (!transporte?.tknum) return null;

  return (
    <InfoDl
      title="Transporte"
      icon="bi-truck-front-fill"
      className="sap-info info-transporte"
      rows={[
        { label: 'Transporte', value: transporte.tknum },
        { label: 'Ruta', value: transporte.ruta },
        { label: 'Tipo transporte', value: transporte.tipoTransporte },
        { label: 'Clase medio', value: transporte.claseMedioTransporte },
        { label: 'Procesamiento', value: transporte.procesamientoEspecial },
        { label: 'Descripción corte', value: transporte.nombreTransporte },
        { label: 'Conductor', value: transporte.conductor?.nombre },
        { label: 'Documento conductor', value: transporte.conductor?.documento },
        { label: 'Teléfono conductor', value: transporte.conductor?.telefono },
        { label: 'Inicio de ruta', value: fmtInicioRuta(transporte) },
        { label: 'Entregas en ruta', value: totalEntregas > 0 ? String(totalEntregas) : null },
      ]}
    />
  );
}
