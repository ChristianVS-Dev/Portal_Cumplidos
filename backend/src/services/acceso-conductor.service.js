import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { getSupabase } from '../db/supabase.js';
import { query } from '../db/pool.js';
import { config } from '../config/index.js';
import { enviarConfirmacionCuenta, enviarEnlaceRestablecimiento } from './email.service.js';
import { consultarAgendaConductor } from './agenda-conductor.service.js';
import { consultarEntrega } from './entregas-externa.service.js';
import { abrirSincronizacion, registrarEventos } from './trazabilidad.service.js';
import { listarEntregasEmpresa } from './empresa-entregas.service.js';
import {
  fechaHoyBogota,
  normalizarCedula,
  normalizarCodigoTransportista,
  normalizarEmail,
  normalizarPlaca,
  pertenenciaEntrega,
  validarContrasena,
} from '../domain/conductor-acceso.js';

const SESION_MS = 16 * 60 * 60 * 1000;
const REENVIO_MS = 3 * 60 * 1000;
const MENSAJE_ACCESO = 'Documento, placa o contraseña incorrectos';
const MENSAJE_ENLACE = 'El enlace no es válido o ya venció';
const DUMMY_HASH = bcrypt.hashSync('portal-cumplidos-comparacion', 12);

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

const MARCA_EMPRESA = 'EMP:';
const PREFIJO_CONFIRMACION = 'c1.';
const COLUMNAS_OPCIONALES = ['email_confirmado', 'confirm_token_hash', 'confirm_expira_en'];

function esCuentaEmpresa(conductor) {
  return String(conductor?.telefono || '').startsWith(MARCA_EMPRESA);
}

function nitDeEmpresa(conductor) {
  return String(conductor?.telefono || '').slice(MARCA_EMPRESA.length).replace(/:PEND$/, '');
}

function marcaEmpresa(nit, pendiente = true) {
  const base = `${MARCA_EMPRESA}${String(nit || '').replace(/\D/g, '').slice(0, 20)}`;
  return pendiente ? `${base}:PEND` : base;
}

function confirmacionPendiente(conductor) {
  if (!conductor) return false;
  if (conductor.email_confirmado === false) return true;
  if (String(conductor.reset_token_hash || '').startsWith(PREFIJO_CONFIRMACION)) return true;
  return String(conductor.telefono || '').endsWith(':PEND');
}

function columnaAusente(error) {
  const texto = `${error?.message || ''} ${error?.details || ''}`;
  return COLUMNAS_OPCIONALES.find((columna) => texto.includes(`'${columna}'`) || texto.includes(columna)) || '';
}

function faltaColumna(error) {
  return Boolean(columnaAusente(error));
}

async function leerConductor(sb, columnas, filtro) {
  let pedidas = columnas;
  for (let intento = 0; intento < 6; intento += 1) {
    let consulta = sb.from('pc_conductor').select(pedidas);
    for (const [clave, valor] of Object.entries(filtro)) consulta = consulta.eq(clave, valor);
    const { data, error } = await consulta.maybeSingle();
    if (!error) return data;
    const ausente = columnaAusente(error);
    if (!ausente || !pedidas.split(',').some((parte) => parte.trim() === ausente)) throw error;
    pedidas = pedidas.split(',').map((parte) => parte.trim()).filter((parte) => parte !== ausente).join(', ');
  }
  throw new Error('No se pudo leer la cuenta');
}

function tokenTemporal(minutos) {
  const token = crypto.randomBytes(32).toString('base64url');
  const plazo = Number(minutos) || 60;
  return {
    token,
    minutos: plazo,
    expira: new Date(Date.now() + plazo * 60 * 1000).toISOString(),
    hash: hashToken(token),
  };
}

function errorDb(error) {
  if (error?.code === '23505') {
    const texto = `${error.message || ''} ${error.details || ''}`;
    let message = 'Esa cédula, placa o correo ya está registrado.';
    if (/email/i.test(texto)) message = 'Ese correo ya está registrado en otra cuenta. Use otro correo.';
    else if (/placa/i.test(texto)) message = 'Esa placa ya está registrada en otra cuenta.';
    else if (/cedula/i.test(texto)) {
      message = 'Ya existe una cuenta con ese documento. Inicie sesión o recupere la contraseña.';
    }
    return Object.assign(new Error(message), { status: 409 });
  }
  return Object.assign(new Error('No se pudo guardar el acceso del conductor'), { status: 500 });
}

function perfil(conductor, placa) {
  const empresa = esCuentaEmpresa(conductor);
  return {
    tipo: empresa ? 'empresa' : 'conductor',
    nombre: conductor.nombre || null,
    empresa: conductor.empresa || null,
    nit: empresa ? nitDeEmpresa(conductor) : null,
    transportistaCodigo: empresa ? conductor.cedula : null,
    placa: empresa ? null : placa,
  };
}

function filaViaje(row) {
  return {
    numeroEntrega: row.numero_entrega,
    tknum: row.tknum || null,
    cliente: row.cliente || null,
    direccion: row.direccion || null,
    ciudad: row.ciudad || null,
    estado: row.estado || null,
    orden: row.orden ?? null,
    intento: row.intento ?? null,
    fuente: row.fuente,
  };
}

function fechaHaceDias(fechaIso, dias) {
  const [anio, mes, dia] = fechaIso.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  fecha.setUTCDate(fecha.getUTCDate() - dias);
  return fecha.toISOString().slice(0, 10);
}

async function leerAgendaGuardada(conductorId, placa, fechaHoy) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('pc_viaje_dia')
    .select('numero_entrega, tknum, cliente, direccion, ciudad, estado, orden, intento, fuente, fecha')
    .eq('conductor_id', conductorId)
    .eq('placa', placa)
    .neq('pertenencia', 'ajena')
    .gte('fecha', fechaHaceDias(fechaHoy, 40))
    .order('fecha', { ascending: true })
    .order('orden', { ascending: true, nullsFirst: false });
  if (error) throw errorDb(error);
  const viajes = (data || []).map((row) => ({ ...filaViaje(row), fecha: row.fecha }));
  return {
    entregasHoy: viajes.filter((viaje) => viaje.fecha === fechaHoy),
    entregasPendientes: viajes.filter((viaje) => esPendiente(viaje.estado)),
  };
}

async function copiarViajesDesdeMysql(conductor, placa, fecha) {
  if (!config.mysql.enabled) return 0;
  const rows = await query(
    `SELECT numero_entrega, tknum, cliente, direccion, ciudad, estado_logistico,
            conductor_nombre, empresa_transportista, placa_sap, placa_asignada, conductor_documento
     FROM pc_entrega_sap
     WHERE fecha_planificada = :fecha OR fecha_documento = :fecha
     ORDER BY numero_entrega`,
    { fecha }
  );
  const propios = rows.filter((row) => {
    const cedula = normalizarCedula(row.conductor_documento);
    const placaRow = normalizarPlaca(row.placa_sap || row.placa_asignada);
    return cedula === conductor.cedula && placaRow === placa;
  });
  if (!propios.length) return 0;

  const sb = getSupabase();
  if (!conductor.nombre && propios[0].conductor_nombre) {
    await sb
      .from('pc_conductor')
      .update({
        nombre: propios[0].conductor_nombre,
        empresa: propios[0].empresa_transportista || conductor.empresa,
      })
      .eq('id', conductor.id);
    conductor.nombre = propios[0].conductor_nombre;
    conductor.empresa = propios[0].empresa_transportista || conductor.empresa;
  }

  const ahora = new Date().toISOString();
  const payload = propios.map((row, index) => ({
    conductor_id: conductor.id,
    placa,
    fecha,
    numero_entrega: String(row.numero_entrega),
    tknum: row.tknum || null,
    cliente: row.cliente || null,
    direccion: row.direccion || null,
    ciudad: row.ciudad || null,
    estado: row.estado_logistico || null,
    orden: index + 1,
    fuente: 'cache',
    sincronizado_en: ahora,
  }));
  const { error } = await sb.from('pc_viaje_dia').upsert(payload, {
    onConflict: 'conductor_id,fecha,numero_entrega',
  });
  if (error) throw errorDb(error);
  return payload.length;
}

const CERRADA = /exitos|cumplid|entregad|cerrad|anulad/i;
const ABIERTA = /pendiente|abiert|sin iniciar|programad|en ruta/i;

function esPendiente(estado) {
  if (!estado || CERRADA.test(estado)) return false;
  return ABIERTA.test(estado);
}

async function aplicarConteoAdjuntos(conductorId, agenda) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('pc_adjunto_entrega')
    .select('numero_entrega')
    .eq('conductor_id', conductorId)
    .eq('vigente', true)
    .eq('estado_sync', 'ok');
  if (error) throw errorDb(error);
  const conteo = new Map();
  for (const row of data || []) {
    const numero = String(row.numero_entrega);
    conteo.set(numero, (conteo.get(numero) || 0) + 1);
  }
  const marcar = (viajes) =>
    viajes.map((viaje) => ({
      ...viaje,
      totalAdjuntos: conteo.get(String(viaje.numeroEntrega)) || 0,
    }));
  return {
    entregasHoy: marcar(agenda.entregasHoy),
    entregasPendientes: marcar(agenda.entregasPendientes),
  };
}

async function guardarAgenda(conductorId, placa, entregas, extra = {}) {
  const filas = entregas.filter((row) => row.numeroEntrega && row.fecha);
  if (!filas.length) return 0;
  const sb = getSupabase();
  const ahora = new Date().toISOString();
  await registrarCambiosAgenda(conductorId, placa, filas, extra);
  const payload = filas.map((row, index) => {
    const fila = {
      conductor_id: conductorId,
      placa,
      fecha: row.fecha,
      numero_entrega: row.numeroEntrega,
      tknum: row.tknum,
      cliente: row.cliente,
      direccion: row.direccion,
      ciudad: row.ciudad,
      estado: row.estado,
      orden: index + 1,
      intento: row.intento ?? null,
      fuente: 'sap',
      sincronizado_en: ahora,
    };
    if (row.pertenencia) {
      fila.pertenencia = row.pertenencia;
      fila.motivo = row.motivo ?? null;
    }
    if (extra.sincronizacionId) fila.sincronizacion_id = extra.sincronizacionId;
    return fila;
  });
  const { error } = await sb.from('pc_viaje_dia').upsert(payload, {
    onConflict: 'conductor_id,fecha,numero_entrega',
  });
  if (error) throw errorDb(error);
  return payload.length;
}

async function registrarCambiosAgenda(conductorId, placa, filas, extra) {
  const numeros = [...new Set(filas.map((row) => row.numeroEntrega))];
  const sb = getSupabase();
  const { data, error } = await sb
    .from('pc_viaje_dia')
    .select('fecha, numero_entrega, estado, intento')
    .eq('conductor_id', conductorId)
    .eq('placa', placa)
    .in('numero_entrega', numeros);
  if (error) {
    console.error('[trazabilidad] estado previo:', error.message);
    return;
  }
  const previas = new Map((data || []).map((row) => [`${row.fecha}|${row.numero_entrega}`, row]));
  const cambios = [];
  for (const row of filas) {
    const previa = previas.get(`${row.fecha}|${row.numeroEntrega}`);
    if (!previa) continue;
    const estadoNuevo = row.estado ?? null;
    const intentoNuevo = row.intento ?? null;
    const cambioEstado = (previa.estado ?? null) !== estadoNuevo;
    const cambioIntento = (previa.intento ?? null) !== intentoNuevo;
    if (!cambioEstado && !cambioIntento) continue;
    cambios.push({
      conductorId,
      sesionId: extra.sesionId,
      sincronizacionId: extra.sincronizacionId,
      accion: 'actualizar_entrega',
      numeroEntrega: row.numeroEntrega,
      resultado: 'ok',
      detalle: {
        estadoAnterior: previa.estado ?? null,
        estadoNuevo,
        intentoAnterior: previa.intento ?? null,
        intentoNuevo,
      },
    });
  }
  await registrarEventos(cambios);
}

async function actualizarNombreConductor(conductor, nombre) {
  const limpio = nombre?.trim();
  if (!limpio || limpio === conductor.nombre) return;
  const sb = getSupabase();
  const { error } = await sb.from('pc_conductor').update({ nombre: limpio }).eq('id', conductor.id);
  if (error) throw errorDb(error);
  conductor.nombre = limpio;
}

function listasDeAgenda(entregas) {
  const visibles = (entregas || []).filter((row) => row.pertenencia !== 'ajena');
  const hoy = visibles.filter((row) => row.grupo === 'hoy');
  const ya = new Set(hoy.map((row) => row.numeroEntrega));
  const pendientes = visibles.filter(
    (row) => row.estado === 'Pendiente' && row.grupo !== 'hoy' && !ya.has(row.numeroEntrega)
  );
  for (const row of pendientes) ya.add(row.numeroEntrega);
  const programadas = visibles.filter(
    (row) =>
      (row.grupo === 'programada' || row.estado === 'Programada') && !ya.has(row.numeroEntrega)
  );
  return { entregasHoy: hoy, entregasPendientes: [...pendientes, ...programadas], pendientes, programadas };
}

function mensajeAgendaVisible({ hoy, pendientes, programadas, ocultadas, retiradas }) {
  const partes = [`${hoy} de hoy`, `${pendientes} pendientes`];
  if (programadas > 0) partes.push(`${programadas} programadas`);
  const frases = [`Transporte sincronizado: ${partes.join(', ')}.`];
  if (ocultadas > 0) {
    frases.push(`Se ocultaron ${ocultadas} que ya no corresponden a esta cédula y placa.`);
  }
  if (retiradas > 0) {
    frases.push(`Se quitaron ${retiradas} que ya no vienen en su transporte.`);
  }
  if (hoy + pendientes + programadas === 0) {
    frases[0] = 'Su transporte no tiene entregas de hoy ni pendientes.';
  }
  return frases.join(' ');
}

async function contarFueraDeAgenda(conductorId, placa, fechaHoy, numerosAgenda) {
  const guardada = await leerAgendaGuardada(conductorId, placa, fechaHoy);
  const fuera = new Set();
  for (const row of guardada.entregasPendientes) {
    if (!numerosAgenda.has(row.numeroEntrega)) fuera.add(row.numeroEntrega);
  }
  return fuera.size;
}

async function clasificarEntrega(acceso, numero) {
  try {
    const doc = await consultarEntrega(numero, { fresco: true });
    if (!doc?.transporte) return 'desconocida';
    return pertenenciaEntrega(acceso, doc.transporte);
  } catch (error) {
    console.error('Pertenencia entrega:', numero, error.status || '', error.message || error);
    return 'desconocida';
  }
}

async function clasificarAgenda(acceso, entregas) {
  const numeros = [...new Set(entregas.map((row) => row.numeroEntrega).filter(Boolean))];
  const pendientes = [...numeros];
  const clases = new Map();
  const trabajadores = Array.from({ length: Math.min(6, pendientes.length) }, async () => {
    while (pendientes.length) {
      const numero = pendientes.shift();
      clases.set(numero, await clasificarEntrega(acceso, numero));
    }
  });
  await Promise.all(trabajadores);
  return clases;
}

async function entregasAjenasPrevias(conductorId, placa, numeros) {
  if (!numeros.length) return new Set();
  const sb = getSupabase();
  const { data, error } = await sb
    .from('pc_viaje_dia')
    .select('numero_entrega, pertenencia')
    .eq('conductor_id', conductorId)
    .eq('placa', placa)
    .in('numero_entrega', numeros);
  if (error) {
    console.error('[trazabilidad] pertenencia previa:', error.message);
    return new Set();
  }
  const ajenas = new Set();
  for (const row of data || []) {
    if (row.pertenencia === 'ajena') ajenas.add(row.numero_entrega);
  }
  return ajenas;
}

export async function cargarViajesHoy(conductor, placa, opciones = {}) {
  const fecha = fechaHoyBogota();
  let listasFrescas = null;
  let sap = {
    disponible: false,
    configurada: true,
    mensaje: 'No se pudo sincronizar el transporte. Se muestran las entregas guardadas.',
  };
  try {
    const agenda = await consultarAgendaConductor({
      cedula: conductor.cedula,
      placa,
    });
    if (!agenda.configurada) {
      const copiados = await copiarViajesDesdeMysql(conductor, placa, fecha);
      sap = {
        disponible: copiados > 0,
        configurada: false,
        mensaje:
          copiados > 0
            ? 'Se muestran entregas ya guardadas.'
            : 'No está configurado el API de entregas del conductor.',
      };
    } else {
      if (agenda.conductor?.nombre) await actualizarNombreConductor(conductor, agenda.conductor.nombre);
      let ocultadas = 0;
      let propias = 0;
      let revisadas = 0;
      let paraGuardar = agenda.entregas;
      let sincronizacionId = null;
      let previas = new Set();
      if (opciones.depurar) {
        const acceso = { cedula: conductor.cedula, placa };
        const clases = await clasificarAgenda(acceso, agenda.entregas);
        revisadas = clases.size;
        previas = await entregasAjenasPrevias(conductor.id, placa, [...clases.keys()]);
        paraGuardar = agenda.entregas.map((row) => {
          const clase = clases.get(row.numeroEntrega);
          if (clase === 'ajena') {
            ocultadas += 1;
            return {
              ...row,
              pertenencia: 'ajena',
              motivo: 'El documento ya no corresponde a esta cédula y placa',
            };
          }
          if (clase === 'propia') {
            propias += 1;
            return { ...row, pertenencia: 'propia', motivo: null };
          }
          return row;
        });
        agenda.entregas = paraGuardar.filter((row) => row.pertenencia !== 'ajena');
      }
      const listas = listasDeAgenda(agenda.entregas);
      const retiradas = await contarFueraDeAgenda(
        conductor.id,
        placa,
        fecha,
        new Set(paraGuardar.map((row) => row.numeroEntrega))
      );
      const mensaje = mensajeAgendaVisible({
        hoy: listas.entregasHoy.length,
        pendientes: listas.pendientes.length,
        programadas: listas.programadas.length,
        ocultadas,
        retiradas,
      });
      if (opciones.depurar) {
        sincronizacionId = await abrirSincronizacion({
          conductorId: conductor.id,
          placa,
          revisadas,
          propias,
          ocultadas,
          mensaje,
        });
      }
      await guardarAgenda(conductor.id, placa, paraGuardar, {
        sincronizacionId,
        sesionId: opciones.sesionId,
      });
      if (opciones.depurar) {
        const ocultas = paraGuardar.filter((row) => row.pertenencia === 'ajena');
        const restauradas = paraGuardar.filter(
          (row) => row.pertenencia === 'propia' && previas.has(row.numeroEntrega)
        );
        await registrarEventos([
          {
            conductorId: conductor.id,
            sesionId: opciones.sesionId,
            sincronizacionId,
            accion: 'sincronizar',
            resultado: 'ok',
            detalle: { revisadas, propias, ocultadas },
          },
          ...ocultas.map((row) => ({
            conductorId: conductor.id,
            sesionId: opciones.sesionId,
            sincronizacionId,
            accion: 'ocultar_entrega',
            numeroEntrega: row.numeroEntrega,
            resultado: 'ok',
            detalle: { tknum: row.tknum || null, motivo: row.motivo },
          })),
          ...restauradas.map((row) => ({
            conductorId: conductor.id,
            sesionId: opciones.sesionId,
            sincronizacionId,
            accion: 'restaurar_entrega',
            numeroEntrega: row.numeroEntrega,
            resultado: 'ok',
            detalle: { tknum: row.tknum || null },
          })),
        ]);
      }
      if (!agenda.existe) {
        listasFrescas = { entregasHoy: [], entregasPendientes: [] };
        sap = {
          disponible: true,
          configurada: true,
          mensaje: 'No hay transporte para esta cédula y placa.',
        };
      } else {
        listasFrescas = {
          entregasHoy: listas.entregasHoy,
          entregasPendientes: listas.entregasPendientes,
        };
        sap = {
          disponible: true,
          configurada: true,
          mensaje,
        };
      }
    }
  } catch (error) {
    console.error('Agenda conductor:', error.status || '', error.message || error);
    sap = {
      disponible: false,
      configurada: true,
      mensaje: 'No se pudo sincronizar el transporte. Se muestran las entregas guardadas.',
    };
  }
  const agendaVisible = listasFrescas || (await leerAgendaGuardada(conductor.id, placa, fecha));
  const conConteo = await aplicarConteoAdjuntos(conductor.id, agendaVisible);
  return {
    viajes: conConteo.entregasHoy,
    entregasHoy: conConteo.entregasHoy,
    entregasPendientes: conConteo.entregasPendientes,
    sap,
    fecha,
  };
}

export async function crearConductor({ cedula, placa, nombre, telefono, empresa, password, email }) {
  const sb = getSupabase();
  const ced = normalizarCedula(cedula);
  const pla = normalizarPlaca(placa);
  const correo = normalizarEmail(email);
  if (!ced || !pla) {
    throw Object.assign(new Error('Cédula o placa con formato inválido'), { status: 400 });
  }
  if (correo === null) {
    throw Object.assign(new Error('El correo no es válido'), { status: 400 });
  }
  if (password && !validarContrasena(password)) {
    throw Object.assign(
      new Error('La contraseña debe tener de 8 a 72 caracteres, con letras y números'),
      { status: 400 }
    );
  }

  const { data: existing, error: findErr } = await sb
    .from('pc_conductor')
    .select('id, activo')
    .eq('cedula', ced)
    .maybeSingle();
  if (findErr) throw errorDb(findErr);

  const debeClave = !existing || existing.activo === false;
  if (debeClave && !password) {
    throw Object.assign(new Error('Indique una contraseña para activar la cuenta'), { status: 400 });
  }
  const passwordHash = password ? await bcrypt.hash(String(password), 12) : null;

  let conductorId = existing?.id;
  if (!conductorId) {
    const { data, error } = await sb
      .from('pc_conductor')
      .insert({
        cedula: ced,
        nombre: nombre?.trim() || null,
        telefono: telefono?.trim() || null,
        empresa: empresa?.trim() || null,
        email: correo || null,
        password_hash: passwordHash,
        activo: true,
      })
      .select('id')
      .single();
    if (error) throw errorDb(error);
    conductorId = data.id;
  } else {
    const patch = { activo: true };
    if (nombre?.trim()) patch.nombre = nombre.trim();
    if (telefono?.trim()) patch.telefono = telefono.trim();
    if (empresa?.trim()) patch.empresa = empresa.trim();
    if (correo) patch.email = correo;
    if (passwordHash) patch.password_hash = passwordHash;
    const { error } = await sb.from('pc_conductor').update(patch).eq('id', conductorId);
    if (error) throw errorDb(error);
  }

  const { error: liberaErr } = await sb
    .from('pc_conductor_placa')
    .update({ activa: false })
    .eq('placa', pla)
    .eq('activa', true)
    .neq('conductor_id', conductorId);
  if (liberaErr) throw errorDb(liberaErr);

  const { data: par, error: parErr } = await sb
    .from('pc_conductor_placa')
    .select('id')
    .eq('conductor_id', conductorId)
    .eq('placa', pla)
    .maybeSingle();
  if (parErr) throw errorDb(parErr);

  if (par) {
    const { error } = await sb.from('pc_conductor_placa').update({ activa: true }).eq('id', par.id);
    if (error) throw errorDb(error);
  } else {
    const { error } = await sb
      .from('pc_conductor_placa')
      .insert({ conductor_id: conductorId, placa: pla, activa: true });
    if (error) throw errorDb(error);
  }

  return { id: conductorId, cedula: ced, placa: pla, nombre: nombre?.trim() || null };
}

async function abrirSesion(sb, conductorId, placa) {
  const ahora = new Date().toISOString();
  const { error: revocaErr } = await sb
    .from('pc_sesion')
    .update({ revocada_en: ahora })
    .eq('conductor_id', conductorId)
    .is('revocada_en', null);
  if (revocaErr) throw errorDb(revocaErr);

  const token = crypto.randomBytes(32).toString('base64url');
  const expiraEn = new Date(Date.now() + SESION_MS).toISOString();
  const { data: sesionNueva, error: sesErr } = await sb
    .from('pc_sesion')
    .insert({
      conductor_id: conductorId,
      placa,
      token_hash: hashToken(token),
      expira_en: expiraEn,
    })
    .select('id')
    .single();
  if (sesErr) throw errorDb(sesErr);
  return { token, expiraEn, sesionId: sesionNueva.id };
}

async function ingresarEmpresa({ cedula, codigo, password }) {
  const sb = getSupabase();
  const transportista = normalizarCodigoTransportista(codigo || cedula);
  const candidato = String(password || '').slice(0, 72);
  let conductor = null;
  try {
    conductor = await leerConductor(
      sb,
      'id, cedula, nombre, empresa, telefono, activo, password_hash, email_confirmado, reset_token_hash',
      { cedula: transportista || '0' }
    );
  } catch (error) {
    throw errorDb(error);
  }

  const coincide = await bcrypt.compare(candidato, conductor?.password_hash || DUMMY_HASH);
  if (!transportista || !validarContrasena(password) || !esCuentaEmpresa(conductor) || !coincide) {
    throw Object.assign(new Error('Código o contraseña incorrectos'), { status: 401 });
  }
  if (confirmacionPendiente(conductor)) {
    throw Object.assign(
      new Error('Confirme el correo antes de ingresar. Revise su bandeja o reenvíe la confirmación.'),
      { status: 403, code: 'CORREO_SIN_CONFIRMAR' }
    );
  }
  if (!conductor.activo) {
    throw Object.assign(new Error('Código o contraseña incorrectos'), { status: 401 });
  }

  const sesion = await abrirSesion(sb, conductor.id, transportista);
  return {
    token: sesion.token,
    expiraEn: sesion.expiraEn,
    conductor: perfil(conductor, null),
    viajes: [],
    entregasHoy: [],
    entregasPendientes: [],
    fecha: fechaHoyBogota(),
    sap: null,
  };
}

export async function ingresar(datos) {
  if (datos?.tipo === 'empresa') return ingresarEmpresa(datos);
  const { cedula, placa, password, esContacto } = datos || {};
  const sb = getSupabase();
  const ced = normalizarCedula(cedula);
  const pla = normalizarPlaca(placa);
  const candidato = String(password || '').slice(0, 72);

  let conductor;
  try {
    conductor = await leerConductor(
      sb,
      'id, cedula, nombre, empresa, telefono, activo, password_hash, email_confirmado, reset_token_hash',
      { cedula: ced || '0' }
    );
  } catch (error) {
    throw errorDb(error);
  }

  const coincide = await bcrypt.compare(candidato, conductor?.password_hash || DUMMY_HASH);
  if (!ced || !pla || !validarContrasena(password) || !conductor || esCuentaEmpresa(conductor) || !coincide) {
    throw Object.assign(new Error(MENSAJE_ACCESO), { status: 401 });
  }

  const { data: par, error: parErr } = await sb
    .from('pc_conductor_placa')
    .select('id, activa')
    .eq('conductor_id', conductor.id)
    .eq('placa', pla)
    .maybeSingle();
  if (parErr) throw errorDb(parErr);
  if (!par) throw Object.assign(new Error(MENSAJE_ACCESO), { status: 401 });
  if (confirmacionPendiente(conductor)) {
    throw Object.assign(
      new Error('Confirme el correo antes de ingresar. Revise su bandeja o reenvíe la confirmación.'),
      { status: 403, code: 'CORREO_SIN_CONFIRMAR' }
    );
  }

  if (!conductor.activo || !par.activa) {
    await habilitarAcceso(sb, conductor.id, par.id);
    conductor.activo = true;
  }

  if (typeof esContacto === 'boolean') {
    await sb.from('pc_conductor').update({ es_contacto: esContacto }).eq('id', conductor.id);
  }

  const sesion = await abrirSesion(sb, conductor.id, pla);
  const viajes = await cargarViajesHoy(conductor, pla, {
    depurar: true,
    sesionId: sesion.sesionId,
  });
  return {
    token: sesion.token,
    expiraEn: sesion.expiraEn,
    conductor: perfil(conductor, pla),
    viajes: viajes.entregasHoy,
    entregasHoy: viajes.entregasHoy,
    entregasPendientes: viajes.entregasPendientes,
    fecha: viajes.fecha,
    sap: viajes.sap,
  };
}

export async function obtenerSesionActiva(token, opciones = {}) {
  if (!token) return null;
  const sb = getSupabase();
  const ahora = new Date().toISOString();
  const { data: sesion, error } = await sb
    .from('pc_sesion')
    .select('id, conductor_id, placa, expira_en, revocada_en')
    .eq('token_hash', hashToken(token))
    .is('revocada_en', null)
    .gt('expira_en', ahora)
    .maybeSingle();
  if (error) throw errorDb(error);
  if (!sesion) return null;

  let conductor;
  try {
    conductor = await leerConductor(
      sb,
      'id, cedula, nombre, empresa, telefono, activo, reset_token_hash, email_confirmado',
      { id: sesion.conductor_id, activo: true }
    );
  } catch (condErr) {
    throw errorDb(condErr);
  }
  if (!conductor || confirmacionPendiente(conductor)) return null;

  await sb.from('pc_sesion').update({ ultimo_acceso_en: ahora }).eq('id', sesion.id);
  if (esCuentaEmpresa(conductor)) {
    return {
      expiraEn: sesion.expira_en,
      conductor: perfil(conductor, null),
      viajes: [],
      entregasHoy: [],
      entregasPendientes: [],
      fecha: fechaHoyBogota(),
      sap: null,
    };
  }
  const viajes = await cargarViajesHoy(conductor, sesion.placa, {
    depurar: Boolean(opciones.depurar),
    sesionId: sesion.id,
  });
  return {
    expiraEn: sesion.expira_en,
    conductor: perfil(conductor, sesion.placa),
    viajes: viajes.entregasHoy,
    entregasHoy: viajes.entregasHoy,
    entregasPendientes: viajes.entregasPendientes,
    fecha: viajes.fecha,
    sap: viajes.sap,
  };
}

export async function cerrarSesion(token) {
  if (!token) return;
  const sb = getSupabase();
  await sb
    .from('pc_sesion')
    .update({ revocada_en: new Date().toISOString() })
    .eq('token_hash', hashToken(token))
    .is('revocada_en', null);
}

/** Comprueba la cookie sin devolver viajes ni datos del conductor al cliente. */
export async function validarSesion(token) {
  if (!token || token.length < 20) return null;
  const sb = getSupabase();
  const ahora = new Date().toISOString();
  const { data: sesion, error } = await sb
    .from('pc_sesion')
    .select('id, conductor_id, placa')
    .eq('token_hash', hashToken(token))
    .is('revocada_en', null)
    .gt('expira_en', ahora)
    .maybeSingle();
  if (error) throw errorDb(error);
  if (!sesion) return null;

  let conductor;
  try {
    conductor = await leerConductor(
      sb,
      'id, cedula, telefono',
      { id: sesion.conductor_id, activo: true }
    );
  } catch (condErr) {
    throw errorDb(condErr);
  }
  if (!conductor) return null;
  const empresa = esCuentaEmpresa(conductor);
  return {
    conductorId: conductor.id,
    cedula: empresa ? '' : conductor.cedula,
    placa: empresa ? '' : sesion.placa,
    tipo: empresa ? 'empresa' : 'conductor',
    transportistaCodigo: empresa ? conductor.cedula : '',
    sesionId: sesion.id,
  };
}

async function registrarEmpresa({ cedula, codigo, nombre, email, password }, req) {
  const sb = getSupabase();
  const transportista = normalizarCodigoTransportista(codigo || cedula);
  const correo = normalizarEmail(email);
  const nombreLimpio = String(nombre || '').trim().slice(0, 120);
  if (!transportista || !correo || !nombreLimpio || !validarContrasena(password)) {
    throw Object.assign(
      new Error('Revise el nombre, el código de transportista, el correo y una contraseña de 8 a 72 caracteres con letras y números.'),
      { status: 400 }
    );
  }

  let verificacion;
  try {
    verificacion = await listarEntregasEmpresa(transportista, { limite: 1, pagina: 1, vista: 'dia' });
  } catch (err) {
    if (err.status === 404) {
      throw Object.assign(new Error('No encontramos una empresa con ese código de transportista.'), { status: 400 });
    }
    throw err;
  }
  const razon = verificacion.transportista?.nombre || '';
  const nit = verificacion.transportista?.nit || '';
  if (!verificacion.transportista?.existe || !razon) {
    throw Object.assign(new Error('No encontramos una empresa con ese código de transportista.'), { status: 400 });
  }

  const passwordHash = await bcrypt.hash(String(password), 12);
  let existente = null;
  try {
    existente = await leerConductor(sb, 'id, password_hash, telefono', { cedula: transportista });
  } catch (error) {
    throw errorDb(error);
  }
  if (existente && (existente.password_hash || !esCuentaEmpresa(existente))) {
    throw Object.assign(
      new Error('Ya existe una cuenta con ese código. Inicie sesión o recupere la contraseña.'),
      { status: 409 }
    );
  }

  const marca = marcaEmpresa(nit);
  if (existente) {
    const { error } = await sb.from('pc_conductor').update({
      nombre: nombreLimpio,
      email: correo,
      password_hash: passwordHash,
      empresa: razon,
      telefono: marca,
      es_contacto: false,
      activo: true,
    }).eq('id', existente.id);
    if (error) throw errorDb(error);
    return enviarConfirmacionDeCuenta(sb, existente.id, { nombre: nombreLimpio, email: correo }, req);
  }

  const { data, error } = await sb
    .from('pc_conductor')
    .insert({
      cedula: transportista,
      nombre: nombreLimpio,
      email: correo,
      password_hash: passwordHash,
      empresa: razon,
      telefono: marca,
      es_contacto: false,
      activo: true,
    })
    .select('id')
    .single();
  if (error) throw errorDb(error);
  return enviarConfirmacionDeCuenta(sb, data.id, { nombre: nombreLimpio, email: correo }, req);
}

export async function registrarSolicitud(datos, req) {
  if (datos?.tipo === 'empresa') return registrarEmpresa(datos, req);
  const { cedula, placa, nombre, email, password, esContacto } = datos || {};
  const sb = getSupabase();
  const ced = normalizarCedula(cedula);
  const pla = normalizarPlaca(placa);
  const correo = normalizarEmail(email);
  const nombreLimpio = String(nombre || '').trim().slice(0, 120);
  if (!ced || !pla || !correo || !validarContrasena(password)) {
    throw Object.assign(
      new Error('Revise el documento, la placa, el correo y una contraseña de 8 a 72 caracteres con letras y números.'),
      { status: 400 }
    );
  }

  const passwordHash = await bcrypt.hash(String(password), 12);
  const { data: existing, error: findErr } = await sb
    .from('pc_conductor')
    .select('id')
    .eq('cedula', ced)
    .maybeSingle();
  if (findErr) throw errorDb(findErr);

  if (existing) {
    const { data: cuenta, error: cuentaErr } = await sb
      .from('pc_conductor')
      .select('password_hash')
      .eq('id', existing.id)
      .maybeSingle();
    if (cuentaErr) throw errorDb(cuentaErr);
    if (cuenta?.password_hash) {
      throw Object.assign(
        new Error('Ya existe una cuenta con ese documento. Inicie sesión o recupere la contraseña.'),
        { status: 409 }
      );
    }
    const patch = {
      activo: true,
      email: correo,
      password_hash: passwordHash,
      es_contacto: Boolean(esContacto),
    };
    if (nombreLimpio) patch.nombre = nombreLimpio;
    const { error: updErr } = await sb.from('pc_conductor').update(patch).eq('id', existing.id);
    if (updErr) throw errorDb(updErr);
    await vincularPlacaActiva(sb, existing.id, pla);
    return enviarConfirmacionDeCuenta(sb, existing.id, { nombre: nombreLimpio, email: correo }, req);
  }

  const { data, error } = await sb
    .from('pc_conductor')
    .insert({
      cedula: ced,
      nombre: nombreLimpio || null,
      email: correo,
      password_hash: passwordHash,
      es_contacto: Boolean(esContacto),
      activo: true,
    })
    .select('id')
    .single();
  if (error) throw errorDb(error);

  await vincularPlacaActiva(sb, data.id, pla);
  return enviarConfirmacionDeCuenta(sb, data.id, { nombre: nombreLimpio, email: correo }, req);
}

async function enviarConfirmacionDeCuenta(sb, conductorId, persona, req) {
  const base = baseEnlace(req);
  if (!base || !persona.email) return { requiereConfirmacion: false, correoEnviado: false };
  const minutos = config.auth.confirmExpiresMin;
  const temporal = tokenTemporal(minutos);
  const pendiente = {
    email_confirmado: false,
    confirm_token_hash: temporal.hash,
    confirm_expira_en: temporal.expira,
  };
  let { error } = await sb.from('pc_conductor').update(pendiente).eq('id', conductorId);
  if (error && faltaColumna(error)) {
    ({ error } = await sb
      .from('pc_conductor')
      .update({
        reset_token_hash: `${PREFIJO_CONFIRMACION}${temporal.hash}`,
        reset_expira_en: temporal.expira,
      })
      .eq('id', conductorId));
  }
  if (error) throw errorDb(error);
  try {
    const aviso = await enviarConfirmacionCuenta({
      to: persona.email,
      nombre: persona.nombre,
      confirmUrl: enlaceConToken(base, 'confirmar', temporal.token),
      minutos,
    });
    return { requiereConfirmacion: true, correoEnviado: aviso.enviado === true };
  } catch (err) {
    console.error('[confirmar] no se pudo enviar el correo de la cuenta');
    return { requiereConfirmacion: true, correoEnviado: false };
  }
}

async function vincularPlacaActiva(sb, conductorId, pla) {
  const { data: ajena, error: ajenaErr } = await sb
    .from('pc_conductor_placa')
    .select('id')
    .eq('placa', pla)
    .eq('activa', true)
    .neq('conductor_id', conductorId)
    .maybeSingle();
  if (ajenaErr) throw errorDb(ajenaErr);
  if (ajena) {
    throw Object.assign(new Error('Esa placa ya está registrada en otra cuenta.'), { status: 409 });
  }

  const { data: par, error: parErr } = await sb
    .from('pc_conductor_placa')
    .select('id')
    .eq('conductor_id', conductorId)
    .eq('placa', pla)
    .maybeSingle();
  if (parErr) throw errorDb(parErr);

  if (par) {
    const { error } = await sb.from('pc_conductor_placa').update({ activa: true }).eq('id', par.id);
    if (error) throw errorDb(error);
    return;
  }

  const { error } = await sb.from('pc_conductor_placa').insert({
    conductor_id: conductorId,
    placa: pla,
    activa: true,
  });
  if (error) throw errorDb(error);
}

async function habilitarAcceso(sb, conductorId, placaId) {
  const { error: cuentaErr } = await sb.from('pc_conductor').update({ activo: true }).eq('id', conductorId);
  if (cuentaErr) throw errorDb(cuentaErr);
  const { error: placaErr } = await sb.from('pc_conductor_placa').update({ activa: true }).eq('id', placaId);
  if (placaErr) throw errorDb(placaErr);
}

function origenHttp(valor) {
  try {
    const url = new URL(String(valor || ''));
    if (url.username || url.password) return '';
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.origin;
  } catch {
    return '';
  }
}

/** El enlace del correo solo puede abrir el portal configurado. No se usa el Host de la petición. */
function baseEnlace(req) {
  const configurada = origenHttp(config.auth.frontendUrl);
  const permitidos = new Set(
    [config.auth.frontendUrl, ...config.corsOrigins].map(origenHttp).filter(Boolean)
  );
  const origin = req?.headers?.origin;
  if (!origin) return configurada;
  let url;
  try {
    url = new URL(origin);
  } catch {
    return configurada;
  }
  const esWebView = url.protocol === 'capacitor:' || (url.protocol === 'https:' && url.hostname === 'localhost');
  if (esWebView) return configurada;
  const candidato = origenHttp(origin);
  if (candidato && permitidos.has(candidato)) return candidato;
  return configurada;
}

function enlaceConToken(base, nombre, token) {
  return `${String(base).replace(/\/$/, '')}/#${nombre}=${encodeURIComponent(token)}`;
}

function enlaceReciente(expiraEn, minutos) {
  const expira = new Date(expiraEn || 0).getTime();
  if (!expira || expira <= Date.now()) return false;
  const emitido = expira - (Number(minutos) || 60) * 60 * 1000;
  return Date.now() - emitido < REENVIO_MS;
}

async function solicitarRestablecimientoEmpresa(cedula, req) {
  const sb = getSupabase();
  const transportista = normalizarCodigoTransportista(cedula);
  if (!transportista) return;
  let conductor;
  try {
    conductor = await leerConductor(
      sb,
      'id, nombre, email, activo, telefono, reset_token_hash, reset_expira_en',
      { cedula: transportista }
    );
  } catch (error) {
    if (faltaColumna(error)) return;
    throw error;
  }
  if (!conductor?.email || !conductor.activo || !esCuentaEmpresa(conductor) || confirmacionPendiente(conductor)) return;
  if (enlaceReciente(conductor.reset_expira_en, config.auth.resetExpiresMin)) return;

  const token = crypto.randomBytes(32).toString('base64url');
  const minutos = config.auth.resetExpiresMin;
  const expira = new Date(Date.now() + minutos * 60 * 1000).toISOString();
  const { error: saveErr } = await sb
    .from('pc_conductor')
    .update({ reset_token_hash: hashToken(token), reset_expira_en: expira })
    .eq('id', conductor.id);
  if (saveErr) throw saveErr;
  const base = baseEnlace(req);
  if (!base) return;
  const aviso = await enviarEnlaceRestablecimiento({
    to: conductor.email,
    nombre: conductor.nombre,
    resetUrl: enlaceConToken(base, 'restablecer', token),
    minutos,
  });
  if (!aviso?.enviado) console.error('[recuperar] el enlace no salió por correo');
}

export async function solicitarRestablecimiento({ cedula, placa, tipo }, req) {
  try {
    if (tipo === 'empresa') {
      await solicitarRestablecimientoEmpresa(cedula, req);
      return;
    }
    const sb = getSupabase();
    const ced = normalizarCedula(cedula);
    const pla = normalizarPlaca(placa);
    if (!ced || !pla) return;

    const { data: conductor, error } = await sb
      .from('pc_conductor')
      .select('id, nombre, email, activo, telefono, reset_token_hash, reset_expira_en')
      .eq('cedula', ced)
      .eq('activo', true)
      .maybeSingle();
    if (error) throw error;
    if (!conductor?.email || confirmacionPendiente(conductor)) return;
    if (enlaceReciente(conductor.reset_expira_en, config.auth.resetExpiresMin)) return;

    const { data: par, error: parErr } = await sb
      .from('pc_conductor_placa')
      .select('id')
      .eq('conductor_id', conductor.id)
      .eq('placa', pla)
      .eq('activa', true)
      .maybeSingle();
    if (parErr) throw parErr;
    if (!par) return;

    const base = baseEnlace(req);
    if (!base) return;

    const token = crypto.randomBytes(32).toString('base64url');
    const minutos = config.auth.resetExpiresMin;
    const expira = new Date(Date.now() + minutos * 60 * 1000).toISOString();
    const { error: saveErr } = await sb
      .from('pc_conductor')
      .update({ reset_token_hash: hashToken(token), reset_expira_en: expira })
      .eq('id', conductor.id);
    if (saveErr) throw saveErr;

    const aviso = await enviarEnlaceRestablecimiento({
      to: conductor.email,
      nombre: conductor.nombre,
      resetUrl: enlaceConToken(base, 'restablecer', token),
      minutos,
    });
    if (!aviso?.enviado) console.error('[recuperar] el enlace no salió por correo');
  } catch (err) {
    if (err?.status === 503) throw err;
    console.error('[recuperar] no se pudo completar la solicitud');
  }
}

export async function restablecerContrasena({ token, password }) {
  if (!validarContrasena(password)) {
    throw Object.assign(
      new Error('La contraseña debe tener de 8 a 72 caracteres, con letras y números'),
      { status: 400 }
    );
  }
  const limpio = String(token || '');
  if (limpio.length < 20 || limpio.length > 200) {
    throw Object.assign(new Error(MENSAJE_ENLACE), { status: 400 });
  }

  const sb = getSupabase();
  const ahora = new Date().toISOString();
  const hash = hashToken(limpio);
  const { data: actualizado, error: saveErr } = await sb
    .from('pc_conductor')
    .update({
      password_hash: await bcrypt.hash(String(password), 12),
      reset_token_hash: null,
      reset_expira_en: null,
    })
    .eq('reset_token_hash', hash)
    .eq('activo', true)
    .gt('reset_expira_en', ahora)
    .select('id');
  if (saveErr) throw errorDb(saveErr);
  const conductor = actualizado?.[0];
  if (!conductor) {
    throw Object.assign(new Error(MENSAJE_ENLACE), { status: 400 });
  }

  const { error: revocaErr } = await sb
    .from('pc_sesion')
    .update({ revocada_en: ahora })
    .eq('conductor_id', conductor.id)
    .is('revocada_en', null);
  if (revocaErr) console.error('[restablecer] no se pudieron cerrar las sesiones');
}

export async function confirmarCorreo({ token }) {
  const limpio = String(token || '');
  if (limpio.length < 20 || limpio.length > 200) {
    throw Object.assign(new Error(MENSAJE_ENLACE), { status: 400 });
  }
  const sb = getSupabase();
  const ahora = new Date().toISOString();
  const hash = hashToken(limpio);
  const porColumna = await sb
    .from('pc_conductor')
    .update({
      email_confirmado: true,
      confirm_token_hash: null,
      confirm_expira_en: null,
    })
    .eq('confirm_token_hash', hash)
    .gt('confirm_expira_en', ahora)
    .select('id, telefono');
  if (!porColumna.error && porColumna.data?.length) {
    await quitarMarcaPendiente(sb, porColumna.data[0]);
    return;
  }
  if (porColumna.error && !faltaColumna(porColumna.error)) throw errorDb(porColumna.error);

  const marca = `${PREFIJO_CONFIRMACION}${hash}`;
  const { data: pendiente, error: buscaErr } = await sb
    .from('pc_conductor')
    .select('id, telefono')
    .eq('reset_token_hash', marca)
    .gt('reset_expira_en', ahora)
    .maybeSingle();
  if (buscaErr) throw errorDb(buscaErr);
  if (!pendiente) throw Object.assign(new Error(MENSAJE_ENLACE), { status: 400 });

  const patch = { reset_token_hash: null, reset_expira_en: null };
  if (String(pendiente.telefono || '').endsWith(':PEND')) {
    patch.telefono = String(pendiente.telefono).replace(/:PEND$/, '');
  }
  const { data: cerrado, error: cierraErr } = await sb
    .from('pc_conductor')
    .update(patch)
    .eq('id', pendiente.id)
    .eq('reset_token_hash', marca)
    .select('id');
  if (cierraErr) throw errorDb(cierraErr);
  if (!cerrado?.length) throw Object.assign(new Error(MENSAJE_ENLACE), { status: 400 });
}

async function quitarMarcaPendiente(sb, fila) {
  if (!String(fila?.telefono || '').endsWith(':PEND')) return;
  await sb.from('pc_conductor').update({
    telefono: String(fila.telefono).replace(/:PEND$/, ''),
  }).eq('id', fila.id);
}

export async function reenviarConfirmacion({ cedula, placa, tipo, codigo }, req) {
  try {
    const sb = getSupabase();
    if (tipo === 'empresa') {
      const transportista = normalizarCodigoTransportista(codigo || cedula);
      if (!transportista) return;
      let conductor;
      try {
        conductor = await leerConductor(
          sb,
          'id, nombre, email, email_confirmado, confirm_expira_en, telefono, reset_token_hash, reset_expira_en',
          { cedula: transportista }
        );
      } catch (error) {
        if (faltaColumna(error)) return;
        throw error;
      }
      if (!conductor?.email || !esCuentaEmpresa(conductor) || !confirmacionPendiente(conductor)) return;
      if (enlaceReciente(conductor.confirm_expira_en || conductor.reset_expira_en, config.auth.confirmExpiresMin)) return;
      await enviarConfirmacionDeCuenta(sb, conductor.id, conductor, req);
      return;
    }
    const ced = normalizarCedula(cedula);
    const pla = normalizarPlaca(placa);
    if (!ced || !pla) return;

    let conductor;
    let error;
    ({ data: conductor, error } = await sb
      .from('pc_conductor')
      .select('id, nombre, email, email_confirmado, confirm_expira_en, telefono, reset_token_hash, reset_expira_en')
      .eq('cedula', ced)
      .maybeSingle());
    if (error && faltaColumna(error)) {
      ({ data: conductor, error } = await sb
        .from('pc_conductor')
        .select('id, nombre, email, telefono, reset_token_hash, reset_expira_en')
        .eq('cedula', ced)
        .maybeSingle());
    }
    if (error) throw error;
    if (!conductor?.email || !confirmacionPendiente(conductor)) return;
    if (enlaceReciente(conductor.confirm_expira_en || conductor.reset_expira_en, config.auth.confirmExpiresMin)) return;

    const { data: par, error: parErr } = await sb
      .from('pc_conductor_placa')
      .select('id')
      .eq('conductor_id', conductor.id)
      .eq('placa', pla)
      .eq('activa', true)
      .maybeSingle();
    if (parErr) throw parErr;
    if (!par) return;

    await enviarConfirmacionDeCuenta(sb, conductor.id, conductor, req);
  } catch (err) {
    if (err?.status === 503) throw err;
    console.error('[confirmar] no se pudo reenviar el correo');
  }
}
