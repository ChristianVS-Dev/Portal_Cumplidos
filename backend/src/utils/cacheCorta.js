/**
 * Caché en memoria de corta duración.
 * Guarda respuestas de SAP, nunca una decisión de acceso: cada petición
 * vuelve a comprobar la sesión contra el documento.
 */
export function crearCache({ ttlMs, max = 200 }) {
  const valores = new Map();
  const vuelos = new Map();
  const marcas = new Map();

  function copiar(valor) {
    if (valor == null || typeof valor !== 'object') return valor;
    return structuredClone(valor);
  }

  function leer(clave) {
    const item = valores.get(clave);
    if (!item) return undefined;
    if (item.expira <= Date.now()) {
      valores.delete(clave);
      return undefined;
    }
    valores.delete(clave);
    valores.set(clave, item);
    return copiar(item.valor);
  }

  function guardar(clave, marca, valor) {
    if ((marcas.get(clave) || 0) !== marca || valor == null) return;
    valores.set(clave, { valor: copiar(valor), expira: Date.now() + ttlMs });
    while (valores.size > max) {
      const antigua = valores.keys().next().value;
      valores.delete(antigua);
    }
  }

  function invalidar(clave) {
    const marca = (marcas.get(clave) || 0) + 1;
    marcas.set(clave, marca);
    valores.delete(clave);
    vuelos.delete(clave);
  }

  async function obtener(clave, cargar, { fresco = false } = {}) {
    if (fresco) invalidar(clave);
    else {
      const previo = leer(clave);
      if (previo !== undefined) return previo;
      const vuelo = vuelos.get(clave);
      if (vuelo) return vuelo.then((valor) => copiar(valor));
    }

    const marca = marcas.get(clave) || 0;
    const promesa = Promise.resolve()
      .then(cargar)
      .then((valor) => {
        guardar(clave, marca, valor);
        return valor;
      })
      .finally(() => {
        if (vuelos.get(clave) === promesa) vuelos.delete(clave);
      });

    if (!fresco) vuelos.set(clave, promesa);
    return promesa.then((valor) => copiar(valor));
  }

  return { obtener, invalidar };
}
