import { transporteDelConductor } from '../domain/conductor-acceso.js';
import { normalizarCliente } from '../domain/entrega-display.js';
import { crearCache } from '../utils/cacheCorta.js';
import { consultarEntrega } from './entregas-externa.service.js';

const GEOCODIFICADOR = 'https://nominatim.openstreetmap.org/search';
const ENRUTADOR = 'https://router.project-osrm.org/route/v1/driving';
const AGENTE = 'PortalCumplidos/1.0 (ruta de entrega; uso interno)';
const cacheDireccion = crearCache({ ttlMs: 30 * 60 * 1000, max: 400 });

function direccionDe(doc) {
  const cliente = normalizarCliente(doc?.entrega?.cliente);
  const partes = [cliente?.direccion, cliente?.ciudad].map((parte) => String(parte || '').trim()).filter(Boolean);
  return partes.join(', ');
}

async function geocodificar(direccion) {
  const clave = direccion.toLocaleLowerCase('es-CO');
  return cacheDireccion.obtener(clave, async () => {
    const url = new URL(GEOCODIFICADOR);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '1');
    url.searchParams.set('countrycodes', 'co');
    url.searchParams.set('q', `${direccion}, Colombia`);
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': AGENTE, 'Accept-Language': 'es' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      throw Object.assign(new Error('No se pudo ubicar la dirección en el mapa'), { status: 502 });
    }
    const lista = await res.json();
    const punto = lista?.[0];
    const lat = Number(punto?.lat);
    const lng = Number(punto?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { vacio: true };
    return { lat, lng };
  });
}

async function trazarCamino(origen, destino) {
  const camino = `${origen.lng},${origen.lat};${destino.lng},${destino.lat}`;
  const url = `${ENRUTADOR}/${camino}?overview=full&geometries=geojson`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': AGENTE },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return null;
  const json = await res.json();
  const tramo = json?.routes?.[0];
  const coordenadas = tramo?.geometry?.coordinates;
  if (!tramo || !Array.isArray(coordenadas) || coordenadas.length < 2) return null;
  return {
    distanciaMetros: Math.round(Number(tramo.distance) || 0),
    duracionSegundos: Math.round(Number(tramo.duration) || 0),
    trayectoria: coordenadas.map(([lng, lat]) => [lat, lng]),
  };
}

/** Destino desde la dirección de SAP y, si llega la posición del celular, la ruta en carretera. */
export async function consultarRutaEntrega(acceso, numero, origen) {
  const doc = await consultarEntrega(numero);
  if (!doc || !transporteDelConductor(acceso, doc.transporte)) {
    throw Object.assign(new Error('Entrega no disponible para esta cuenta'), { status: 404 });
  }

  const direccion = direccionDe(doc);
  if (!direccion) {
    throw Object.assign(
      new Error('SAP no trajo una dirección para ubicar este cliente en el mapa.'),
      { status: 404, code: 'SIN_DIRECCION' }
    );
  }

  let punto;
  try {
    punto = await geocodificar(direccion);
  } catch (error) {
    console.error('[ruta]', error.cause?.code || error.code || error.name, error.message);
    throw Object.assign(
      new Error('No se pudo consultar el mapa en este momento. Intente de nuevo en unos segundos.'),
      { status: 502, code: 'MAPA_NO_DISPONIBLE' }
    );
  }

  if (!punto || punto.vacio) {
    throw Object.assign(
      new Error('La dirección de SAP no se pudo situar en el mapa. La ruta no está disponible para esta entrega.'),
      { status: 404, code: 'DIRECCION_NO_UBICADA' }
    );
  }

  const destino = { lat: punto.lat, lng: punto.lng, direccion };
  let ruta = null;
  if (origen) {
    try {
      ruta = await trazarCamino(origen, destino);
    } catch (error) {
      console.error('[ruta]', error.cause?.code || error.code || error.name, error.message);
    }
  }

  return {
    destino,
    origen,
    distanciaMetros: ruta?.distanciaMetros ?? null,
    duracionSegundos: ruta?.duracionSegundos ?? null,
    trayectoria: ruta?.trayectoria ?? null,
    aproximada: true,
  };
}
