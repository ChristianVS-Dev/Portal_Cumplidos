import { useEffect, useState } from 'react';
import {
  confirmarCorreo,
  ingresarConductor,
  recuperarContrasena,
  reenviarConfirmacionCorreo,
  registrarConductor,
  restablecerContrasena,
} from '../api/client.js';
import '../styles/login.css';

const SLIDES = [
  { src: '/login/slide-planta.jpg', alt: 'Planta de Grupo Decor' },
  { src: '/login/slide-equipo.jpg', alt: 'Equipo en bodega' },
  { src: '/login/slide-bodega.jpg', alt: 'Montacargas en la bodega' },
];

function Campo({ id, label, ...props }) {
  const [foco, setFoco] = useState(false);
  return (
    <div className={`acceso-field${foco ? ' is-focused' : ''}${props.type === 'password' || props.type === 'text' && props['data-clave'] ? ' acceso-field--clave' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="acceso-input"
        onFocus={() => setFoco(true)}
        onBlur={() => setFoco(false)}
        {...props}
      />
    </div>
  );
}

const confirmacionUnica = new Map();

function pedirConfirmacion(token) {
  let pendiente = confirmacionUnica.get(token);
  if (!pendiente) {
    pendiente = confirmarCorreo({ token });
    confirmacionUnica.set(token, pendiente);
  }
  return pendiente;
}

function Clave({ id, label, value, onChange, visible, onToggle, autoComplete, disabled }) {
  const [foco, setFoco] = useState(false);
  return (
    <div className={`acceso-field acceso-field--clave${foco ? ' is-focused' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="acceso-input"
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        maxLength={72}
        disabled={disabled}
        onFocus={() => setFoco(true)}
        onBlur={() => setFoco(false)}
      />
      <button type="button" className="acceso-ver" onClick={onToggle}>
        {visible ? 'Ocultar' : 'Ver'}
      </button>
    </div>
  );
}

export default function LoginConductor({
  onAutenticado,
  onRestablecido,
  onConfirmado,
  tokenRestablecer = '',
  tokenConfirmar = '',
  avisoRed = '',
}) {
  const [vista, setVista] = useState(tokenRestablecer ? 'restablecer' : tokenConfirmar ? 'confirmar' : 'ingreso');
  const [slide, setSlide] = useState(0);
  const [rol, setRol] = useState('conductor');
  const [cedula, setCedula] = useState('');
  const [codigo, setCodigo] = useState('');
  const [placa, setPlaca] = useState('');
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [esContacto, setEsContacto] = useState(false);
  const [verClave, setVerClave] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [pendienteConfirmacion, setPendienteConfirmacion] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSlide((actual) => (actual + 1) % SLIDES.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, []);

  const limpiarCredenciales = () => {
    setCedula('');
    setCodigo('');
    setPlaca('');
    setNombre('');
    setEmail('');
    setPassword('');
    setConfirmar('');
    setEsContacto(false);
    setVerClave(false);
  };

  const cambiarRol = (siguiente) => {
    if (siguiente === rol || enviando) return;
    limpiarCredenciales();
    setRol(siguiente);
    setError('');
    setAviso('');
    setPendienteConfirmacion(false);
  };

  const ir = (destino) => {
    limpiarCredenciales();
    setVista(destino);
    setError('');
    setAviso('');
  };

  const recargarIngreso = () => {
    limpiarCredenciales();
    const destino = `${window.location.origin}${window.location.pathname}`;
    window.location.replace(destino);
  };

  const ejecutar = async (accion) => {
    setEnviando(true);
    setError('');
    try {
      await accion();
    } catch (err) {
      setError(err.message || 'No se pudo completar la solicitud');
    } finally {
      setEnviando(false);
    }
  };

  useEffect(() => {
    if (!tokenConfirmar) return undefined;
    let vivo = true;
    setVista('confirmar');
    setEnviando(true);
    pedirConfirmacion(tokenConfirmar)
      .then((res) => {
        if (!vivo) return;
        setAviso(res.mensaje);
        setVista('aviso');
        onConfirmado?.();
      })
      .catch((err) => {
        if (vivo) setError(err.message || 'No se pudo confirmar el correo');
      })
      .finally(() => {
        if (vivo) setEnviando(false);
      });
    return () => {
      vivo = false;
    };
  }, [tokenConfirmar, onConfirmado]);

  const onIngreso = (event) => {
    event.preventDefault();
    setPendienteConfirmacion(false);
    ejecutar(async () => {
      try {
        const res = await ingresarConductor(
          rol === 'empresa'
            ? { cedula: codigo, password, tipo: 'empresa' }
            : { cedula, placa, password, esContacto }
        );
        setPassword('');
        onAutenticado(res.data);
      } catch (err) {
        if (err.code === 'CORREO_SIN_CONFIRMAR') setPendienteConfirmacion(true);
        throw err;
      }
    });
  };

  const onReenviarConfirmacion = () => {
    ejecutar(async () => {
      const res = await reenviarConfirmacionCorreo(
        rol === 'empresa' ? { cedula: codigo, tipo: 'empresa' } : { cedula, placa }
      );
      setPendienteConfirmacion(false);
      setAviso(res.mensaje);
      setVista('aviso');
    });
  };

  const onRegistro = (event) => {
    event.preventDefault();
    if (password !== confirmar) {
      setError('Las contraseñas no coinciden');
      return;
    }
    const credenciales = rol === 'empresa'
      ? { tipo: 'empresa', codigo, nombre, email, password }
      : { cedula, placa, nombre, email, password, esContacto };
    ejecutar(async () => {
      const res = await registrarConductor(credenciales);
      limpiarCredenciales();
      setAviso(res.mensaje);
      setVista('aviso');
    });
  };

  const onRecuperar = (event) => {
    event.preventDefault();
    ejecutar(async () => {
      const res = await recuperarContrasena(
        rol === 'empresa' ? { cedula: codigo, tipo: 'empresa' } : { cedula, placa }
      );
      setAviso(res.mensaje);
      setVista('aviso');
    });
  };

  const onRestablecer = (event) => {
    event.preventDefault();
    if (password !== confirmar) {
      setError('Las contraseñas no coinciden');
      return;
    }
    ejecutar(async () => {
      const res = await restablecerContrasena({ token: tokenRestablecer, password });
      setPassword('');
      setConfirmar('');
      setAviso(res.mensaje);
      setVista('aviso');
      onRestablecido?.();
    });
  };

  const enlaceSensible = vista === 'restablecer' || vista === 'confirmar';

  const titulo = {
    ingreso: rol === 'empresa' ? 'Ingreso de empresa' : 'Inicia sesión',
    registro: 'Crear cuenta',
    recuperar: '¿Olvidó su contraseña?',
    restablecer: 'Nueva contraseña',
    confirmar: 'Confirmar correo',
    aviso: 'Listo',
  }[vista];

  const subtitulo = {
    ingreso: rol === 'empresa'
      ? 'Ingrese el código de transportista y la contraseña de la empresa.'
      : 'Un espacio diseñado para facilitar tu experiencia con nosotros.',
    registro: rol === 'empresa'
      ? 'Use el código de transportista. El NIT lo confirma el servicio de entregas; no se escribe aquí.'
      : 'Al crear la cuenta le enviaremos un correo. Confirme la dirección antes de ingresar.',
    recuperar: rol === 'empresa'
      ? 'Escriba el código de transportista. Si corresponde a una cuenta, el enlace llega al correo registrado.'
      : 'Escriba el documento y la placa. Si coinciden con una cuenta, el enlace llega al correo registrado.',
    restablecer: 'Elija una contraseña de 8 a 72 caracteres, con letras y números. El enlace solo sirve una vez.',
    confirmar: 'Estamos validando el enlace que recibió por correo.',
    aviso: 'Revise el mensaje y continúe cuando esté listo.',
  }[vista];

  return (
    <div className="acceso-root">
      <header className="acceso-header">
        <div className="acceso-marca">
          <img src="/images/logo_grupo.jpg" alt="Grupo Decor" />
          <span className="acceso-marca-linea" aria-hidden="true" />
          <span className="acceso-marca-nombre">Portal de <em>Cumplidos</em></span>
        </div>
        <nav className="acceso-nav">
          <button type="button" className={vista === 'ingreso' ? 'is-active' : ''} disabled={enlaceSensible && vista !== 'aviso'} onClick={() => (vista === 'aviso' ? recargarIngreso() : ir('ingreso'))}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
            </svg>
            <span className="acceso-label">Iniciar sesión</span>
          </button>
          <button type="button" className={vista === 'registro' ? 'is-active' : ''} disabled={enlaceSensible} onClick={() => ir('registro')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="9" cy="8" r="4" />
              <path d="M2 21c0-4 3.5-6 7-6s7 2 7 6" />
              <path d="M19 8v6M16 11h6" />
            </svg>
            <span className="acceso-label">Registrarse</span>
          </button>
        </nav>
      </header>

      <div className="acceso-stage">
        <div className="acceso-carousel">
          {SLIDES.map((item, index) => (
            <div className={`acceso-slide${index === slide ? ' is-active' : ''}`} key={item.src}>
              <img src={item.src} alt={item.alt} />
            </div>
          ))}
        </div>
        <div className="acceso-dots">
          {SLIDES.map((item, index) => (
            <button
              key={item.src}
              type="button"
              className={index === slide ? 'is-active' : ''}
              aria-label={`Diapositiva ${index + 1}`}
              onClick={() => setSlide(index)}
            />
          ))}
        </div>

        <div className="acceso-card-wrap">
          <div className="acceso-card">
            {vista !== 'restablecer' && vista !== 'confirmar' && vista !== 'aviso' && (
              <div className="acceso-rol" role="tablist" aria-label="Tipo de cuenta">
                <button type="button" role="tab" aria-selected={rol === 'conductor'} className={rol === 'conductor' ? 'is-active' : ''} onClick={() => cambiarRol('conductor')} disabled={enviando}>Conductor</button>
                <button type="button" role="tab" aria-selected={rol === 'empresa'} className={rol === 'empresa' ? 'is-active' : ''} onClick={() => cambiarRol('empresa')} disabled={enviando}>Empresa</button>
              </div>
            )}
            <h1>{titulo}</h1>
            <p className="acceso-sub">{subtitulo}</p>
            {(error || (vista === 'ingreso' && avisoRed)) && (
              <div className="acceso-alerta" role="alert">{error || avisoRed}</div>
            )}
            {enviando && vista === 'ingreso' && (
              <div className="acceso-carga" role="status" aria-live="polite">
                <span className="acceso-carga-giro" aria-hidden />
                <span>Consultando sus entregas. Este paso puede tardar unos segundos.</span>
              </div>
            )}
            {vista === 'aviso' && <div className="acceso-ok" role="status">{aviso}</div>}

            {vista === 'ingreso' && rol === 'empresa' && (
              <form onSubmit={onIngreso} autoComplete="off" noValidate>
                <Campo id="codigoEmpresa" label="Código de transportista" value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))} inputMode="numeric" autoComplete="off" placeholder="Ej: 800520" disabled={enviando} />
                <Clave id="claveEmpresa" label="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} visible={verClave} onToggle={() => setVerClave((v) => !v)} autoComplete="current-password" disabled={enviando} />
                <button className="acceso-submit" type="submit" disabled={enviando || !codigo.trim() || !password}>
                  {enviando ? 'Ingresando...' : 'Acceder'}
                </button>
                {pendienteConfirmacion && (
                  <button type="button" className="acceso-submit" onClick={onReenviarConfirmacion} disabled={enviando || !codigo.trim()}>
                    Reenviar confirmación
                  </button>
                )}
                <div className="acceso-links">
                  <div>
                    ¿Aún no tiene una cuenta?{' '}
                    <button type="button" onClick={() => ir('registro')}>Registrarse</button>
                  </div>
                  <button type="button" className="acceso-olvido" onClick={() => ir('recuperar')}>
                    ¿Olvidó su contraseña?
                  </button>
                </div>
              </form>
            )}

            {vista === 'ingreso' && rol === 'conductor' && (
              <form onSubmit={onIngreso} autoComplete="off" noValidate>
                <Campo
                  id="numDoc"
                  label="Número de documento"
                  value={cedula}
                  onChange={(e) => setCedula(e.target.value)}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="Ej: 1004567890"
                  disabled={enviando}
                />
                <Campo
                  id="placa"
                  label="Placa"
                  value={placa}
                  onChange={(e) => setPlaca(e.target.value.toUpperCase())}
                  autoComplete="off"
                  placeholder="Ej: ABC123"
                  disabled={enviando}
                />
                <Clave
                  id="clave"
                  label="Contraseña"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  visible={verClave}
                  onToggle={() => setVerClave((v) => !v)}
                  autoComplete="current-password"
                  disabled={enviando}
                />
                <label className="acceso-check">
                  <input
                    type="checkbox"
                    checked={esContacto}
                    onChange={(e) => setEsContacto(e.target.checked)}
                    disabled={enviando}
                  />
                  Soy contacto de cuenta
                </label>
                <button className="acceso-submit" type="submit" disabled={enviando}>
                  {enviando ? 'Ingresando...' : 'Acceder'}
                </button>
                {pendienteConfirmacion && (
                  <button type="button" className="acceso-submit" onClick={onReenviarConfirmacion} disabled={enviando || !cedula || !placa}>
                    Reenviar confirmación
                  </button>
                )}
                <div className="acceso-links">
                  <div>
                    ¿Aún no tiene una cuenta?{' '}
                    <button type="button" onClick={() => ir('registro')}>Registrarse</button>
                  </div>
                  <button type="button" className="acceso-olvido" onClick={() => ir('recuperar')}>
                    ¿Olvidó su contraseña?
                  </button>
                </div>
              </form>
            )}

            {vista === 'registro' && rol === 'empresa' && (
              <form onSubmit={onRegistro} autoComplete="off" noValidate>
                <Campo id="nombreEmpresa" label="Nombre del responsable" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" disabled={enviando} />
                <Campo id="codigoEmpresaReg" label="Código de transportista" value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))} inputMode="numeric" autoComplete="off" placeholder="Ej: 800520" disabled={enviando} />
                <Campo id="correoEmpresa" label="Correo" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" disabled={enviando} />
                <Clave id="claveEmpresaReg" label="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} visible={verClave} onToggle={() => setVerClave((v) => !v)} autoComplete="new-password" disabled={enviando} />
                <Clave id="claveEmpresaReg2" label="Confirmar contraseña" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} visible={verClave} onToggle={() => setVerClave((v) => !v)} autoComplete="new-password" disabled={enviando} />
                <p className="acceso-sub">Al registrarse consultamos el código. El nombre de la empresa y el NIT quedan los que devuelve el servicio.</p>
                <button className="acceso-submit" type="submit" disabled={enviando || !codigo.trim() || !nombre.trim() || !email.trim()}>
                  {enviando ? 'Verificando...' : 'Registrar empresa'}
                </button>
                <div className="acceso-links">
                  <button type="button" onClick={() => ir('ingreso')}>Ya tengo cuenta</button>
                </div>
              </form>
            )}

            {vista === 'registro' && rol === 'conductor' && (
              <form onSubmit={onRegistro} autoComplete="off" noValidate>
                <Campo id="nombre" label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" disabled={enviando} />
                <Campo id="numDocReg" label="Número de documento" value={cedula} onChange={(e) => setCedula(e.target.value)} inputMode="numeric" autoComplete="off" disabled={enviando} />
                <Campo id="placaReg" label="Placa" value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase())} autoComplete="off" disabled={enviando} />
                <Campo id="correo" label="Correo" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" disabled={enviando} />
                <Clave id="claveReg" label="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} visible={verClave} onToggle={() => setVerClave((v) => !v)} autoComplete="new-password" disabled={enviando} />
                <Clave id="claveReg2" label="Confirmar contraseña" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} visible={verClave} onToggle={() => setVerClave((v) => !v)} autoComplete="new-password" disabled={enviando} />
                <label className="acceso-check">
                  <input type="checkbox" checked={esContacto} onChange={(e) => setEsContacto(e.target.checked)} disabled={enviando} />
                  Soy contacto de cuenta
                </label>
                <button className="acceso-submit" type="submit" disabled={enviando}>
                  {enviando ? 'Enviando...' : 'Registrarse'}
                </button>
                <div className="acceso-links">
                  <button type="button" onClick={() => ir('ingreso')}>Ya tengo cuenta</button>
                </div>
              </form>
            )}

            {vista === 'confirmar' && enviando && (
              <div className="acceso-carga" role="status">
                <span className="acceso-carga-giro" aria-hidden />
                <span>Confirmando su correo...</span>
              </div>
            )}
            {vista === 'confirmar' && !enviando && (
              <div className="acceso-links">
                <button type="button" onClick={() => ir('ingreso')}>Volver al ingreso</button>
              </div>
            )}

            {vista === 'recuperar' && rol === 'empresa' && (
              <form onSubmit={onRecuperar} noValidate>
                <Campo id="codigoEmpresaRec" label="Código de transportista" value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))} inputMode="numeric" autoComplete="off" placeholder="Ej: 800520" disabled={enviando} />
                <p className="acceso-sub">No pedimos el correo aquí. El enlace sale al que quedó registrado y vence en 60 minutos.</p>
                <button className="acceso-submit" type="submit" disabled={enviando || !codigo.trim()}>
                  {enviando ? 'Enviando...' : 'Enviar enlace al correo'}
                </button>
                <div className="acceso-links">
                  <button type="button" className="acceso-olvido" onClick={() => ir('ingreso')}>Volver al ingreso</button>
                </div>
              </form>
            )}

            {vista === 'recuperar' && rol === 'conductor' && (
              <form onSubmit={onRecuperar} noValidate>
                <Campo id="numDocRec" label="Número de documento" value={cedula} onChange={(e) => setCedula(e.target.value)} inputMode="numeric" autoComplete="off" placeholder="Ej: 1004567890" disabled={enviando} />
                <Campo id="placaRec" label="Placa" value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase())} autoComplete="off" placeholder="Ej: ABC123" disabled={enviando} />
                <p className="acceso-sub">No pedimos el correo aquí. El enlace sale al que quedó registrado y vence en 60 minutos.</p>
                <button className="acceso-submit" type="submit" disabled={enviando || !cedula.trim() || !placa.trim()}>
                  {enviando ? 'Enviando...' : 'Enviar enlace al correo'}
                </button>
                <div className="acceso-links">
                  <button type="button" className="acceso-olvido" onClick={() => ir('ingreso')}>Volver al ingreso</button>
                </div>
              </form>
            )}

            {vista === 'restablecer' && (
              <form onSubmit={onRestablecer} noValidate>
                {!tokenRestablecer && (
                  <div className="acceso-alerta" role="alert">El enlace no es válido o ya se usó.</div>
                )}
                <Clave id="claveNueva" label="Nueva contraseña" value={password} onChange={(e) => setPassword(e.target.value)} visible={verClave} onToggle={() => setVerClave((v) => !v)} autoComplete="new-password" disabled={enviando || !tokenRestablecer} />
                <Clave id="claveNueva2" label="Confirmar contraseña" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} visible={verClave} onToggle={() => setVerClave((v) => !v)} autoComplete="new-password" disabled={enviando || !tokenRestablecer} />
                <button className="acceso-submit" type="submit" disabled={enviando || !tokenRestablecer}>
                  {enviando ? 'Guardando...' : 'Guardar contraseña'}
                </button>
                <div className="acceso-links">
                  <button type="button" className="acceso-olvido" onClick={() => ir('ingreso')}>Volver al ingreso</button>
                </div>
              </form>
            )}

            {vista === 'aviso' && (
              <div className="acceso-links">
                <button type="button" onClick={recargarIngreso}>Ir a iniciar sesión</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
