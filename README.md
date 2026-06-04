# Portal de Cumplidos — Grupo Decor

Portal web para conductores: consulta de entregas, adjuntos, registro de cumplido exitoso o entrega fallida (no contestó), y envío de evidencias a la API de entregas/SAP.

Este documento explica **cómo funcionan las variables de entorno** y **cómo poner el proyecto en marcha en local y en el servidor**.

---

## Arquitectura de configuración (variables “globales”)

No hay un único archivo de “variables globales” en código: la configuración se lee desde **variables de entorno** (`process.env` en Node, `import.meta.env` en el front con prefijo `VITE_`).

### Tres capas que debe conocer

| Archivo | Quién lo usa | Rol |
|---------|----------------|-----|
| **`.env.docker`** | Fuente maestra del equipo | Plantilla con **todos** los valores del stack (MySQL, APIs, clave del portal, puertos). **Edite este archivo** al desplegar o cambiar entorno. |
| **`.env`** (raíz) | Docker Compose | Se genera con `npm run sync:env` (copia `.env.docker` → `.env`). Compose sustituye `${VAR}` en `docker-compose.yml`. |
| **`backend/.env`** | API en local sin Docker | Solo cuando ejecuta `npm run dev:api` en su máquina. **No** lo usa el contenedor `api` (este usa `.env.docker` vía `env_file`). |
| **`frontend/.env`** (opcional) | Front en local sin Docker | Variables `VITE_*` para `npm run dev:web`. En Docker dev/prod se inyectan por compose o build. |

```text
.env.docker  ──sync:env──►  .env  ──►  docker compose (mysql, api, web)
                                │
backend/.env  ──────────────────┴──►  npm run dev:api (local)
frontend/.env ─────────────────────►  npm run dev:web (local)
```

### Backend: lectura centralizada

Todas las variables del API se normalizan en `backend/src/config/index.js` (carga `dotenv` al arrancar). Ejemplos:

- `PORTAL_API_KEY` → seguridad del portal (cabecera `X-Portal-Key`).
- `ENTREGAS_API_BASE_URL`, `TRANSPORTES_API_BASE_URL` → APIs externas.
- `ENTREGAS_API_TOKEN` vacío → reutiliza `PORTAL_API_KEY`.
- `SAP_USE_MOCK=false` → envío real del ZIP a `POST .../adjuntos`.
- `PERSISTIR_CUMPLIDOS_MYSQL=true` → guarda borradores y cumplidos en MySQL.

### Frontend: solo variables `VITE_*`

Vite **incrusta en el bundle** las variables que empiezan por `VITE_` en tiempo de **build** (producción) o las pasa en runtime en **dev**.

| Variable | Uso |
|----------|-----|
| `VITE_API_URL` | Base del API (por defecto `/api/v1`; nginx en Docker hace proxy a `api:3001`). |
| `VITE_PORTAL_API_KEY` | Debe ser **igual** que `PORTAL_API_KEY` del backend. Se envía en cada petición como `X-Portal-Key`. |
| `VITE_API_PROXY_TARGET` | Solo dev Docker: destino del proxy Vite (`http://api:3001`). |
| `VITE_BRAND_LOGO` | Opcional: ruta del logo en `public/`. |

**Importante:** si cambia `PORTAL_API_KEY` en producción, debe **reconstruir** el contenedor `web` (`docker compose build web`) para que el front reciba el nuevo `VITE_PORTAL_API_KEY`.

### Sincronización antes de Docker

Siempre que cambie `.env.docker` y vaya a usar Compose:

```bash
npm run sync:env
```

Esto actualiza `.env` en la raíz para que `${PORTAL_API_KEY}`, `WEB_HOST_PORT`, etc. se apliquen al levantar contenedores.

---

## Variables principales (referencia rápida)

### Portal y red

| Variable | Descripción |
|----------|-------------|
| `WEB_HOST_PORT` | Puerto en el host para abrir el portal (ej. `19080` → `http://localhost:19080`). |
| `CORS_ORIGIN` | Orígenes permitidos por el API (URL del front; en servidor use la URL pública). |
| `PORTAL_API_KEY` | Clave compartida API + front. En producción: valor largo y aleatorio. |

### MySQL

| Variable | Descripción |
|----------|-------------|
| `MYSQL_ROOT_PASSWORD` | Root del contenedor MySQL. |
| `MYSQL_USER` / `MYSQL_PASSWORD` / `MYSQL_DATABASE` | Usuario de aplicación. |
| `MYSQL_HOST` | En Docker: `mysql`. En local: `localhost`. |
| `MYSQL_PORT` | Docker expone MySQL en el host como `127.0.0.1:3307` → dentro del contenedor `3306`. |
| `MYSQL_AUTO_MIGRATE` | `true` (default en compose): al arrancar el API crea tablas y aplica `backend/sql/migrations/*.sql`. |

### APIs externas y SAP

| Variable | Descripción |
|----------|-------------|
| `ENTREGAS_API_ENABLED` | `true` para consultar entregas por VBELN. |
| `ENTREGAS_API_BASE_URL` | Base, ej. `http://10.10.10.5:8100/api/entregas`. |
| `ENTREGAS_USE_MOCK` | `true` si el servidor **no** alcanza la IP de entregas (pruebas). |
| `ENTREGAS_API_TOKEN` | Token Bearer; vacío = usa `PORTAL_API_KEY`. |
| `ENTREGAS_API_SEND_TOKEN_ON_READ` | `true` si el GET de consulta también exige token. |
| `TRANSPORTES_*` | Igual patrón para transportes por TKNUM. |
| `SAP_USE_MOCK` | `false` para enviar el ZIP real a adjuntos SAP. |
| `PERSISTIR_CUMPLIDOS_MYSQL` | `true` obligatorio para registrar cumplidos y adjuntos. |

### Otros

| Variable | Descripción |
|----------|-------------|
| `SOPORTE_EMAIL` | Correo mostrado en reportes de sin conexión. |
| `METRICAS_USE_DB` | `true` para métricas desde MySQL; si no, ceros. |
| `UPLOAD_DIR` | Carpeta de adjuntos (en Docker: volumen `/app/uploads`). |

Plantillas detalladas: `backend/.env.example`, `frontend/.env.example`.

---

## Requisitos

- **Docker Desktop** (recomendado para local y servidor), o
- **Node.js 22+** y **MySQL 8** si corre API/front sin contenedores.
- Acceso de red desde el servidor API a las URLs de entregas/transportes (ej. `10.10.10.5:8100`).

---

## Puesta en marcha en **local** (desarrollo)

### Opción A — Todo con Docker (recomendada)

1. Clonar el repositorio y entrar a la carpeta del proyecto.
2. Ajustar **`.env.docker`**:
   - Si su PC **no** llega a `10.10.10.5`, ponga `ENTREGAS_USE_MOCK=true` y `TRANSPORTES_USE_MOCK=true`.
   - Deje `PERSISTIR_CUMPLIDOS_MYSQL=true` para probar registro completo.
   - Defina `PORTAL_API_KEY` (puede usar la de ejemplo solo en dev).
3. Instalar dependencias y levantar stack con hot-reload en el front:

```bash
npm run install:all
npm run docker:dev:all
```

4. Abrir el portal: **http://localhost:19080** (o el puerto de `WEB_HOST_PORT`).

Comandos útiles:

```bash
npm run docker:logs          # logs de todos los servicios
npm run docker:api:restart   # reinicia solo API (tras cambiar .env.docker)
npm run docker:web:restart   # reinicia solo front dev
npm run docker:dev:down      # detiene contenedores
```

MySQL local desde el host: `127.0.0.1:3307`, base `portal_cumplidos`, usuario según `.env.docker`.

### Opción B — API y front en Node (sin Docker)

1. Tener MySQL corriendo y crear la base `portal_cumplidos`.
2. Copiar y editar `backend/.env` (ver `backend/.env.example`). Añadir:

```env
PORTAL_API_KEY=su-clave-de-desarrollo
PERSISTIR_CUMPLIDOS_MYSQL=true
MYSQL_HOST=localhost
MYSQL_PORT=3306
```

3. En `frontend/.env`:

```env
VITE_API_URL=http://localhost:3001/api/v1
VITE_PORTAL_API_KEY=su-clave-de-desarrollo
```

(La clave debe ser **idéntica** en backend y front.)

4. En **dos terminales**:

```bash
npm run install:all
npm run dev:api    # terminal 1 → http://localhost:3001
npm run dev:web    # terminal 2 → http://localhost:5173
```

5. Inicializar tablas (si no arrancó migración automática):

```bash
npm run db:init
```

---

## Puesta en marcha en **servidor** (sitio / producción)

Flujo típico al subir el desarrollo al servidor:

### 1. Preparar el servidor

- Instalar **Docker** y **Docker Compose**.
- Abrir en firewall solo el puerto del portal (`WEB_HOST_PORT`, ej. `19080` o `80`/`443` detrás de un reverse proxy).
- **No** exponer MySQL a internet; el compose ya publica MySQL solo en `127.0.0.1:3307` del host.

### 2. Configurar entorno

En el servidor, editar **`.env.docker`** (no subir claves reales al repositorio):

```env
WEB_HOST_PORT=19080
# Ver sección 5.1 para ejemplo completo con dominio real
CORS_ORIGIN=https://portal-cumplidos.grupodecor.com

PORTAL_API_KEY=<clave-larga-aleatoria-generada-por-TI>

PERSISTIR_CUMPLIDOS_MYSQL=true
ENTREGAS_USE_MOCK=false
TRANSPORTES_USE_MOCK=false
ENTREGAS_API_BASE_URL=http://10.10.10.5:8100/api/entregas
TRANSPORTES_API_BASE_URL=http://10.10.10.5:8100/api/transportes
SAP_USE_MOCK=false

MYSQL_ROOT_PASSWORD=<password-fuerte>
MYSQL_PASSWORD=<password-fuerte>
```

Si la API de entregas usa otro token distinto al del portal:

```env
ENTREGAS_API_TOKEN=<token-entregado-por-TI>
```

### 3. Sincronizar y levantar producción

```bash
npm run sync:env
npm run docker:up
```

`docker:up` usa solo `docker-compose.yml` (front **compilado** con nginx, sin hot-reload).

Verificar:

```bash
docker compose ps
docker compose logs -f api
```

Debe aparecer en logs del API algo como: `Tablas verificadas en portal_cumplidos ... migración`.

### 4. Tras cada cambio de configuración

| Cambio | Acción |
|--------|--------|
| Variables del **API** (`.env.docker`) | `npm run sync:env` y `npm run docker:api:restart` |
| `PORTAL_API_KEY` o build del front | `npm run sync:env` y `docker compose up -d --build web` |
| Código nuevo | `docker compose up -d --build` o `npm run docker:up` |

### 5. HTTPS y dominio (recomendado)

Delante del contenedor `web` suele ir **nginx**, **Traefik** o **IIS** en el **servidor host** como proxy inverso:

- Termina TLS (`https://...`).
- Reenvía tráfico a `http://127.0.0.1:19080` (valor de `WEB_HOST_PORT`).
- `CORS_ORIGIN` debe ser **exactamente** la URL que el conductor abre en el navegador.

### 5.1 Ejemplo concreto: `https://portal-cumplidos.grupodecor.com`

Escenario típico en Grupo Decor:

| Elemento | Valor de ejemplo |
|----------|------------------|
| Dominio público | `https://portal-cumplidos.grupodecor.com` |
| Servidor Windows/Linux | `srv-logistica-01` (IP interna `10.20.30.15`) |
| Docker en el host | Portal escuchando solo en localhost `19080` |
| APIs SAP/entregas | `http://10.10.10.5:8100` (red interna, no expuesta a internet) |

```text
Conductor (celular/PC)
        │
        ▼  HTTPS :443
┌───────────────────────────────────────┐
│  Nginx en srv-logistica-01 (host)      │
│  portal-cumplidos.grupodecor.com       │
└───────────────────────────────────────┘
        │  proxy_pass http://127.0.0.1:19080
        ▼
┌───────────────────────────────────────┐
│  Docker: portal_cumplidos_web :80      │
│    /        → React (build)            │
│    /api/    → portal_cumplidos_api:3001│
└───────────────────────────────────────┘
        │
        ├──► mysql (127.0.0.1:3307, solo host)
        └──► 10.10.10.5:8100 (entregas + transportes + adjuntos)
```

#### `.env.docker` en el servidor (ejemplo listo para copiar y ajustar claves)

Ruta en el servidor: `/opt/portal-cumplidos/.env.docker`

```env
# URL que verá el conductor (debe coincidir con CORS y con el certificado HTTPS)
WEB_HOST_PORT=19080
CORS_ORIGIN=https://portal-cumplidos.grupodecor.com

# Clave compartida API + front (generar una nueva en producción; no reutilizar la de dev)
PORTAL_API_KEY=a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456

PERSISTIR_CUMPLIDOS_MYSQL=true
MYSQL_ROOT_PASSWORD=Root_GD_2026_Secure!
MYSQL_USER=portal_user
MYSQL_PASSWORD=Portal_GD_2026_Secure!
MYSQL_DATABASE=portal_cumplidos

ENTREGAS_API_ENABLED=true
ENTREGAS_USE_MOCK=false
ENTREGAS_API_BASE_URL=http://10.10.10.5:8100/api/entregas
ENTREGAS_API_TOKEN=
ENTREGAS_API_SEND_TOKEN_ON_READ=true
ENTREGAS_TIMEOUT_MS=20000

TRANSPORTES_ENABLED=true
TRANSPORTES_USE_MOCK=false
TRANSPORTES_API_BASE_URL=http://10.10.10.5:8100/api/transportes
TRANSPORTES_TIMEOUT_MS=20000

SAP_USE_MOCK=false
SOPORTE_EMAIL=soporte.logistica@grupodecor.com
```

Comandos en el servidor (primera vez):

```bash
cd /opt/portal-cumplidos
git pull   # o descomprimir el artefacto desplegado
npm run install:all
npm run sync:env
npm run docker:up
```

El conductor abre: **https://portal-cumplidos.grupodecor.com**  
(No hace falta poner `:19080` en la URL si el proxy del host escucha en 443.)

#### Nginx en el host (fuera de Docker)

Archivo sugerido: `/etc/nginx/sites-available/portal-cumplidos.conf`

```nginx
server {
    listen 80;
    server_name portal-cumplidos.grupodecor.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name portal-cumplidos.grupodecor.com;

    ssl_certificate     /etc/ssl/grupodecor/portal-cumplidos.crt;
    ssl_certificate_key /etc/ssl/grupodecor/portal-cumplidos.key;

    client_max_body_size 12M;

    location / {
        proxy_pass http://127.0.0.1:19080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
```

Activar sitio y recargar:

```bash
sudo ln -s /etc/nginx/sites-available/portal-cumplidos.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

> El contenedor `web` ya hace proxy de `/api/` hacia el API. El nginx del **host** solo reenvía todo el sitio al puerto `19080`; no hace falta rutear `/api` por separado en el host.

#### DNS (registro que pide infraestructura)

| Tipo | Nombre | Valor |
|------|--------|--------|
| A o CNAME | `portal-cumplidos` | IP pública del servidor `srv-logistica-01` (o balanceador) |

#### Comprobar que todo responde

```bash
# Desde el servidor
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:19080/
curl -s http://127.0.0.1:19080/api/v1/health

# Desde cualquier PC con DNS ya propagado
curl -s -o /dev/null -w "%{http_code}" https://portal-cumplidos.grupodecor.com/
```

En el navegador: abrir el portal, consultar una entrega de prueba y revisar logs:

```bash
docker compose logs -f api
```

#### Local vs producción (misma app, distinto dominio)

| Entorno | URL del portal | `CORS_ORIGIN` en `.env.docker` |
|---------|----------------|----------------------------------|
| Desarrollo Docker | http://localhost:19080 | `http://localhost:19080` |
| Dev sin Docker | http://localhost:5173 | `http://localhost:5173` |
| Producción | https://portal-cumplidos.grupodecor.com | `https://portal-cumplidos.grupodecor.com` |

Si en producción cambia el dominio o la clave `PORTAL_API_KEY`, ejecutar siempre:

```bash
npm run sync:env
docker compose up -d --build web api
```

### 6. Checklist producción

- [ ] `PORTAL_API_KEY` definida y **misma** en build del front (`VITE_PORTAL_API_KEY`).
- [ ] `SAP_USE_MOCK=false` si deben enviarse adjuntos reales.
- [ ] `PERSISTIR_CUMPLIDOS_MYSQL=true`.
- [ ] `CORS_ORIGIN` coincide con la URL que usa el navegador.
- [ ] El servidor API alcanza `ENTREGAS_API_BASE_URL` y `TRANSPORTES_API_BASE_URL`.
- [ ] Contraseñas MySQL distintas a las de ejemplo.
- [ ] Volúmenes Docker `mysql_data` y `uploads_data` con respaldo periódico.

---

## Estructura de servicios (Docker)

| Servicio | Contenedor | Puerto host | Notas |
|----------|------------|-------------|--------|
| `mysql` | `portal_cumplidos_mysql` | `127.0.0.1:3307` | Init con `backend/sql/tables.sql` en primer arranque. |
| `api` | `portal_cumplidos_api` | interno `3001` | Migraciones automáticas si `MYSQL_AUTO_MIGRATE=true`. |
| `web` | `portal_cumplidos_web` | `WEB_HOST_PORT` → 80 (prod) o 5173 (dev) | Prod: nginx + proxy `/api` → `api:3001`. |

---

## Migraciones de base de datos

- **Instalación nueva:** `tables.sql` al crear el volumen MySQL + migraciones al iniciar el API.
- **Base ya existente:** el API ejecuta en orden `backend/sql/migrations/001_*.sql`, `002_*.sql`, … (idempotentes donde aplica).
- Desactivar auto-migración: `MYSQL_AUTO_MIGRATE=false` y aplicar SQL manualmente.

---

## Seguridad y buenas prácticas

- **No** commitear `.env`, `.env.docker` con claves reales ni `backend/.env` con secretos.
- `PORTAL_API_KEY` protege el API frente a uso casual; no sustituye login de usuario individual.
- En producción, `NODE_ENV=production` en el contenedor `api` activa avisos en consola si faltan claves o hay passwords débiles (`assertProductionSecurity`).

---

## Scripts npm (raíz)

| Script | Descripción |
|--------|-------------|
| `npm run install:all` | Instala dependencias backend y frontend. |
| `npm run sync:env` | Copia `.env.docker` → `.env`. |
| `npm run docker:dev:all` | MySQL + API + front Vite (desarrollo). |
| `npm run docker:up` | Stack producción (build estático + nginx). |
| `npm run docker:down` | Detiene contenedores. |
| `npm run dev:api` / `dev:web` | Desarrollo sin Docker (dos terminales). |
| `npm run db:init` | Crea tablas manualmente (local). |

---

## Solución de problemas frecuentes

| Síntoma | Revisar |
|---------|---------|
| `401` o “clave inválida” | `PORTAL_API_KEY` (API) = `VITE_PORTAL_API_KEY` (front); reconstruir `web` si cambió. |
| CORS en navegador | `CORS_ORIGIN` debe incluir la URL exacta del portal (protocolo + host + puerto). |
| No guarda cumplidos | `PERSISTIR_CUMPLIDOS_MYSQL=true` y API conectado a MySQL. |
| Adjuntos no llegan a SAP | `SAP_USE_MOCK=false`, token en `ENTREGAS_API_TOKEN` o `PORTAL_API_KEY`, red hacia `ENTREGAS_API_BASE_URL`. |
| Mock de entregas en servidor | `ENTREGAS_USE_MOCK=true` — desactivar en producción real. |
| Columna desconocida en MySQL | Reiniciar API con `MYSQL_AUTO_MIGRATE=true` o ejecutar migraciones en `backend/sql/migrations/`. |

---

## Documentación adicional

- `portal_cumplidos_doc.md` — detalle funcional del portal.
- `backend/.env.example` — listado completo de variables del API.
- `frontend/.env.example` — variables del cliente Vite.
