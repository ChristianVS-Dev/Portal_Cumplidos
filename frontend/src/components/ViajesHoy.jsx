import EntregasPendientes from './EntregasPendientes.jsx';

const HINT = (
  <>
    Seleccione una para dar seguimiento al cumplido o use <strong>Ver detalle</strong> para ver los
    materiales.
  </>
);

function fechaVisible(valor) {
  const iso = String(valor || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  return valor || '';
}

function aTarjeta(viaje, portal = []) {
  const vbeln = String(viaje.numeroEntrega || viaje.vbeln || viaje.numero || '');
  const conocida = portal.find((item) => String(item.vbeln || item.numero || item.id) === vbeln);
  const entregada = /entregad/i.test(String(viaje.estado || conocida?.estado || ''));
  const intento = Number(viaje.intento || 0);
  const totalAdjuntos = Number(viaje.totalAdjuntos ?? conocida?.totalAdjuntos ?? 0);
  const base = conocida
    ? { ...conocida, id: conocida.id || vbeln, vbeln }
    : {
        id: vbeln,
        vbeln,
        numero: vbeln,
        cliente: viaje.cliente || '',
        direccion: viaje.direccion || '',
        ciudad: viaje.ciudad || '',
        ruta: viaje.estado || 'PENDIENTE',
        estado: viaje.estado || 'PENDIENTE',
        fechaCreacion: fechaVisible(viaje.fecha),
      };
  return {
    ...base,
    estado: viaje.estado || base.estado,
    estadoProceso: entregada ? 'cumplida' : intento > 0 ? 'en_proceso' : 'sin_iniciar',
    totalAdjuntos,
    visitasRegistradas: intento,
    visitasMax: 3,
  };
}

export default function ViajesHoy({
  acceso,
  entregasPortal = [],
  seleccionadoId,
  activoVbeln,
  onSeleccionar,
  onVerDetalle,
  onSincronizar,
  sincronizando = false,
  consultandoVbeln = null,
}) {
  if (!acceso) return null;
  const hoy = (acceso.entregasHoy || acceso.viajes || []).map((viaje) => aTarjeta(viaje, entregasPortal));
  const pendientes = (acceso.entregasPendientes || [])
    .filter((viaje) => !hoy.some((item) => item.vbeln === String(viaje.numeroEntrega)))
    .map((viaje) => aTarjeta(viaje, entregasPortal));
  const nPendientes = pendientes.filter((item) => /pendiente/i.test(item.estado)).length;
  const nProgramadas = pendientes.filter((item) => /programad/i.test(item.estado)).length;
  const textoPendientes = [
    nPendientes ? `${nPendientes} pendientes` : '',
    nProgramadas ? `${nProgramadas} programadas` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const sap = acceso.sap;

  return (
    <div className="viajes-hoy mb14">
      <div className="agenda-head">
        <p className="field-hint">
          {acceso.conductor?.nombre || 'Conductor'} · placa {acceso.conductor?.placa}
          {sap?.mensaje ? ` · ${sap.mensaje}` : ''}
        </p>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onSincronizar} disabled={sincronizando}>
          <i className="bi bi-arrow-repeat" /> {sincronizando ? 'Sincronizando...' : 'Sincronizar'}
        </button>
      </div>

      <EntregasPendientes
        titulo="Entregas de hoy"
        icono="bi-signpost-split"
        hint={HINT}
        vacio="No hay entregas de hoy para esta placa."
        entregas={hoy}
        seleccionadoId={seleccionadoId}
        activoVbeln={activoVbeln}
        onSeleccionar={onSeleccionar}
        onVerDetalle={onVerDetalle}
        consultandoVbeln={consultandoVbeln}
        separado={false}
        controles
        className="agenda-panel"
        textoBadge={hoy.length ? `${hoy.length} de hoy` : ''}
      />
      <EntregasPendientes
        titulo="Entregas pendientes"
        hint={HINT}
        vacio="No hay entregas pendientes para esta cédula y placa."
        className="agenda-panel agenda-siguiente"
        entregas={pendientes}
        seleccionadoId={seleccionadoId}
        activoVbeln={activoVbeln}
        onSeleccionar={onSeleccionar}
        onVerDetalle={onVerDetalle}
        consultandoVbeln={consultandoVbeln}
        separado={false}
        controles
        textoBadge={textoPendientes}
      />
    </div>
  );
}
