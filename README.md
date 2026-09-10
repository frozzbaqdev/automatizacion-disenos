# Frozz Diseños — Portal de solicitudes de diseño

Web app construida en **Google Apps Script** (HtmlService + servidor V8) que sirve como portal público para que empleados de Frozz Colombia soliciten trabajos de diseño, y como panel de gestión interno para que el equipo de diseño las revise, apruebe y finalice. Todo el dato de negocio vive en **Notion** (como base de datos), los adjuntos se guardan en **Google Drive** y las notificaciones se envían por **Gmail** (`MailApp`). El código se desarrolla localmente y se sincroniza con el proyecto de Apps Script vía **`clasp`**.

No hay backend propio ni base de datos propia: Apps Script actúa como pegamento entre el formulario web, la API de Notion, Drive y Gmail.

---

## 1. Para qué sirve

Cubre el ciclo de vida completo de una solicitud de diseño:

1. **Un empleado crea una solicitud** desde el portal público (`?page=` por defecto, `Index.html`): elige quién solicita, el cliente, tipo, clasificación, fecha límite, descripción y puede adjuntar hasta 5 archivos (≤10 MB c/u). Si la clasificación es *"Diseño ing de detalle"* debe además elegir una Orden de Trabajo del cliente.
2. El sistema genera un **ticket único** (`DISF######`), crea una página en la base de Notion **DISEÑOS**, crea una carpeta con ese nombre dentro de una carpeta raíz fija de Google Drive (unidad compartida) para los soportes, y **envía dos correos**: confirmación al solicitante y aviso interno al equipo de diseño con un enlace de gestión.
3. El solicitante puede **consultar el estado** de su ticket en cualquier momento desde la misma portada, buscando por número de ticket (vista pública muy limitada: no expone notas internas, prioridad, responsable ni documentos).
4. El equipo de diseño gestiona la solicitud desde un **enlace firmado** (`?page=gestionar&t=...&id=...&s=...`) que llega en el correo interno. Ese enlace es la única credencial de acceso (capability link, firmado con HMAC-SHA256) — no hay login.
5. El flujo de gestión avanza por **etapas** fijas: `Revisión → Aprobación → Desarrollo → Finalizada` (con una etapa especial `Rechazada` si no se aprueba). Cada transición valida en el servidor el estado real leído desde Notion (evita condiciones de carrera si dos personas gestionan a la vez) y dispara el correo correspondiente al solicitante (asignación de responsable, aprobado/rechazado, finalizado).

## 2. Arquitectura

```
┌─────────────────────────────┐        ┌──────────────────────────┐
│   Frontend (HtmlService)     │        │   Notion (fuente de datos)│
│   Index.html   → portal      │        │   - DISEÑOS (solicitudes) │
│   Gestionar.html → gestión   │        │   - PERSONAL              │
│   JavaScript.html            │◄──────►│   - CLIENTES (COMERCIAL)  │
│   JavaScriptGestion.html     │  REST  │   - ÓRDENES DE TRABAJO    │
│   Styles/EstilosGestion.html │  API   └──────────────────────────┘
│   Logo.html (PNG en base64)  │
└──────────────┬────────────────┘
               │ google.script.run (RPC cliente↔servidor)
               ▼
┌─────────────────────────────────────────────────────────────┐
│  Servidor Apps Script (V8), src/*.js                          │
│  Code.js          — doGet, funciones públicas (RPC), validación│
│  Notion.js        — capa de transporte HTTP genérica a Notion  │
│  NotionProps.js   — nombres de propiedad y vocabularios fijos  │
│  NotionCatalogos.js — lectura + cacheo de PERSONAL/CLIENTES/OT │
│  NotionDisenos.js — dominio de solicitudes, enlaces firmados,  │
│                      transiciones de etapa, bloqueo con Lock   │
│  Drive.js         — DriveApp: carpeta de soportes por ticket   │
│  Correo.js        — plantillas HTML + envío con MailApp        │
│  Errores.js       — log + alerta por correo de errores internos│
│  Config.js        — credenciales/config vía PropertiesService  │
└─────────┬──────────────────┬───────────────────┬──────────────┘
          │                  │                   │
          ▼                  ▼                   ▼
   UrlFetchApp        DriveApp (unidad       MailApp (Gmail de
   → api.notion.com    compartida)            la cuenta que
                                               despliega el script)
```

- **Sin frameworks de frontend**: HTML + CSS + JS vanilla, `google.script.run` como único canal cliente-servidor (no hay `fetch` a un backend propio).
- **Sin base de datos propia**: Notion es la única fuente de verdad. `CacheService` (6 h) cachea los catálogos de PERSONAL y CLIENTES para no golpear la API de Notion en cada carga del formulario.
- **Autenticación del panel de gestión**: no hay login de usuario. El acceso es por *capability link* — un enlace con ticket + pageId + firma HMAC (`SECRETO_ENLACES`). Quien tiene el enlace puede gestionar esa solicitud puntual; por eso el panel nunca se sirve con `XFrameOptionsMode.ALLOWALL` (a diferencia del portal público).
- **Concurrencia**: cada transición de etapa usa `LockService.getScriptLock()` y revalida el estado leído en fresco de Notion antes de escribir, para evitar que dos gestores pisen la misma solicitud.

## 3. Conexiones externas

| Servicio | Cómo se usa | Dónde |
|---|---|---|
| **Notion API** (`api.notion.com/v1`, versión `2022-06-28`) | Leer/escribir páginas y consultar bases de datos vía REST (`UrlFetchApp`), con reintento ante 429/5xx y paginación completa (`next_cursor`) | [Notion.js](src/Notion.js) |
| **Google Drive** | `DriveApp` nativo (no REST) — crea/reutiliza una carpeta por ticket dentro de una carpeta raíz fija en una unidad compartida, y sube adjuntos en base64 | [Drive.js](src/Drive.js) |
| **Gmail** | `MailApp.sendEmail` con plantilla HTML de tabla (compatible Outlook) y logo embebido por `cid` | [Correo.js](src/Correo.js) |
| **Google Apps Script Web App** | Hosting del HTML (`doGet`) y ejecución del servidor; el deployment expone una URL fija `/exec` | [Code.js](src/Code.js), [appsscript.json](src/appsscript.json) |

`oauthScopes` requeridos (`src/appsscript.json`): `script.external_request` (llamar a Notion), `drive` (DriveApp), `script.send_mail` (MailApp).

## 4. Datos que interactúan (bases de Notion)

Los nombres exactos de propiedad están centralizados en [NotionProps.js](src/NotionProps.js) — **ningún otro archivo debe usarlos como texto literal**, porque un `select`/`status` de Notion crea silenciosamente una opción nueva ante un typo en vez de fallar.

### Base DISEÑOS (`NOTION_DATABASE_ID`) — la solicitud
| Propiedad Notion | Tipo | Uso |
|---|---|---|
| `Nombre del proyecto` | title | Nombre del proyecto |
| `#TICKET` | rich_text | Ticket único `DISF######` |
| `SOLICITANTE` / `CLIENTE` / `RESPONSABLE` / `ORDEN DE TRABAJO` | relation | Relación a PERSONAL / CLIENTES / PERSONAL / ÓRDENES DE TRABAJO |
| `Correo solicitante` | email | Correo de contacto (del empleado o manual) |
| `Estado` | status | `Sin empezar` / `En curso` / `En pausa` / `Listo` |
| `Etapa` | select | `Revisión` / `Aprobación` / `Desarrollo` / `Finalizada` / `Rechazada` (interna) |
| `Prioridad` | select | `Urgente` / `Alta` / `Media` / `Baja` |
| `Tipo` | select | Complejidad de la solicitud |
| `Clasificación` | multi_select | `Diseño comercial` / `Diseño ing de detalle` |
| `APROBACION` | select | `APROBADO` / `RECHAZADO` |
| `Descripción solicitud` / `Notas` | rich_text | Descripción y bitácora de notas (troceada a <2000 chars/objeto) |
| `DOCUMENTOS SOPORTE` | url | Link a la carpeta de Drive del ticket |
| `GESTIONAR DISEÑO` | url | Enlace de gestión firmado |
| `Fecha recibido` / `Fecha inicio` / `Fecha limite de entrega` / `Fecha de entrega` | date | Fechas del ciclo de vida |

> ⚠️ Nunca escribir en `progreso` (fórmula), `Check` (botón), `Responsable` (people, legacy, colisiona en mayúsculas con `RESPONSABLE`), `Fecha tentativa de entrega` (queda siempre vacía) ni `ID` (unique_id autogenerado).

### Base PERSONAL (`NOTION_PERSONAL_DATABASE_ID`)
`Nombre` (title), `Correo corporativo` (email), `ESTADO` (solo se listan los `Vinculado`), `EQUIPO`, `cargo`.

### Base CLIENTES / COMERCIAL (`NOTION_CLIENTES_DATABASE_ID`)
`NOMBRE DE CLIENTE` (title), `#DOCUMENTO`, `CLIENTE_STATUS`, `CORREO`, `CIUDAD`, `TIPO DE DOCUMENTO`.

### Base ÓRDENES DE TRABAJO (`NOTION_ORDEN_TRABAJO_DATABASE_ID`)
`CLIENTES (COMERCIAL)` (relation al cliente), `OT`, `Servicio` — solo se consultan filtradas por cliente, sin cachear (dependen de la selección del formulario).

## 5. Estructura del repositorio

```
frozz-designs/
├─ src/                     # raíz del proyecto de Apps Script (rootDir en .clasp.json)
│  ├─ Code.js               # doGet + funciones RPC expuestas al cliente
│  ├─ Config.js             # credenciales/config vía PropertiesService (correr manualmente)
│  ├─ Notion.js             # transporte genérico HTTP hacia Notion
│  ├─ NotionProps.js        # nombres de propiedad Notion + vocabularios válidos
│  ├─ NotionCatalogos.js    # lectura + cache de PERSONAL/CLIENTES/ÓRDENES
│  ├─ NotionDisenos.js      # dominio de solicitudes, enlaces firmados, etapas
│  ├─ Drive.js              # carpetas de soportes por ticket
│  ├─ Correo.js             # plantillas de correo + envío
│  ├─ Errores.js            # log + alerta de errores internos
│  ├─ appsscript.json       # manifest de Apps Script (scopes, webapp, timezone)
│  ├─ Index.html            # portal público (crear / consultar solicitud)
│  ├─ Gestionar.html        # panel de gestión (acceso por enlace firmado)
│  ├─ JavaScript.html       # JS del portal público
│  ├─ JavaScriptGestion.html# JS del panel de gestión
│  ├─ Styles.html / EstilosGestion.html # CSS (tema claro/oscuro)
│  └─ Logo.html             # logo en base64 (se reutiliza en HTML y en correos)
├─ assets/                  # logos fuente (no se despliegan)
├─ .clasp.json              # scriptId + rootDir para clasp
├─ .env                     # NOTA: valores de referencia para pegar en configurarCredenciales() — Apps Script NO lee .env (no hay proceso Node en producción)
├─ package.json             # scripts npm que envuelven clasp
├─ CLAUDE.md                # instrucciones del proyecto para Claude Code
├─ .claude/, .mcp.json, .agents/ # configuración de Claude Code y skills (ver sección 8)
└─ skills-lock.json         # skills instalados (better-ui, frontend-design)
```

## 6. Requisitos previos

- **Node.js** y **npm** (para ejecutar `clasp` vía `npx`/scripts de `package.json`). Verificado con Node 24.
- **Cuenta de Google** con acceso de edición al proyecto de Apps Script y miembro de la unidad compartida de Drive donde vive la carpeta raíz de soportes.
- **`clasp`** (Command Line Apps Script Projects) autenticado contra esa cuenta de Google.
- **Integración de Notion** (token `ntn_...`) con acceso compartido a las 4 bases de datos (DISEÑOS, PERSONAL, CLIENTES, ÓRDENES DE TRABAJO).
- El **deployment de Apps Script ya debe existir** — el `package.json` de este repo apunta a un ID de deployment fijo (ver `npm run deploy`), así que normalmente solo necesitas acceso de edición al mismo script, no crear uno nuevo.

## 7. Guía paso a paso: clonar y poner en marcha

### 7.1. Clonar el repositorio
```powershell
git clone <url-del-repositorio> frozz-designs
cd frozz-designs
```

### 7.2. Instalar clasp
```powershell
npm install -g @google/clasp
```
(No hay `node_modules` de dependencias del proyecto — es puro Apps Script, `clasp` es la única herramienta externa.)

### 7.3. Autenticar clasp con Google
```powershell
clasp login
```
Abre el navegador y pide iniciar sesión con la cuenta de Google que tiene acceso al script y a la unidad compartida de Drive. Guarda el token en `~/.clasprc.json` (nunca se commitea — está en `.gitignore`).

### 7.4. Verificar el vínculo al proyecto de Apps Script
El repo ya trae [.clasp.json](.clasp.json) con el `scriptId` del proyecto existente y `"rootDir": "src"`. No hace falta `clasp create`; solo confirma que tu cuenta tiene acceso:
```powershell
npm run open
```
Esto abre el editor de Apps Script en el navegador (`clasp open-script`). Si da error de permisos, pide que te agreguen como editor del script.

### 7.5. Configurar credenciales y parámetros (una sola vez, desde el editor de Apps Script)
Estas funciones viven en [Config.js](src/Config.js) y **nunca se exponen al cliente** — se corren manualmente desde el editor web de Apps Script (Extensiones → Apps Script, o con `npm run open`), seleccionando la función en el desplegable y pulsando "Ejecutar":

```js
configurarCredenciales('ntn_xxx...', 'id-de-la-base-DISEÑOS');
configurarBasesAuxiliares('id-base-CLIENTES', 'id-base-PERSONAL');
configurarCredencialesOrdenTrabajo('id-base-ORDENES-DE-TRABAJO');
configurarUrlWebApp('https://script.google.com/macros/s/.../exec');
configurarSecretoEnlaces('un-secreto-largo-y-aleatorio');
configurarSecretoAutodiagnostico('otro-secreto-opcional');
```

- `configurarUrlWebApp` necesita la URL `/exec` del deployment — puedes obtenerla la primera vez con `npm run deploy` (ver 7.7) y luego volver a correr esta función con la URL real.
- `configurarSecretoEnlaces` es el secreto HMAC que firma los enlaces de gestión (`GESTIONAR DISEÑO`) — sin él, nada de gestión funciona.
- El archivo `.env` en la raíz del repo solo guarda `NOTION_TOKEN` y `NOTION_DATABASE_ID` como **referencia local para copiar/pegar** en `configurarCredenciales(...)`; Apps Script no lee `.env` (no corre en Node), así que ese archivo es puramente informativo y está en `.gitignore` — nunca lo subas al repo.

### 7.6. Ajustar valores hardcodeados específicos de la organización
Antes de reutilizar este proyecto para otro cliente/organización, revisa y ajusta:
- `DRIVE_CARPETA_RAIZ_ID_` en [Drive.js](src/Drive.js) — carpeta raíz de la unidad compartida donde se crean las carpetas por ticket.
- `CORREOS_NOTIFICACION_NUEVAS_SOLICITUDES_` en [Correo.js](src/Correo.js) y `CORREOS_NOTIFICACION_ERRORES_` en [Errores.js](src/Errores.js) — destinatarios fijos de avisos internos y alertas de error.

### 7.7. Publicar (push + deploy)
```powershell
npm run deploy
```
Este comando (definido en [package.json](package.json)) hace `clasp push --force` seguido de `clasp deploy -i <deploymentId-fijo>`, así que la URL `/exec` publicada **no cambia** entre despliegues. La primera vez que ejecutes esto, copia la URL que imprime y pégala con `configurarUrlWebApp(...)` (paso 7.5).

### 7.8. Probar
- Abre la URL `/exec` → debe cargar el portal (`Index.html`).
- Crea una solicitud de prueba y confirma que llega el correo de confirmación y el ticket queda en Notion.
- Desde el editor de Apps Script corre `verificarAccesoDrive()` ([Drive.js](src/Drive.js)) para validar que la cuenta tiene acceso de escritura a la carpeta raíz de Drive.

## 8. Configuración completa

### `PropertiesService` (Script Properties) — configurado vía [Config.js](src/Config.js)
| Clave | Se define con | Uso |
|---|---|---|
| `NOTION_TOKEN` | `configurarCredenciales` | Token de integración de Notion |
| `NOTION_DATABASE_ID` | `configurarCredenciales` | Base DISEÑOS |
| `NOTION_CLIENTES_DATABASE_ID` | `configurarBasesAuxiliares` | Base CLIENTES |
| `NOTION_PERSONAL_DATABASE_ID` | `configurarBasesAuxiliares` | Base PERSONAL |
| `NOTION_ORDEN_TRABAJO_DATABASE_ID` | `configurarCredencialesOrdenTrabajo` | Base ÓRDENES DE TRABAJO |
| `URL_WEB_APP` | `configurarUrlWebApp` | Base para construir enlaces de gestión |
| `SECRETO_ENLACES` | `configurarSecretoEnlaces` | Clave HMAC-SHA256 de los enlaces firmados |
| `SECRETO_SELFTEST` | `configurarSecretoAutodiagnostico` | Opcional, para autodiagnóstico |

### `src/appsscript.json` (manifest de Apps Script)
- `timeZone`: `America/Bogota`
- `runtimeVersion`: `V8`
- `webapp.executeAs`: `USER_DEPLOYING` (corre con los permisos de quien desplegó, no de quien visita)
- `webapp.access`: `ANYONE_ANONYMOUS` (portal público, sin login de Google)
- `oauthScopes`: `script.external_request`, `drive`, `script.send_mail`

### `.clasp.json`
- `scriptId`: id del proyecto de Apps Script vinculado.
- `rootDir`: `"src"` — solo lo que está dentro de `src/` se sincroniza.
- `scriptExtensions`/`htmlExtensions`/`jsonExtensions`: qué extensiones sube `clasp push`.

### `package.json` (scripts)
| Script | Comando | Qué hace |
|---|---|---|
| `npm run push` | `clasp push` | Sube `src/` al editor de Apps Script (pide confirmar si hay conflictos) |
| `npm run push:force` | `clasp push --force` | Igual, sin preguntar |
| `npm run watch` | `clasp push --watch` | Sube automáticamente en cada guardado, útil en desarrollo |
| `npm run pull` | `clasp pull` | Trae los cambios hechos en el editor web hacia `src/` local |
| `npm run deploy` | `push:force` + `clasp deploy -i <id fijo>` | Publica a producción sin mover la URL `/exec` |
| `npm run logs` | `clasp tail-logs` | Sigue en vivo el `Logger.log` del proyecto |
| `npm run open` | `clasp open-script` | Abre el editor de Apps Script en el navegador |

## 9. Cómo usar clasp

`clasp` sincroniza este repo local con el proyecto de Apps Script en la nube; el editor web de Apps Script **no** es la fuente de verdad, este repo lo es.

- **Primera vez / nueva máquina**: `clasp login` (una vez por máquina/usuario).
- **Flujo normal de desarrollo**: editar archivos en `src/`, luego `npm run push` (o `npm run watch` para autosync mientras trabajas).
- **Publicar a producción**: `npm run deploy` — es el único comando que actualiza la URL `/exec` que usan los usuarios finales; un `push` normal solo actualiza la última versión guardada en el editor, no lo publicado.
- **Traer cambios manuales** hechos directamente en el editor web (evitar en lo posible, pero por si pasa): `npm run pull`, revisar el diff con cuidado antes de commitear.
- **Depurar en producción**: `npm run logs` sigue el log en vivo; los errores de funciones públicas además llegan por correo a `CORREOS_NOTIFICACION_ERRORES_` (ver [Errores.js](src/Errores.js)).
- `clasp` guarda la sesión autenticada en `~/.clasprc.json` (fuera del repo, en `.gitignore`) — no se comparte ni se commitea.

## 10. Trabajar en este repo con Claude Code o Codex

### Claude Code
Abrir una terminal en la raíz del repo y ejecutar `claude`. Claude Code carga automáticamente:
- **[CLAUDE.md](CLAUDE.md)**: instrucciones del proyecto — actualmente indica que **después de cualquier cambio en `src/`, se debe correr `npm run deploy` automáticamente sin pedir confirmación** (porque `clasp` ya está autenticado en esa máquina y el ID de deployment es fijo), y que **no se debe usar Playwright** salvo que el usuario lo pida explícitamente.
- **[.claude/settings.json](.claude/settings.json)**: `enableAllProjectMcpServers: true`, así que los servidores MCP definidos en `.mcp.json` se habilitan automáticamente.
- **[.mcp.json](.mcp.json)**: define el servidor MCP `playwright` (`npx @playwright/mcp@latest`) — disponible pero, por la regla de `CLAUDE.md`, solo debe invocarse si el usuario lo pide.
- **`.agents/skills/`** + **[skills-lock.json](skills-lock.json)**: skills instalados — `better-ui` (pulido de UI: bordes, iconografía, profundidad) y `frontend-design` (dirección estética, tipografía) — relevantes porque el frontend (`Index.html`/`Gestionar.html`) es HTML/CSS a mano.

### Codex (OpenAI CLI)
Codex no lee `CLAUDE.md` de forma nativa — usa por convención un archivo `AGENTS.md` en la raíz del repo. Este repo todavía no tiene uno. Para que Codex siga las mismas reglas (auto-deploy tras cambios en `src/`, no usar Playwright sin pedirlo), crea un `AGENTS.md` con el mismo contenido que `CLAUDE.md`, o pégalo directamente en el prompt inicial de la sesión. Codex sí puede ejecutar `npm run deploy` igual que cualquier otra terminal, siempre que la máquina tenga `clasp login` ya hecho.

## 11. Seguridad y notas importantes

- El panel de gestión no tiene login: su seguridad depende por completo de que `SECRETO_ENLACES` sea un valor largo, aleatorio y nunca se filtre — si se compromete, cualquiera con un enlace válido de una solicitud podría forjar acceso a otras (aunque el HMAC liga la firma a un `ticket+pageId` específico, no permite gestionar solicitudes de las que no se conoce el `pageId`).
- `.env`, `.clasprc.json` y cualquier archivo con credenciales están en [.gitignore](.gitignore) — nunca deben commitearse. El token de Notion vive únicamente en `PropertiesService` (script properties), no en el código ni en el repo.
- La vista pública (`mapearSolicitudPublica_` en [NotionDisenos.js](src/NotionDisenos.js)) usa una *whitelist* explícita de campos — nunca expone notas internas, prioridad, responsable ni el link de documentos soporte. Si agregas un campo nuevo a esa función, revisa que no filtre información interna.
- Las funciones públicas (expuestas a `google.script.run`) nunca devuelven el mensaje de error real al cliente: usan `respuestaError_` ([Errores.js](src/Errores.js)), que loguea, notifica por correo al equipo interno y devuelve un mensaje genérico.

## 12. Solución de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| `clasp push` falla con error de permisos | La cuenta autenticada no tiene acceso de editor al script | Pedir que agreguen la cuenta como editor, o `clasp login` con la cuenta correcta |
| El portal carga pero el formulario nunca trae catálogos | Faltan credenciales en `PropertiesService` | Correr `configurarCredenciales`/`configurarBasesAuxiliares` desde el editor (paso 7.5) |
| "Enlace inválido" en el panel de gestión | `SECRETO_ENLACES` cambió después de crear la solicitud, o el enlace está incompleto/editado | No rotar `SECRETO_ENLACES` en producción sin necesidad; si se rota, los enlaces ya enviados dejan de funcionar |
| No llega el correo de confirmación | Cuota diaria de `MailApp` agotada, o el correo del empleado en Notion es inválido | Revisar `Logger.log` (`npm run logs`) y la bandeja de `CORREOS_NOTIFICACION_ERRORES_` |
| `verificarAccesoDrive()` falla con "You do not have permission" | La cuenta que despliega no es miembro de la unidad compartida donde vive `DRIVE_CARPETA_RAIZ_ID_` | Agregar la cuenta a la unidad compartida en Drive |
| Cambios hechos en el editor web no aparecen en el repo | Se editó directo en el editor de Apps Script en vez de en `src/` | `npm run pull` y revisar el diff antes de commitear; evitar editar directo en el editor a futuro |
