export function normalizarCedula(valor) {
  const cedula = String(valor || '').replace(/\D/g, '');
  return /^[0-9]{5,15}$/.test(cedula) ? cedula : '';
}

export function normalizarCodigoTransportista(valor) {
  const codigo = String(valor || '').replace(/\D/g, '');
  return /^[0-9]{4,12}$/.test(codigo) ? codigo : '';
}

export function normalizarPlaca(valor) {
  const placa = String(valor || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return /^[A-Z0-9]{4,10}$/.test(placa) ? placa : '';
}

export function validarContrasena(valor) {
  const password = String(valor || '');
  if (password.length < 8 || password.length > 72) return false;
  return /[A-Za-z]/.test(password) && /[0-9]/.test(password);
}

/** Correo vacío, válido en minúsculas, o null si el texto no sirve. */
export function normalizarEmail(valor) {
  const email = String(valor || '').trim().toLowerCase();
  if (!email) return '';
  if (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

/** propia, ajena o desconocida cuando el transporte no trae placa ni cédula. */
export function pertenenciaEntrega(acceso, transporte) {
  const placa = normalizarPlaca(transporte?.placa || transporte?.placaAsignada || transporte?.placaSap);
  const cedula = normalizarCedula(
    transporte?.conductor?.documento ||
      transporte?.conductor?.cedula ||
      transporte?.documentoConductor
  );
  if (!acceso?.cedula || !acceso?.placa) return 'ajena';
  if (!placa && !cedula) return 'desconocida';
  if (placa && placa !== acceso.placa) return 'ajena';
  if (cedula && cedula !== acceso.cedula) return 'ajena';
  return 'propia';
}

/** La entrega solo se abre si la placa y, cuando viene, la cédula son las de la sesión. */
export function transporteDelConductor(acceso, transporte) {
  return pertenenciaEntrega(acceso, transporte) === 'propia';
}

export function fechaHoyBogota(fecha = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(fecha);
}
