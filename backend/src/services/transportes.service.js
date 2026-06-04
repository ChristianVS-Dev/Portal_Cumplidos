import { config } from '../config/index.js';
import { entregasApiReadHeaders, mensajeError401Entregas } from '../utils/entregasApiClient.js';
import {
  mapEntregaListaItem,
  mapEntregaToSap,
  mapTransporteVista,
  parseFechaTransporte,
} from '../domain/entrega-display.js';

export { parseFechaTransporte, mapEntregaToSap };

const MOCK_TRANSPORTE = {
  success: true,
  existe: true,
  transporte: {
    tknum: '1000132330',
    placa: 'SJP191',
    tipo_transporte: 'D002',
    tipo_transporte_descripcion: 'Contratado Distr.Nac',
    ruta: 'YU2000',
    ruta_descripcion: 'YUMBO-ARMENIA (QUINDIO)',
    procesamiento_especial: 'Z004',
    procesamiento_especial_descripcion: 'Vehículo Turbo',
    tipo_vehiculo: 'Z004',
    clase_medio_transporte: 'C3',
    clase_medio_transporte_descripcion: 'Consolidado',
    nombre_transporte: 'CORTE 3- 8ABR 11:30a',
    conductor: {
      nombre: 'CARLOS ALBERTO RIOS QUINTANA',
      documento: '18463655',
      telefono: '3104343406',
    },
    fecha_creacion: '07.04.2026',
    hora_creacion: '16:31:40',
    fecha_inicio_ruta: '08.04.2026',
    hora_inicio_ruta: '13:00:00',
    transportista: {
      codigo: '800520',
      nombre: 'DC CARGO EXPRESS S.A.S.',
    },
  },
  total_entregas: 4,
  entregas: [
    {
      vbeln: '46619929',
      ruta: 'YU2000',
      fecha_creacion: '06.04.2026',
      cliente: {
        codigo: '2000403818',
        nombre: 'GUIDO HERRERA',
        direccion: 'ALTOS DE YERBABUENA CASA 1',
        ciudad: 'ARMENIA-QUINDIO',
        region: '63',
      },
    },
    {
      vbeln: '46620070',
      ruta: 'YU2000',
      fecha_creacion: '06.04.2026',
      cliente: {
        codigo: '2000156695',
        nombre: 'JJNZ REMODELACIONES SAS',
        direccion: 'CRA 19 # 10 - 20',
        ciudad: 'ARMENIA-QUINDIO',
        region: '63',
      },
    },
    {
      vbeln: '46620083',
      ruta: 'YU2000',
      fecha_creacion: '06.04.2026',
      cliente: {
        codigo: '8000057509',
        nombre: 'Ctro. Armenia-2400',
        direccion: 'CR 6 # 6-60',
        ciudad: 'ARMENIA-QUINDIO',
        region: '63',
      },
    },
    {
      vbeln: '46620280',
      ruta: 'YU0205',
      fecha_creacion: '07.04.2026',
      cliente: {
        codigo: '2000406123',
        nombre: 'ROSA MALAVE',
        direccion: 'LA GABRIELA MESTIZAL',
        ciudad: 'BUGALAGRANDE',
        region: '76',
      },
    },
  ],
};

function normalizarRespuestaApi(json) {
  if (!json || json.success === false) return null;
  if (json.existe === false) return null;
  if (!json.transporte) return null;
  const raw = json.entregas || [];
  const transporteRaw = json.transporte;
  return {
    transporte: mapTransporteVista(transporteRaw),
    transporteRaw,
    totalEntregas: json.total_entregas ?? raw.length,
    entregas: raw.map((e) => mapEntregaListaItem(e, transporteRaw)),
    entregasRaw: raw,
  };
}

async function consultarTransporteMock(numero) {
  const tk = String(numero).trim();
  if (MOCK_TRANSPORTE.transporte.tknum !== tk && tk !== '1000132330') {
    return null;
  }
  return normalizarRespuestaApi(MOCK_TRANSPORTE);
}

async function consultarTransporteReal(numero) {
  const base = config.transportes.baseUrl.replace(/\/$/, '');
  const url = `${base}/${encodeURIComponent(String(numero).trim())}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.transportes.timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...entregasApiReadHeaders(),
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.status === 404) return null;

    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const msg =
        res.status === 401
          ? mensajeError401Entregas(res.status, json)
          : json?.message || json?.error || `API transportes respondió ${res.status}`;
      throw Object.assign(new Error(msg), { status: res.status >= 500 ? 502 : res.status });
    }

    return normalizarRespuestaApi(json);
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      throw Object.assign(new Error('Tiempo de espera agotado al consultar transportes'), {
        status: 504,
      });
    }
    if (err.status) throw err;
    throw Object.assign(
      new Error('No se pudo conectar con el servicio de transportes. Verifique red o URL.'),
      { status: 502 }
    );
  }
}

export async function consultarTransporte(numero) {
  const normalizado = String(numero).trim();
  if (!normalizado) {
    throw Object.assign(new Error('Número de transporte requerido'), { status: 400 });
  }

  if (config.transportes.useMock) {
    return consultarTransporteMock(normalizado);
  }
  return consultarTransporteReal(normalizado);
}
