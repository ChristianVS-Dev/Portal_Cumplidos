import fs from 'fs';
import { Blob } from 'buffer';
import { config } from '../config/index.js';
import {
  entregasApiAuthHeaders,
  mensajeError401Entregas,
  urlAdjuntosEntrega,
  urlIntentoEntrega,
} from '../utils/entregasApiClient.js';
import { labelsMotivosDesdeRegistro } from '../domain/motivos-no-contesto.js';
import { labelsVisitasParaSap } from '../domain/visitas-no-contesto.js';

/**
 * Adaptador SAP / API entregas — Anti-Corruption Layer
 */

const MOCK_ENTREGAS = {
  'ENT-2024-00123': {
    numeroEntrega: 'ENT-2024-00123',
    pedido: '4500012345',
    cliente: 'Distribuidora Norte S.A.S.',
    direccion: 'Cra 45 # 12-30, Bogotá',
    ciudad: 'Bogotá',
    estadoLogistico: 'EN_RUTA',
    transportistaAsignado: 'Carlos Méndez',
    placaAsignada: 'ABC-123',
    fechaPlanificada: '2025-05-22',
    volumen: '2.5 m³',
    peso: '180 kg',
  },
};

async function buscarEntregaMock(numero) {
  const key = numero.toUpperCase();
  const found = Object.entries(MOCK_ENTREGAS).find(([k]) => k.toUpperCase() === key);
  if (!found) return null;
  return { ...found[1], fuente: 'SAP_MOCK' };
}

async function buscarEntregaReal(numero) {
  throw new Error('Integración SAP real no configurada. Use SAP_USE_MOCK=true');
}

export async function buscarEntregaSap(numero) {
  const normalizado = String(numero).trim();
  if (!normalizado) {
    throw Object.assign(new Error('Número de entrega requerido'), { status: 400 });
  }

  if (config.sap.useMock) {
    return buscarEntregaMock(normalizado);
  }
  return buscarEntregaReal(normalizado);
}

function extraerSapDocId(json, numeroEntrega) {
  if (!json || typeof json !== 'object') {
    return `SAP-ADJ-${numeroEntrega}-${Date.now()}`;
  }
  return (
    json.id ||
    json.documento_id ||
    json.sap_doc_id ||
    json.sapDocId ||
    json.data?.id ||
    json.data?.documento_id ||
    `SAP-ADJ-${numeroEntrega}-${Date.now()}`
  );
}

/**
 * POST {ENTREGAS_API_BASE_URL}/:n_entrega/adjuntos
 * multipart: file (.zip), descripcion (opcional)
 */
async function enviarAdjuntoSapReal({ numeroEntrega, archivo, descripcion, tipo }) {
  if (!config.entregasExterna.token) {
    throw Object.assign(
      new Error(
        'Falta token para API de entregas. Configure PORTAL_API_KEY o ENTREGAS_API_TOKEN en .env.docker'
      ),
      { status: 503, code: 'SAP_TOKEN_MISSING' }
    );
  }

  const ruta = archivo?.ruta;
  const nombre = archivo?.nombreOriginal || 'adjunto.zip';
  if (!ruta || !fs.existsSync(ruta)) {
    throw Object.assign(new Error('Archivo ZIP no encontrado para envío a SAP'), { status: 500 });
  }
  if (archivo?.esZip && !nombre.toLowerCase().endsWith('.zip')) {
    throw Object.assign(new Error('SAP requiere adjuntos en formato .zip'), {
      status: 400,
      code: 'SAP_ZIP_REQUIRED',
    });
  }

  const buffer = fs.readFileSync(ruta);
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: 'application/zip' }), nombre);
  form.append('descripcion', descripcion || buildDescripcionAdjuntoFallback(numeroEntrega, tipo));

  const url = urlAdjuntosEntrega(numeroEntrega);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.entregasExterna.timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        ...entregasApiAuthHeaders(),
      },
      body: form,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const texto = await res.text().catch(() => '');
    let json = {};
    if (texto) {
      try {
        json = JSON.parse(texto);
      } catch {
        json = { raw: texto };
      }
    }

    if (!res.ok) {
      const msg =
        json?.message ||
        json?.error ||
        json?.mensaje ||
        (typeof json?.raw === 'string' ? json.raw.slice(0, 300) : null) ||
        `API adjuntos respondió ${res.status}`;
      console.error('[SAP adjuntos] POST falló', res.status, url, msg);
      throw Object.assign(new Error(msg), {
        status: res.status >= 500 ? 502 : res.status,
        code: 'SAP_ADJUNTOS_HTTP',
      });
    }

    console.info('[SAP adjuntos] POST ok', url, json?.id || json?.message || '');

    return {
      sapDocId: String(extraerSapDocId(json, numeroEntrega)),
      mensaje: json?.message || json?.mensaje || 'Adjunto ZIP registrado en SAP',
      tipo,
      numeroEntrega,
      nombreArchivo: nombre,
      archivosInternos: archivo?.archivosInternos || [],
      respuestaSap: json,
    };
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      throw Object.assign(new Error('Tiempo de espera agotado al enviar adjunto a SAP'), {
        status: 504,
      });
    }
    if (err.status) throw err;
    throw Object.assign(
      new Error(`No se pudo conectar con SAP adjuntos: ${err.message}`),
      { status: 502 }
    );
  }
}

function buildDescripcionAdjuntoFallback(numeroEntrega, tipo) {
  const etiqueta = tipo === 'cumplido' ? 'Cumplido de entrega' : `Evidencia (${tipo})`;
  return `ANEXO SUBIDO PORTAL CONDUCTOR · ${etiqueta} · Entrega ${numeroEntrega}`;
}

/**
 * Envía el ZIP de adjuntos al endpoint SAP/API de entregas.
 */
export async function enviarAdjuntoSap({ numeroEntrega, archivo, descripcion, tipo }) {
  const nombre = archivo?.nombreOriginal || '';

  if (config.sap.useMock) {
    await new Promise((r) => setTimeout(r, 300));
    const internos = archivo?.archivosInternos?.length || 0;
    const mensajeMock =
      internos > 1
        ? `ZIP con ${internos} archivos registrado en SAP (simulado)`
        : 'Adjunto ZIP registrado en SAP (simulado)';
    console.warn('[SAP adjuntos] MOCK activo — no se llamó a la API real. SAP_USE_MOCK=false para enviar.');
    return {
      sapDocId: `MOCK-DOC-${Date.now()}`,
      mensaje: mensajeMock,
      simulado: true,
      tipo,
      numeroEntrega,
      nombreArchivo: nombre,
      archivosInternos: archivo?.archivosInternos || [],
      descripcion: descripcion || buildDescripcionAdjuntoFallback(numeroEntrega, tipo),
    };
  }

  return enviarAdjuntoSapReal({ numeroEntrega, archivo, descripcion, tipo });
}

function entregadoDesdeModo(modo) {
  return modo === 'ok';
}

/**
 * POST {ENTREGAS_API_BASE_URL}/:vbeln/intento
 * Body: { entregado: true|false } — ok → true (X en SAP), nov → false (espacio)
 */
async function registrarIntentoEntregaSapReal(numeroEntrega, modo) {
  if (!config.entregasExterna.token) {
    throw Object.assign(
      new Error(
        'Falta token para API de entregas. Configure PORTAL_API_KEY o ENTREGAS_API_TOKEN en .env.docker'
      ),
      { status: 503, code: 'SAP_TOKEN_MISSING' }
    );
  }

  const entregado = entregadoDesdeModo(modo);
  const url = urlIntentoEntrega(numeroEntrega);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.entregasExterna.timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...entregasApiAuthHeaders(),
      },
      body: JSON.stringify({ entregado }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const texto = await res.text().catch(() => '');
    let json = {};
    if (texto) {
      try {
        json = JSON.parse(texto);
      } catch {
        json = { raw: texto };
      }
    }

    if (res.status === 401) {
      throw Object.assign(new Error(mensajeError401Entregas(401, json)), {
        status: 401,
        code: 'SAP_INTENTO_AUTH',
      });
    }

    const intentoOk =
      json.ok === true ||
      json.ok === 'true' ||
      json.intento != null ||
      json.logId != null;

    if (res.ok && intentoOk) {
      console.info('[SAP intento] POST ok', url, `intento=${json.intento}`, json.mensaje || '');
      return {
        ok: true,
        estado: 'ok',
        logId: json.logId,
        intento: json.intento,
        mensaje: json.mensaje || json.message || 'Intento registrado correctamente',
        entregado,
        numeroEntrega,
      };
    }

    const msg = json.mensaje || json.message || json.raw || `API respondió ${res.status}`;
    console.error('[SAP intento] POST falló', res.status, url, msg);
    throw Object.assign(new Error(msg), {
      status: res.status >= 400 && res.status < 600 ? res.status : 502,
      code: 'SAP_INTENTO_HTTP',
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      throw Object.assign(new Error('Tiempo de espera agotado al registrar intento en SAP'), {
        status: 504,
      });
    }
    if (err.status) throw err;
    throw Object.assign(new Error(`No se pudo conectar con SAP intento: ${err.message}`), {
      status: 503,
    });
  }
}

/** Registra intento de entrega (RFC Z_SD_LOG_INTENTO_ENTREGA vía API). SAP calcula el número de intento. */
export async function registrarIntentoEntregaSap(numeroEntrega, modo) {
  if (config.sap.useMock) {
    await new Promise((r) => setTimeout(r, 200));
    const entregado = entregadoDesdeModo(modo);
    console.warn('[SAP intento] MOCK activo — no se llamó a la API real. SAP_USE_MOCK=false para enviar.');
    return {
      ok: true,
      estado: 'ok',
      logId: `MOCK-LOG-${Date.now()}`,
      intento: '001',
      mensaje: `Intento registrado correctamente (simulado, entregado=${entregado})`,
      entregado,
      numeroEntrega,
      simulado: true,
    };
  }

  return registrarIntentoEntregaSapReal(numeroEntrega, modo);
}

/** @deprecated Alias — usar registrarIntentoEntregaSap */
export async function actualizarEstadoEntregaSap(numeroEntrega, modo) {
  return registrarIntentoEntregaSap(numeroEntrega, modo);
}

/** Texto recomendado para el campo descripcion del endpoint SAP */
export function buildDescripcionAdjuntoSap(registro) {
  const vbeln = registro?.numero_entrega || registro?.numeroEntrega || '';
  const nombre =
    registro?.conductor_nombre || registro?.transportista || 'Conductor no identificado';
  const doc = registro?.conductor_documento || 'N/D';
  const placa = registro?.placa || 'N/D';
  const esNov =
    registro?.modo === 'nov' || registro?.estado_resultado === 'no_contesto';
  const tipo = esNov ? 'Entrega fallida' : 'Entrega exitosa';
  const total = registro?.total_archivos ? `${registro.total_archivos} archivo(s) en ZIP` : '';
  const motivos =
    registro?.motivosNov?.length > 0
      ? registro.motivosNov.join('; ')
      : labelsMotivosDesdeRegistro(registro).join('; ') || null;
  const visitasTxt = labelsVisitasParaSap(registro);
  const visitas = visitasTxt.length ? visitasTxt.join('; ') : null;

  const partes = [
    'ANEXO SUBIDO PORTAL CONDUCTOR',
    tipo,
    vbeln ? `Entrega ${vbeln}` : null,
    motivos ? `Motivos: ${motivos}` : null,
    visitas ? `Visitas: ${visitas}` : null,
    `Conductor: ${nombre}`,
    `CC ${doc}`,
    `Placa ${placa}`,
    total || null,
  ].filter(Boolean);

  return partes.join(' · ').slice(0, 500);
}
