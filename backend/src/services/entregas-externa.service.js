import { config } from '../config/index.js';
import { entregasApiReadHeaders, mensajeError401Entregas } from '../utils/entregasApiClient.js';

const MOCK_ENTREGA = {
  success: true,
  existe: true,
  entrega: {
    vbeln: '46620280',
    tipo_entrega: 'ZMSD',
    fecha_creacion: '07.04.2026',
    cliente: {
      codigo: '2000406123',
      nombre: 'ROSA MALAVE',
      direccion: 'LA GABRIELA MESTIZAL',
      ciudad: 'BUGALAGRANDE',
      region: '76',
    },
  },
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
  items: [
    {
      posicion: '100',
      material: 'DR20GR051',
      descripcion: 'DURAPEGA PORCELANICO INTER GRIS X 25 KG',
      cantidad: '56.000',
      unidad: 'BAG',
      centro: '2000',
    },
  ],
};

function normalizar(json) {
  if (!json || json.success === false || json.existe === false) return null;
  if (!json.entrega?.vbeln || !json.transporte?.tknum) return null;
  return {
    entrega: json.entrega,
    transporte: json.transporte,
    items: json.items || [],
  };
}

async function consultarMock(vbeln) {
  const n = String(vbeln).trim();
  if (MOCK_ENTREGA.entrega.vbeln !== n && n !== '46620280' && n !== '46619929') return null;
  const payload = { ...MOCK_ENTREGA, entrega: { ...MOCK_ENTREGA.entrega, vbeln: n } };
  return normalizar(payload);
}

async function consultarReal(vbeln) {
  const base = config.entregasExterna.baseUrl.replace(/\/$/, '');
  const url = `${base}/${encodeURIComponent(String(vbeln).trim())}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.entregasExterna.timeoutMs);

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
          : json?.message || json?.error || `API entregas respondió ${res.status}`;
      throw Object.assign(new Error(msg), { status: res.status >= 500 ? 502 : res.status });
    }

    return normalizar(json);
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      throw Object.assign(new Error('Tiempo de espera agotado al consultar la entrega'), {
        status: 504,
      });
    }
    if (err.status) throw err;
    throw Object.assign(
      new Error('No se pudo conectar con el servicio de entregas. Verifique red o URL.'),
      { status: 502 }
    );
  }
}

/** API 1: GET /api/entregas/{vbeln} */
export async function consultarEntrega(vbeln) {
  const normalizado = String(vbeln).trim();
  if (!normalizado) {
    throw Object.assign(new Error('Número de entrega requerido'), { status: 400 });
  }

  if (config.entregasExterna.useMock) {
    return consultarMock(normalizado);
  }
  return consultarReal(normalizado);
}
