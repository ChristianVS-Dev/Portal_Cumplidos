/** Lee el enlace de un solo uso y lo saca de la barra de dirección. No lo guarda. */
function consumirParametro(nombre) {
  if (typeof window === 'undefined') return '';
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
  const paramsHash = new URLSearchParams(hash);
  const paramsQuery = new URLSearchParams(window.location.search);
  const token = paramsHash.get(nombre) || paramsQuery.get(nombre) || '';
  if (!token) return '';

  paramsHash.delete(nombre);
  paramsQuery.delete(nombre);
  const query = paramsQuery.toString();
  const resto = paramsHash.toString();
  const next = `${window.location.pathname}${query ? `?${query}` : ''}${resto ? `#${resto}` : ''}`;
  window.history.replaceState({}, '', next);
  return token;
}

export function consumirTokenRestablecer() {
  return consumirParametro('restablecer');
}

export function consumirTokenConfirmar() {
  return consumirParametro('confirmar');
}
