import { useEffect, useRef, useState } from 'react';
import {
  ApiError,
  buscarEntrega,
  checkApiHealth,
  crearCumplido,
  actualizarBorrador,
  obtenerDetalleEntrega,
} from '../api/client.js';
import ConnectionBanner from '../components/ConnectionBanner.jsx';
import WizardStepper from '../components/WizardStepper.jsx';
import WizardNav from '../components/WizardNav.jsx';
import EntregasPendientes from '../components/EntregasPendientes.jsx';
import DetalleEntregaModal from '../components/DetalleEntregaModal.jsx';
import Lightbox from '../components/Lightbox.jsx';
import FileDropZone from '../components/FileDropZone.jsx';
import EvidenciaSlot from '../components/EvidenciaSlot.jsx';
import BrandLogo from '../components/BrandLogo.jsx';
import ClienteInfoCard from '../components/info/ClienteInfoCard.jsx';
import TransporteInfoCard from '../components/info/TransporteInfoCard.jsx';
import EntregaDocCard from '../components/info/EntregaDocCard.jsx';
import { displayValue } from '../components/info/InfoDl.jsx';
import { resolveClienteDesdeConsulta } from '../lib/normalizarCliente.js';
import {
  MOTIVOS_NO_CONTESTO,
  motivosNovVacios,
  motivosNovDesdeRegistro,
  payloadMotivosNov,
  tieneMotivoNovSeleccionado,
} from '../constants/motivosNoContesto.js';
import {
  visitasFormVacios,
  aplicarVisitasFormDesdeConsulta,
  payloadVisitasDesdeForm,
  formatearIntentoGuardado,
  AVISO_REGISTRO_PORTAL,
  cuentaVisitasGestion,
  cuentaVisitasEnForm,
} from '../constants/visitasNoContesto.js';
import { fechaParaInput, horaParaInput } from '../utils/fechaHoraEntrega.js';

const EV_SLOTS = [
  { id: 'evL', fileId: 'fL', tipo: 'ev_lugar', label: 'Foto lugar', icon: 'bi-geo-alt-fill' },
  { id: 'evC', fileId: 'fC', tipo: 'ev_captura', label: 'Captura', icon: 'bi-phone-fill', btn: 'Subir captura' },
  { id: 'evA', fileId: 'fA', tipo: 'ev_aviso', label: 'Aviso', icon: 'bi-sticky-fill' },
];

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return {
    fecha: now.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' }),
    hora: now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  };
}

export default function PortalPage() {
  const clock = useClock();
  const [paso, setPaso] = useState(1);
  const [animDir, setAnimDir] = useState('forward');
  const [apiOnline, setApiOnline] = useState(true);
  const [modo, setModo] = useState('ok');
  const [sapData, setSapData] = useState(null);
  const [cliente, setCliente] = useState(null);
  const [syncMsg, setSyncMsg] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [pendienteSelId, setPendienteSelId] = useState(null);
  const [transporte, setTransporte] = useState(null);
  const [entregasLista, setEntregasLista] = useState([]);
  const [totalEntregas, setTotalEntregas] = useState(0);
  const [entregaVbeln, setEntregaVbeln] = useState(null);
  const [tknum, setTknum] = useState(null);
  const [itemsEntrega, setItemsEntrega] = useState([]);
  const [entregaDetalle, setEntregaDetalle] = useState(null);
  const [modalDetalle, setModalDetalle] = useState(false);
  const [modalDetalleVbeln, setModalDetalleVbeln] = useState(null);
  const [modalEntrega, setModalEntrega] = useState(null);
  const [modalItems, setModalItems] = useState([]);
  const [modalCargando, setModalCargando] = useState(false);
  const [seleccionando, setSeleccionando] = useState(false);
  const [form, setForm] = useState({
    num: '', nom: '', pla: '', fec: '', hor: '', obsOk: '', obsNov: '',
  });
  const [motivosNov, setMotivosNov] = useState(motivosNovVacios);
  const [visitasForm, setVisitasForm] = useState(visitasFormVacios());
  const [cumplidoId, setCumplidoId] = useState(null);
  const [gestionVisitas, setGestionVisitas] = useState(null);
  const [soloLectura, setSoloLectura] = useState(false);
  const [filesOk, setFilesOk] = useState([]);
  const [evidencias, setEvidencias] = useState({});
  const [terminos, setTerminos] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [lb, setLb] = useState(null);
  const wizardRef = useRef(null);

  const progPaso = paso === 1 ? 28 : paso === 2 ? 62 : 100;

  const entregaExitosaCerrada = Boolean(gestionVisitas?.entregaExitosaCompletada);
  const maxIntentosNovAlcanzado =
    (gestionVisitas?.visitasRegistradas ?? 0) >= (gestionVisitas?.maxVisitas ?? 3) &&
    gestionVisitas?.puedeRegistrarModoNov === false;
  const modoSeleccionBloqueado = entregaExitosaCerrada;
  const modoNovBloqueado = entregaExitosaCerrada || maxIntentosNovAlcanzado;

  useEffect(() => {
    (async () => {
      const online = await checkApiHealth();
      setApiOnline(online);
    })();
    const today = new Date().toISOString().slice(0, 10);
    setForm((f) => ({ ...f, fec: f.fec || today }));
  }, []);

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const idBorradorActivo = () =>
    cumplidoId ||
    (gestionVisitas?.cumplidoEnBorrador
      ? gestionVisitas.cumplidoId || gestionVisitas.registroId
      : null);

  const persistirDatosEntregaPaso1 = async () => {
    const id = idBorradorActivo();
    if (!id) return;
    await actualizarBorrador(id, {
      transportista: form.nom.trim(),
      placa: form.pla.trim(),
      fechaEntrega: form.fec,
      horaEntrega: horaParaInput(form.hor) || form.hor || null,
      modo,
    });
  };

  const toggleMotivoNov = (key) => {
    setMotivosNov((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const aplicarTransporte = (t) => {
    setTransporte(t);
  };

  const aplicarSap = (sap) => {
    setSapData(sap);
  };

  /** Precarga empresa transportista y placa desde API (misma fuente que se guarda en BD) */
  const aplicarDatosConductorApi = (d, registroDb = null) => {
    const t = d.transporte;
    const sap = d.sap || d.entregaLocal;
    const transportista =
      registroDb?.transportista ||
      t?.transportista?.nombre ||
      sap?.transportistaEmpresa ||
      sap?.transportistaAsignado ||
      '';
    const placa = registroDb?.placa || t?.placa || sap?.placaAsignada || sap?.placaSap || '';
    const fecRaw =
      registroDb?.fechaEntrega ||
      t?.fechaPlanificada ||
      sap?.fechaPlanificada ||
      null;
    const fec = fechaParaInput(fecRaw);
    setForm((f) => ({
      ...f,
      nom: transportista || f.nom,
      pla: placa || f.pla,
      ...(fec ? { fec } : {}),
      // Hora de entrega: solo manual en paso 1 (no precargar desde BD ni transporte)
    }));
  };

  const limpiarConsulta = () => {
    setOk('');
    setSapData(null);
    setCliente(null);
    setTransporte(null);
    setEntregasLista([]);
    setTotalEntregas(0);
    setEntregaVbeln(null);
    setTknum(null);
    setItemsEntrega([]);
    setEntregaDetalle(null);
    setSyncMsg('');
    setPendienteSelId(null);
    setGestionVisitas(null);
    setVisitasForm(visitasFormVacios());
    setCumplidoId(null);
    setSoloLectura(false);
  };

  const aplicarResultadoEntrega = (d, mensaje) => {
    setOk('');
    setFilesOk([]);
    setEvidencias({});
    const vbeln = d.vbeln || d.entrega?.vbeln || d.sap?.numeroEntrega;
    setEntregaVbeln(vbeln);
    setTknum(d.tknum || d.transporte?.tknum);
    setPendienteSelId(vbeln);
    setItemsEntrega(d.items || []);
    setEntregaDetalle(d.entregaVista || d.entrega || null);
    const sap = d.sap || d.entregaLocal;
    setCliente(resolveClienteDesdeConsulta(d, sap));
    if (d.transporte) aplicarTransporte(d.transporte);
    setEntregasLista(d.entregas || []);
    setTotalEntregas(d.totalEntregas || 0);
    aplicarSap(d.sap || d.entregaLocal);
    const itemRuta = (d.entregas || []).find(
      (e) => String(e.vbeln || e.numero) === String(vbeln)
    );
    let gv = d.gestionVisitas || null;
    if (gv && itemRuta?.visitasRegistradas != null) {
      const registradas = Math.max(
        gv.visitasRegistradas ?? 0,
        itemRuta.visitasRegistradas ?? 0
      );
      if (registradas !== gv.visitasRegistradas) {
        gv = { ...gv, visitasRegistradas: registradas };
      }
    }
    setGestionVisitas(gv);
    const rb = d.registroBorrador || null;
    aplicarDatosConductorApi(d, rb);
    setForm((f) => ({
      ...f,
      hor: '',
      ...(rb?.descripcionNovedad ? { obsNov: rb.descripcionNovedad } : {}),
    }));
    if (rb?.motivosNov) setMotivosNov(motivosNovDesdeRegistro(rb));
    else setMotivosNov(motivosNovVacios());
    setVisitasForm(aplicarVisitasFormDesdeConsulta(gv));
    setCumplidoId(
      rb?.cumplidoId ||
        (gv?.cumplidoEnBorrador ? gv.cumplidoId || gv.registroId : null) ||
        null
    );
    if (gv?.entregaExitosaCompletada) {
      setModo('ok');
      setSoloLectura(true);
    } else {
      if (gv?.puedeRegistrarModoNov === false) {
        setModo('ok');
        setMotivosNov(motivosNovVacios());
        setForm((f) => ({ ...f, obsNov: '' }));
      } else {
        const modoBorrador = d.registroBorrador?.modo || gv?.modoBorrador;
        if (modoBorrador === 'ok' || modoBorrador === 'nov') {
          setModo(modoBorrador);
        }
      }
      setSoloLectura(false);
    }
    setSyncMsg(mensaje || '');
  };

  const buscarPorNumero = async (numero) => {
    const n = numero.trim();
    if (n.length < 3) {
      limpiarConsulta();
      return;
    }
    setBuscando(true);
    setErr('');
    setSyncMsg('');
    try {
      const res = await buscarEntrega(n);
      const d = res.data;
      if (d.tipo === 'entrega' && d.encontrado !== false) {
        aplicarResultadoEntrega(d, res.mensaje);
        if (!d.guardadoEnMysql) {
          setSyncMsg(
            `${res.mensaje || ''} · Solo consulta (sin MySQL). Active PERSISTIR_CUMPLIDOS_MYSQL para registrar.`
          );
        }
        setApiOnline(true);
        return;
      }

      aplicarSap(d.sap || d.entregaLocal);
      setTransporte(null);
      setEntregasLista([]);
      setTotalEntregas(0);
      setTknum(null);
      setItemsEntrega([]);
      setEntregaVbeln(d.sap?.numeroEntrega || n);
      setPendienteSelId(d.sap?.numeroEntrega || n);
      aplicarDatosConductorApi(d, null);
      setSyncMsg(res.mensaje || 'Información guardada en MySQL');
      setApiOnline(true);
    } catch (e) {
      limpiarConsulta();
      setErr(e.message);
    } finally {
      setBuscando(false);
    }
  };

  const onNumChange = (value) => {
    setField('num', value);
    if (!value.trim()) limpiarConsulta();
  };

  const handleConsultar = () => {
    buscarPorNumero(form.num);
  };

  const onNumKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConsultar();
    }
  };

  const seleccionarPendiente = async (item) => {
    const vbeln = item.vbeln || item.numero;
    if (!vbeln) return;
    setSeleccionando(true);
    setErr('');
    setField('num', vbeln);
    try {
      const res = await buscarEntrega(vbeln);
      aplicarResultadoEntrega(res.data, res.mensaje || `Entrega ${vbeln} activa`);
      setApiOnline(true);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSeleccionando(false);
    }
  };

  const abrirDetalleEntrega = async (item) => {
    const vbeln = item?.vbeln || item?.numero || entregaVbeln;
    if (!vbeln) return;

    if (String(vbeln) === String(entregaVbeln) && itemsEntrega.length) {
      setModalDetalleVbeln(vbeln);
      setModalEntrega(entregaDetalle);
      setModalItems(itemsEntrega);
      setModalDetalle(true);
      return;
    }

    setModalDetalle(true);
    setModalDetalleVbeln(vbeln);
    setModalCargando(true);
    setModalItems([]);
    setModalEntrega(null);
    try {
      const res = await obtenerDetalleEntrega(vbeln);
      setModalItems(res.data?.items || []);
      setModalEntrega(res.data?.entrega || null);
    } catch (e) {
      setErr(e.message);
      setModalDetalle(false);
    } finally {
      setModalCargando(false);
    }
  };

  const validarPaso1 = () => {
    const miss = [];
    if (!form.num.trim()) miss.push('número de entrega');
    if (!entregaVbeln || (!sapData && !transporte)) {
      miss.push('consultar número de entrega (botón Consultar)');
    } else if (!sapData) {
      miss.push('datos de la entrega (vuelva a consultar)');
    }
    if (!form.nom.trim()) miss.push('transportista');
    if (!form.pla.trim()) miss.push('placa');
    if (!form.fec) miss.push('fecha');
    if (!form.hor?.trim()) miss.push('hora');
    return miss;
  };

  const cumplidoConAdjuntoSeleccionado = () => filesOk.length > 0;

  const tieneAlgunaEvidenciaSeleccionada = () =>
    EV_SLOTS.some((slot) => Boolean(evidencias[slot.tipo]));

  const validarPaso2 = () => {
    const miss = [];
    if (modo === 'ok') {
      if (!cumplidoConAdjuntoSeleccionado()) {
        miss.push('adjuntar al menos un documento del cumplido (PDF o imagen)');
      }
    } else {
      if (!tieneMotivoNovSeleccionado(motivosNov)) {
        miss.push('marcar al menos un motivo de novedad');
      }
      if (!tieneAlgunaEvidenciaSeleccionada()) {
        miss.push('adjuntar al menos una evidencia (foto lugar, captura o aviso)');
      }
      if (!form.obsNov.trim()) miss.push('descripción de novedad');
    }
    return miss;
  };

  const validarPaso3 = () => {
    const miss = [];
    if (!terminos) miss.push('aceptar términos y condiciones');
    return miss;
  };

  const irPaso = (nuevo) => {
    setAnimDir(nuevo > paso ? 'forward' : 'back');
    setPaso(nuevo);
    setErr('');
    setOk('');
    wizardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleSiguiente = async () => {
    if (paso === 1) {
      const miss = validarPaso1();
      if (miss.length) {
        setErr(`Complete el paso 1: ${miss.join(', ')}.`);
        return;
      }
      try {
        await persistirDatosEntregaPaso1();
        if (entregaVbeln) {
          const d = await buscarEntrega(entregaVbeln);
          if (d.gestionVisitas) setGestionVisitas(d.gestionVisitas);
          if (d.registroBorrador?.cumplidoId) setCumplidoId(d.registroBorrador.cumplidoId);
        }
      } catch (e) {
        setErr(e.message || 'No se pudieron guardar los datos de entrega.');
        return;
      }
      irPaso(2);
      return;
    }
    if (paso === 2) {
      const miss = validarPaso2();
      if (miss.length) {
        setErr(`Complete el paso 2: ${miss.join(', ')}.`);
        return;
      }
      irPaso(3);
    }
  };

  const docCount =
    filesOk.length + Object.values(evidencias).filter(Boolean).length;

  const enviar = async () => {
    setErr('');
    setOk('');
    const miss = [...validarPaso1(), ...validarPaso2(), ...validarPaso3()];
    if (miss.length) {
      setErr(`Faltan: ${miss.join(', ')}.`);
      return;
    }

    if (entregaExitosaCerrada) {
      return;
    }
    if (modo === 'nov' && modoNovBloqueado) {
      setErr('Ya se registraron 3 intentos de no contestó. Solo puede registrar entrega exitosa.');
      return;
    }

    setEnviando(true);
    try {
      const numeroEntrega = String(entregaVbeln || form.num).trim();
      const payload = {
        numeroEntrega,
        modo,
        transportista: form.nom.trim(),
        placa: form.pla.trim(),
        fechaEntrega: form.fec,
        horaEntrega: form.hor || null,
        observaciones: modo === 'ok' ? form.obsOk : null,
        ...payloadMotivosNov(motivosNov),
        ...(modo === 'nov' ? payloadVisitasDesdeForm() : {}),
        descripcionNovedad: modo === 'nov' ? form.obsNov : null,
        terminosAceptados: terminos,
      };

      const archivos = [
        ...filesOk.map((file) => ({ file, tipo: 'cumplido' })),
        ...EV_SLOTS.filter((slot) => evidencias[slot.tipo]).map((slot) => ({
          file: evidencias[slot.tipo],
          tipo: slot.tipo,
        })),
      ];

      const res = await crearCumplido(payload, archivos);
      if (res.syncSap || res.advertenciaSap) {
        console.warn('[Portal] Resultado envío adjuntos SAP:', {
          syncSap: res.syncSap,
          advertenciaSap: res.advertenciaSap,
        });
      }
      const now = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
      const vbelnOk = numeroEntrega;

      if (res.advertenciaSap) {
        setErr(res.advertenciaSap);
      } else if (res.syncSap?.estado === 'error') {
        setErr(
          res.syncSap.mensaje ||
            'No se pudo enviar el archivo ZIP a SAP. El registro quedó guardado en el portal.'
        );
      }

      setOk(
        res.mensaje ||
          (modo === 'ok'
            ? `Entrega ${vbelnOk} registrada correctamente · ${now}`
            : `No contestó ${vbelnOk} registrado correctamente · ${now}`)
      );
      setForm({
        num: '',
        nom: '',
        pla: '',
        fec: new Date().toISOString().slice(0, 10),
        hor: '',
        obsOk: '',
        obsNov: '',
      });
      setMotivosNov(motivosNovVacios());
      setVisitasForm(visitasFormVacios());
      setGestionVisitas(null);
      setSoloLectura(false);
      setTerminos(false);
      setFilesOk([]);
      setEvidencias({});
      setSapData(null);
      setCliente(null);
      setTransporte(null);
      setEntregasLista([]);
      setTotalEntregas(0);
      setEntregaVbeln(null);
      setTknum(null);
      setItemsEntrega([]);
      setEntregaDetalle(null);
      setSyncMsg('');
      setPendienteSelId(null);
      setPaso(1);
      setAnimDir('back');
      if (
        !res.advertenciaSap &&
        res.data?.adjuntos?.some((a) => a.estado_sync_sap === 'error')
      ) {
        setErr(
          'El registro se guardó, pero los adjuntos no se sincronizaron con SAP. Revise con soporte.'
        );
      }
    } catch (e) {
      setErr(e.message || 'Error al guardar');
      if (e instanceof ApiError && e.network) setApiOnline(false);
    } finally {
      setEnviando(false);
    }
  };

  const faltantesPaso1 = validarPaso1();
  const faltantesPaso2 = validarPaso2();
  const faltantesPaso3 = validarPaso3();
  const puedeSiguiente =
    !entregaExitosaCerrada &&
    (paso === 1
      ? faltantesPaso1.length === 0
      : paso === 2
        ? faltantesPaso2.length === 0
        : false);

  return (
    <div className="pw">
      {!apiOnline && <ConnectionBanner tipo="sin_api" />}

      <div className="page-top">
        <div>
          <div className="breadcrumb">
            <i className="bi bi-grid-3x3-gap-fill" /> Logística
            <i className="bi bi-chevron-right" /> Transportistas
          </div>
          <div className="page-title">Portal de Cumplidos</div>
          <div className="page-sub">Seguimiento guiado · Conductor</div>
        </div>
      </div>

      <div className="two-col">
        <div className="col-left">
          <div className={`header-card ${!apiOnline ? 'api-offline' : ''}`}>
            <div className="prog-wrap">
              <div className="prog-bar" style={{ width: `${progPaso}%`, transition: 'width .45s ease' }} />
            </div>
            <div className="header-top">
              <div className="logo-row">
                <BrandLogo />
              </div>
              <div className="header-right">
                <div className="clock-box">
                  <div className="clock-date">{clock.fecha}</div>
                  <div className="clock-time">{clock.hora}</div>
                </div>
                <div className="status-row">
                  <div className="sdot" />
                  <span className="slbl">{apiOnline ? 'En línea' : 'Sin conexión'}</span>
                </div>
              </div>
            </div>
            <div className="hero-inner">
              <div className="hero-left">
                <div className="pill">
                  <div className="pill-dot" />
                  <span className="pill-txt">Paso {paso} de 3</span>
                </div>
                <div className="hero-title">
                  Seguimiento de <em>entregas</em>
                </div>
                <div className="hero-sub">Cumplimiento y evidencias · Grupo Decor</div>
              </div>
            </div>
          </div>

          {paso === 1 && (
            <>
              <div className="mode-selector">
                <button
                  type="button"
                  className={`mode-btn ${modo === 'ok' ? 'mode-ok' : ''}`}
                  disabled={modoSeleccionBloqueado}
                  onClick={() => {
                    setModo('ok');
                    setOk('');
                  }}
                >
                  <i className="bi bi-check2-circle" /> Entrega exitosa
                </button>
                <button
                  type="button"
                  className={`mode-btn ${modo === 'nov' ? 'mode-nov' : ''}`}
                  disabled={modoSeleccionBloqueado || modoNovBloqueado}
                  title={
                    modoNovBloqueado && !entregaExitosaCerrada
                      ? 'Ya se registraron 3 intentos de no contestó'
                      : undefined
                  }
                  onClick={() => {
                    setModo('nov');
                    setOk('');
                  }}
                >
                  <i className="bi bi-telephone-x-fill" /> No contestó
                </button>
              </div>
              <div className={`alert-nov ${modo === 'nov' ? 'show' : ''}`}>
                <i className="bi bi-exclamation-triangle-fill" style={{ color: '#e65100' }} />
                <div>
                  <span className="alert-nov-title">Modo no contestó</span>
                  <span className="alert-nov-sub">En el paso 2 adjuntará evidencias.</span>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="col-right wizard-col" ref={wizardRef}>
          <WizardStepper pasoActual={paso} />

          {err && (
            <div className="err-bar show wizard-feedback">
              <i className="bi bi-x-octagon-fill" /> {err}
            </div>
          )}
          {entregaExitosaCerrada && (
            <p className="alert-registro-portal show wizard-feedback" role="alert">
              <i className="bi bi-lock-fill" /> {AVISO_REGISTRO_PORTAL} (entrega exitosa registrada)
            </p>
          )}
          {gestionVisitas?.cumplidoEnBorrador && !entregaExitosaCerrada && (
            <p className="sync-ok mb10 wizard-feedback" role="status">
              <i className="bi bi-pencil-square" /> Cumplido en borrador — puede adjuntar evidencias y
              confirmar (visitas {gestionVisitas.visitasRegistradas ?? 0}/{gestionVisitas.maxVisitas ?? 3}).
            </p>
          )}
          {maxIntentosNovAlcanzado && !entregaExitosaCerrada && (
            <p className="sync-ok mb10 wizard-feedback" role="status">
              <i className="bi bi-info-circle" /> Se registraron los 3 intentos de no contestó. Solo
              puede registrar <strong>Entrega exitosa</strong>.
            </p>
          )}
          {gestionVisitas?.entregaFallidaCompletada &&
            !entregaExitosaCerrada &&
            !maxIntentosNovAlcanzado &&
            !gestionVisitas?.cumplidoEnBorrador && (
              <p className="sync-ok mb10 wizard-feedback" role="status">
                <i className="bi bi-info-circle" /> Hay intentos de no contestó guardados (
                {gestionVisitas.visitasRegistradas ?? 0}/{gestionVisitas.maxVisitas ?? 3}). Puede
                registrar otro intento o <strong>Entrega exitosa</strong>.
              </p>
            )}
          {ok && paso === 1 && (
            <div
              className="ok-bar show wizard-feedback"
              style={
                modo === 'ok'
                  ? { background: '#e8f5e9', border: '1px solid #a5d6a7', color: '#2e7d32' }
                  : { background: '#fff3e0', border: '1px solid #ffe0b2', color: '#e65100' }
              }
            >
              <i
                className={`bi ${modo === 'ok' ? 'bi-check-circle-fill' : 'bi-exclamation-triangle-fill'}`}
              />{' '}
              {ok}
            </div>
          )}

          <div className={`wizard-stage wizard-stage-${animDir}`} key={paso}>
            {paso === 1 && (
              <div className="wizard-panel">
                <div className="section-bar">
                  <i className="bi bi-truck-front-fill" /> Datos de la entrega
                  <span className="step-badge">1 / 3</span>
                </div>
                <div className="section-body">
                  <div className="section-title">
                    <i className="bi bi-card-list" /> Información del cumplido
                  </div>
                  <div className="ig mb10">
                    <label>
                      <i className="bi bi-upc" /> Número de entrega <span className="req">*</span>
                    </label>
                    <div className="numero-entrega-row">
                      <input
                        type="text"
                        placeholder="Ej: 46620280"
                        value={form.num}
                        onChange={(e) => onNumChange(e.target.value)}
                        onKeyDown={onNumKeyDown}
                        disabled={buscando}
                      />
                      <button
                        type="button"
                        className="btn btn-pri btn-consultar"
                        onClick={handleConsultar}
                        disabled={buscando || form.num.trim().length < 3}
                      >
                        {buscando ? (
                          <>
                            <i className="bi bi-hourglass-split" /> Consultando...
                          </>
                        ) : (
                          <>
                            <i className="bi bi-search" /> Consultar
                          </>
                        )}
                      </button>
                    </div>
                    <p className="field-hint">Ingrese el Número de entrega y pulse Consultar (o Enter).</p>
                  </div>

                  {syncMsg && !soloLectura && (
                    <p className="sync-ok mb10">
                      <i className="bi bi-database-check" /> {syncMsg}
                    </p>
                  )}

                  {cliente && entregaVbeln && <ClienteInfoCard cliente={cliente} />}

                  {entregaVbeln && (
                    <EntregaDocCard
                      vbeln={entregaVbeln}
                      entrega={entregaDetalle}
                      itemsCount={itemsEntrega.length}
                      gestionVisitas={gestionVisitas}
                      onVerDetalle={() =>
                        abrirDetalleEntrega({ vbeln: entregaVbeln, numero: entregaVbeln })
                      }
                    />
                  )}

                  {transporte && (
                    <TransporteInfoCard transporte={transporte} totalEntregas={totalEntregas} />
                  )}

                  <div className="g2 mb10">
                    <div className="ig">
                      <label>
                        <i className="bi bi-person-vcard" /> Empresa / transportista{' '}
                        <span className="req">*</span>
                      </label>
                      <input
                        type="text"
                        value={form.nom}
                        onChange={(e) => setField('nom', e.target.value)}
                      />
                      {transporte?.transportista?.nombre && (
                        <p className="field-hint">Precargado desde el transporte (SAP).</p>
                      )}
                    </div>
                    <div className="ig">
                      <label>
                        <i className="bi bi-textarea" /> Placa <span className="req">*</span>
                      </label>
                      <input
                        type="text"
                        value={form.pla}
                        onChange={(e) => setField('pla', e.target.value)}
                      />
                      {transporte?.placa && (
                        <p className="field-hint">Precargada desde el transporte (SAP).</p>
                      )}
                    </div>
                  </div>
                  <div className="g2 mb14">
                    <div className="ig">
                      <label>
                        <i className="bi bi-calendar-event" /> Fecha <span className="req">*</span>
                      </label>
                      <input
                        type="date"
                        value={form.fec}
                        onChange={(e) => setField('fec', e.target.value)}
                      />
                    </div>
                    <div className="ig">
                      <label>
                        <i className="bi bi-alarm" /> Hora <span className="req">*</span>
                      </label>
                      <input
                        type="time"
                        value={form.hor}
                        onChange={(e) => setField('hor', e.target.value)}
                      />
                    </div>
                  </div>

                  {modo === 'nov' &&
                    (gestionVisitas?.visitas || []).some((v) => v.fecha) && (
                      <p className="sync-ok mb10" role="status">
                        <i className="bi bi-geo-alt" /> Intentos guardados en portal:{' '}
                        {(gestionVisitas.visitas || [])
                          .filter((v) => v.fecha)
                          .map((v) => {
                            const txt = formatearIntentoGuardado(v);
                            return txt ? `Visita ${v.numero} (${txt})` : null;
                          })
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    )}

                  <EntregasPendientes
                    entregas={entregasLista}
                    totalEntregas={totalEntregas}
                    seleccionadoId={pendienteSelId}
                    activoVbeln={entregaVbeln}
                    onSeleccionar={seleccionarPendiente}
                    onVerDetalle={abrirDetalleEntrega}
                    cargando={seleccionando}
                  />
                </div>
              </div>
            )}

            {paso === 2 && (
              <div className="wizard-panel">
                {modo === 'ok' ? (
                  <>
                    <div className="section-bar">
                      <i className="bi bi-file-earmark-check-fill" /> Documentos del cumplido{' '}
                      <span className="req">*</span>
                      <span className="step-badge">2 / 3</span>
                    </div>
                    <div className="section-body">
                      <p className="wizard-panel-intro">
                        Adjunte al menos un cumplido firmado, foto o PDF. Se enviarán al confirmar en el
                        paso 3.
                      </p>
                      <FileDropZone
                        files={filesOk}
                        disabled={!entregaVbeln}
                        onChange={setFilesOk}
                        onPreview={setLb}
                      />
                      <div className="ig" style={{ marginTop: 12 }}>
                        <label>
                          <i className="bi bi-chat-square-text" /> Observaciones
                        </label>
                        <textarea
                          rows={2}
                          placeholder="Opcional..."
                          value={form.obsOk}
                          onChange={(e) => setField('obsOk', e.target.value)}
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="section-bar">
                      <i className="bi bi-camera-video-fill" /> Evidencias de no contestó{' '}
                      <span className="req">*</span>
                      <span className="step-badge">2 / 3</span>
                    </div>
                    <div className="section-body">
                      <p className="wizard-panel-intro">
                        Marque los motivos de la novedad, adjunte al menos una evidencia y complete la
                        descripción. Los intentos de visita se cargan al consultar la entrega (paso 1).
                      </p>
                      <p className="ig-label-block">
                        <i className="bi bi-exclamation-circle" /> Motivos de novedad{' '}
                        <span className="req">*</span>
                        <span className="wizard-panel-hint-sm" style={{ display: 'block', marginTop: 4 }}>
                          Marque al menos una opción
                        </span>
                      </p>
                      {MOTIVOS_NO_CONTESTO.map((m, idx) => (
                        <div
                          key={m.key}
                          className={`check-item ${motivosNov[m.key] ? 'checked' : ''} ${idx === MOTIVOS_NO_CONTESTO.length - 1 ? 'mb10' : ''}`}
                          onClick={() => toggleMotivoNov(m.key)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              toggleMotivoNov(m.key);
                            }
                          }}
                          role="checkbox"
                          aria-checked={motivosNov[m.key]}
                          tabIndex={0}
                        >
                          <div className="check-box">
                            {motivosNov[m.key] && <i className="bi bi-check" />}
                          </div>
                          <span className="check-lbl">
                            <i className={`bi ${m.icon}`} style={{ marginRight: 6 }} />
                            {m.label}
                          </span>
                        </div>
                      ))}
                      <div className="ev-grid">
                        {EV_SLOTS.map((slot) => (
                          <EvidenciaSlot
                            key={slot.tipo}
                            slot={slot}
                            file={evidencias[slot.tipo]}
                            disabled={!entregaVbeln}
                            onFile={(file) => {
                              setEvidencias((ev) => ({
                                ...ev,
                                [slot.tipo]: file || undefined,
                              }));
                            }}
                            onPreview={setLb}
                          />
                        ))}
                      </div>
                      <div className="ig">
                        <label>
                          <i className="bi bi-pencil-square" /> Descripción <span className="req">*</span>
                        </label>
                        <textarea
                          rows={3}
                          value={form.obsNov}
                          onChange={(e) => setField('obsNov', e.target.value)}
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {paso === 3 && (
              <div className="wizard-panel">
                <div className="section-bar">
                  <i className="bi bi-send-fill" /> Confirmación y envío
                  <span className="step-badge">3 / 3</span>
                </div>
                <div className="section-body">
                  <div className="resumen-envio">
                    <div className="resumen-row">
                      <span>Cliente</span>
                      <strong>{cliente?.nombre || displayValue(sapData?.cliente) || '—'}</strong>
                    </div>
                    <div className="resumen-row">
                      <span>Documento entrega</span>
                      <strong>{entregaVbeln || sapData?.numeroEntrega || '—'}</strong>
                    </div>
                    <div className="resumen-row">
                      <span>Transporte</span>
                      <strong>{tknum || transporte?.tknum || '—'}</strong>
                    </div>
                    <div className="resumen-row">
                      <span>Ruta</span>
                      <strong>{transporte?.ruta || sapData?.ruta || '—'}</strong>
                    </div>
                    <div className="resumen-row">
                      <span>Empresa / transportista</span>
                      <strong>{form.nom || '—'}</strong>
                    </div>
                    <div className="resumen-row">
                      <span>Conductor</span>
                      <strong>{transporte?.conductor?.nombre || '—'}</strong>
                    </div>
                    <div className="resumen-row">
                      <span>Placa</span>
                      <strong>{form.pla || '—'}</strong>
                    </div>
                    <div className="resumen-row">
                      <span>Fecha / hora</span>
                      <strong>
                        {form.fec || '—'} {form.hor ? `· ${form.hor}` : ''}
                      </strong>
                    </div>
                    <div className="resumen-row">
                      <span>Tipo</span>
                      <strong>{modo === 'ok' ? 'Entrega exitosa' : 'No contestó'}</strong>
                    </div>
                    <div className="resumen-row">
                      <span>Adjuntos</span>
                      <strong>{docCount} archivo(s)</strong>
                    </div>
                    {modo === 'nov' && (
                      <>
                        <div className="resumen-row">
                          <span>Intentos registrados</span>
                          <strong>
                            {cuentaVisitasGestion(gestionVisitas)}/{gestionVisitas?.maxVisitas ?? 3}
                          </strong>
                        </div>
                        {(gestionVisitas?.visitas || [])
                          .filter((v) => v.fecha)
                          .map((v) => (
                            <div className="resumen-row" key={v.numero}>
                              <span>Intento {v.numero}</span>
                              <strong>{formatearIntentoGuardado(v) || '—'}</strong>
                            </div>
                          ))}
                      </>
                    )}
                  </div>

                  <div className="tog-row">
                    <div className="tog">
                      <span
                        className="t-track"
                        style={{ background: terminos ? '#455a64' : '#cfd8dc' }}
                        onClick={() => setTerminos(!terminos)}
                        role="button"
                        tabIndex={0}
                      />
                      <span className="t-thumb" style={{ left: terminos ? '19px' : '3px' }} />
                    </div>
                    <span className="tog-lbl">
                      Acepto los términos y condiciones del portal <span className="req">*</span>
                    </span>
                  </div>

                  <p className="wizard-panel-intro">
                    Revise el resumen, acepte los términos y pulse{' '}
                    <strong>{modo === 'ok' ? 'Registrar entrega' : 'Registrar novedad'}</strong> para
                    guardar en el sistema.
                  </p>
                </div>
              </div>
            )}
          </div>

          <WizardNav
            paso={paso}
            modo={modo}
            onAnterior={() => irPaso(paso - 1)}
            onSiguiente={handleSiguiente}
            onEnviar={enviar}
            puedeSiguiente={puedeSiguiente}
            puedeEnviar={
              !entregaExitosaCerrada &&
              validarPaso1().length === 0 &&
              validarPaso2().length === 0 &&
              validarPaso3().length === 0
            }
            enviando={enviando}
          />

          {paso === 1 && !puedeSiguiente && faltantesPaso1.length > 0 && (
            <p className="wizard-hint" role="status">
              <i className="bi bi-info-circle" /> Para continuar complete: {faltantesPaso1.join(', ')}.
            </p>
          )}
          {paso === 2 && !puedeSiguiente && faltantesPaso2.length > 0 && (
            <p className="wizard-hint" role="status">
              <i className="bi bi-info-circle" /> Para continuar complete: {faltantesPaso2.join(', ')}.
            </p>
          )}
          {paso === 3 &&
            (faltantesPaso2.length > 0 || faltantesPaso3.length > 0) && (
              <p className="wizard-hint" role="status">
                <i className="bi bi-info-circle" /> Para registrar:{' '}
                {[...faltantesPaso2, ...faltantesPaso3].join(', ')}.
              </p>
            )}
          {paso >= 2 && !entregaVbeln && (
            <p className="wizard-hint wizard-hint-warn" role="status">
              <i className="bi bi-info-circle" /> Consulte primero el número de entrega en el paso 1.
            </p>
          )}

          <div className="footer-note">
            <i className="bi bi-shield-lock-fill" /> Datos protegidos · Grupo Decor © 2025
          </div>
        </div>
      </div>

      {lb && <Lightbox src={lb.src} name={lb.name} onClose={() => setLb(null)} />}

      <DetalleEntregaModal
        abierto={modalDetalle}
        onCerrar={() => setModalDetalle(false)}
        vbeln={modalDetalleVbeln}
        entrega={modalEntrega}
        items={modalItems}
        cargando={modalCargando}
      />
    </div>
  );
}
