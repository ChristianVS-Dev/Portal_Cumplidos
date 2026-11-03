import { useEffect, useRef, useState } from 'react';
import { Map, Marker, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { consultarRutaEntrega } from '../api/client.js';

setWorkerUrl(workerUrl);

const ESTILO = 'https://tiles.openfreemap.org/styles/liberty';

function textoDuracion(segundos) {
  const minutos = Math.max(1, Math.round(Number(segundos) / 60));
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto ? `${horas} h ${resto} min` : `${horas} h`;
}

function textoDistancia(metros) {
  const n = Number(metros) || 0;
  if (n < 1000) return `${n} m`;
  return `${(n / 1000).toFixed(1)} km`;
}

function pedirUbicacion() {
  if (!navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (posicion) => resolve({ lat: posicion.coords.latitude, lng: posicion.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  });
}

function limitesDe(puntos) {
  const lngs = puntos.map((punto) => punto[0]);
  const lats = puntos.map((punto) => punto[1]);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

export default function MapaRuta({ vbeln }) {
  const caja = useRef(null);
  const mapa = useRef(null);
  const marcas = useRef([]);
  const [datos, setDatos] = useState(null);
  const [aviso, setAviso] = useState('Buscando su ubicación y la dirección del cliente...');
  const [error, setError] = useState('');

  useEffect(() => {
    let vivo = true;
    setDatos(null);
    setError('');
    setAviso('Buscando su ubicación y la dirección del cliente...');
    (async () => {
      const origen = await pedirUbicacion();
      if (!vivo) return;
      try {
        const res = await consultarRutaEntrega(vbeln, origen);
        if (!vivo) return;
        setDatos(res.data);
        if (!origen) {
          setAviso('Permita la ubicación del celular para trazar la ruta desde donde está.');
        } else if (!res.data?.trayectoria) {
          setAviso('Se ubicó el cliente, pero no se pudo trazar el camino por las vías.');
        } else {
          setAviso('');
        }
      } catch (err) {
        if (vivo) setError(err.message || 'No se pudo mostrar el mapa.');
      }
    })();
    return () => {
      vivo = false;
    };
  }, [vbeln]);

  useEffect(() => {
    if (!datos?.destino || !caja.current) return undefined;
    const destino = [datos.destino.lng, datos.destino.lat];
    const mapaNuevo = new Map({
      container: caja.current,
      style: ESTILO,
      center: destino,
      zoom: 12,
      attributionControl: true,
    });
    mapaNuevo.scrollZoom.disable();
    mapa.current = mapaNuevo;

    const dibujar = () => {
      marcas.current.forEach((marca) => marca.remove());
      marcas.current = [];
      const puntos = [destino];
      marcas.current.push(new Marker({ color: '#e53935' }).setLngLat(destino).addTo(mapaNuevo));
      if (datos.origen) {
        const origen = [datos.origen.lng, datos.origen.lat];
        puntos.push(origen);
        marcas.current.push(new Marker({ color: '#455a64' }).setLngLat(origen).addTo(mapaNuevo));
      }
      const trayectoria = (datos.trayectoria || []).map(([lat, lng]) => [lng, lat]);
      if (trayectoria.length > 1) {
        puntos.push(...trayectoria);
        if (mapaNuevo.getSource('ruta')) {
          mapaNuevo.getSource('ruta').setData({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: trayectoria },
          });
        } else {
          mapaNuevo.addSource('ruta', {
            type: 'geojson',
            data: { type: 'Feature', geometry: { type: 'LineString', coordinates: trayectoria } },
          });
          mapaNuevo.addLayer({
            id: 'ruta',
            type: 'line',
            source: 'ruta',
            paint: { 'line-color': '#455a64', 'line-width': 5 },
          });
        }
      }
      const cajaLimites = limitesDe(puntos);
      const mismoPunto = cajaLimites[0][0] === cajaLimites[1][0] && cajaLimites[0][1] === cajaLimites[1][1];
      if (mismoPunto) mapaNuevo.jumpTo({ center: destino, zoom: 15 });
      else mapaNuevo.fitBounds(cajaLimites, { padding: 24, maxZoom: 16, duration: 0 });
    };

    mapaNuevo.on('load', dibujar);
    const ajustar = setTimeout(() => mapaNuevo.resize(), 250);
    return () => {
      clearTimeout(ajustar);
      mapaNuevo.remove();
      mapa.current = null;
      marcas.current = [];
    };
  }, [datos]);

  const resumen =
    datos?.distanciaMetros != null && datos?.duracionSegundos != null
      ? `${textoDistancia(datos.distanciaMetros)} · ${textoDuracion(datos.duracionSegundos)}`
      : '';

  return (
    <section className="mapa-ruta" aria-label="Ruta hacia el cliente">
      <div className="mapa-ruta-cabeza">
        <strong>Ruta al cliente</strong>
        {resumen && <span>{resumen}</span>}
      </div>
      {error ? <p className="mapa-ruta-aviso">{error}</p> : <div ref={caja} className="mapa-ruta-lienzo" />}
      {!error && (
        <p className="mapa-ruta-aviso">
          {aviso || datos?.destino?.direccion}
          {datos ? ' La llegada es aproximada: SAP trae la dirección, no una coordenada.' : ''}
        </p>
      )}
    </section>
  );
}
