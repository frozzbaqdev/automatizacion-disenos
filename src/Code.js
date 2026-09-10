/**
 * Portal de solicitudes de diseño — Frozz Diseños.
 * Sirve la página y expone las funciones públicas que consume el frontend
 * vía google.script.run. Toda función pública valida su input y devuelve
 * {ok:true/false, ...} en vez de lanzar excepciones al cliente.
 */

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.page === 'manifest') {
    return manifestWebApp_();
  }
  if (p.page === 'gestionar') {
    return paginaGestion_(p);
  }
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Frozz Diseños')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(nombreArchivo) {
  return HtmlService.createHtmlOutputFromFile(nombreArchivo).getContent();
}

function manifestWebApp_() {
  var manifest = {
    name: 'Frozz Diseños',
    short_name: 'Diseños',
    start_url: '?',
    display: 'standalone'
  };
  return ContentService.createTextOutput(JSON.stringify(manifest)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function esCorreoValido_(correo) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo);
}

/**
 * Valida y normaliza los datos del formulario. Resuelve solicitante y
 * cliente contra el catálogo cacheado (nunca se confía en el nombre que
 * mande el cliente, solo en el id — y el id se verifica que exista).
 */
function validarDatosSolicitud_(datos) {
  datos = datos || {};
  var solicitanteId = (datos.solicitanteId || '').trim();
  var clienteId = (datos.clienteId || '').trim();
  var nombreProyecto = (datos.nombreProyecto || '').trim();
  var tipo = (datos.tipo || '').trim();
  var clasificacion = (datos.clasificacion || '').trim();
  var fechaLimite = (datos.fechaLimite || '').trim();
  var descripcion = (datos.descripcion || '').trim();
  var correoManual = (datos.correoSolicitante || '').trim();
  var ordenTrabajoId = (datos.ordenTrabajoId || '').trim();

  if (!solicitanteId) return { error: 'Selecciona quién solicita.' };
  if (!clienteId) return { error: 'Selecciona el cliente.' };
  if (!nombreProyecto) return { error: 'Ingresa el nombre del proyecto.' };
  if (TIPOS_VALIDOS_.indexOf(tipo) === -1) return { error: 'Selecciona el tipo de solicitud.' };
  if (CLASIFICACIONES_VALIDAS_.indexOf(clasificacion) === -1) return { error: 'Selecciona la clasificación.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaLimite)) return { error: 'Ingresa una fecha límite de entrega válida.' };
  if (fechaLimite < formatoFecha_(new Date())) return { error: 'La fecha límite de entrega no puede ser anterior a hoy.' };
  if (!descripcion) return { error: 'Describe la solicitud.' };

  var catalogos = cargarCatalogosBase_();
  var empleado = catalogos.personal.filter(function (p) { return p.id === solicitanteId; })[0];
  if (!empleado) return { error: 'El solicitante seleccionado no es válido.' };

  var cliente = catalogos.clientes.filter(function (c) { return c.id === clienteId; })[0];
  if (!cliente) return { error: 'El cliente seleccionado no es válido.' };

  if (clasificacion === CLASIFICACION_ORDEN_TRABAJO_) {
    if (!ordenTrabajoId) return { error: 'Selecciona la orden de trabajo.' };
    var ordenTrabajo = listarOrdenesTrabajoPorCliente_(clienteId).filter(function (o) { return o.id === ordenTrabajoId; })[0];
    if (!ordenTrabajo) return { error: 'La orden de trabajo seleccionada no es válida.' };
  } else {
    ordenTrabajoId = '';
  }

  var correoFinal = empleado.correo || correoManual;
  if (!correoFinal || !esCorreoValido_(correoFinal)) {
    return {
      error: empleado.correo
        ? 'Ingresa un correo electrónico válido.'
        : 'Este empleado no tiene correo corporativo registrado: ingresa uno para poder enviarte la confirmación.'
    };
  }

  return {
    datos: {
      solicitanteId: solicitanteId,
      solicitanteNombre: empleado.nombre,
      clienteId: clienteId,
      nombreProyecto: nombreProyecto,
      tipo: tipo,
      clasificacion: clasificacion,
      fechaLimite: fechaLimite,
      descripcion: descripcion,
      correoSolicitante: correoFinal,
      ordenTrabajoId: ordenTrabajoId
    }
  };
}

/** Entrega los catálogos de solicitantes y clientes al formulario. Expuesta al cliente. */
function cargarCatalogos() {
  try {
    var catalogos = cargarCatalogosBase_();
    return { ok: true, personal: catalogos.personal, clientes: catalogos.clientes };
  } catch (err) {
    return respuestaError_('cargarCatalogos', err, 'No se pudieron cargar los catálogos. Intenta de nuevo.');
  }
}

/** Entrega las Órdenes de Trabajo del cliente indicado, para el campo condicional de "Diseño ing de detalle". Expuesta al cliente. */
function cargarOrdenesTrabajo(clienteId) {
  try {
    clienteId = (clienteId || '').trim();
    if (!clienteId) return { ok: true, ordenes: [] };
    return { ok: true, ordenes: listarOrdenesTrabajoPorCliente_(clienteId) };
  } catch (err) {
    return respuestaError_('cargarOrdenesTrabajo', err, 'No se pudieron cargar las órdenes de trabajo. Intenta de nuevo.');
  }
}

/** Crea una nueva solicitud de diseño. Expuesta al cliente. */
function crearSolicitud(datos) {
  try {
    var validacion = validarDatosSolicitud_(datos);
    if (validacion.error) {
      return { ok: false, error: validacion.error };
    }
    var resultado = crearSolicitudDiseno_(validacion.datos);
    return {
      ok: true,
      ticket: resultado.ticket,
      pageId: resultado.pageId,
      carpetaId: resultado.carpetaId,
      carpetaUrl: resultado.carpetaUrl
    };
  } catch (err) {
    return respuestaError_('crearSolicitud', err, 'No se pudo crear la solicitud. Intenta de nuevo en unos minutos.');
  }
}

/** Sube un adjunto a la carpeta de soportes de una solicitud ya creada. Expuesta al cliente. */
function subirArchivoSolicitud(carpetaId, nombreArchivo, mimeType, base64Datos) {
  try {
    if (!carpetaId || !nombreArchivo || !base64Datos) {
      return { ok: false, error: 'Datos de archivo incompletos.' };
    }
    if (base64Datos.length > 14000000) {
      return { ok: false, error: 'El archivo supera el tamaño máximo permitido (10 MB).' };
    }
    var archivo = subirArchivoTicket_(carpetaId, nombreArchivo, mimeType || 'application/octet-stream', base64Datos);
    return { ok: true, url: archivo.url };
  } catch (err) {
    return respuestaError_('subirArchivoSolicitud', err, 'No se pudo subir el archivo.');
  }
}

/** Deja constancia en Notas de los adjuntos que no se pudieron subir. Expuesta al cliente. */
function registrarAdjuntosFallidos(pageId, nombresFallidos) {
  try {
    if (!pageId || !nombresFallidos || !nombresFallidos.length) return { ok: true };
    appendNota_(
      pageId,
      'No se pudieron adjuntar automáticamente: ' + nombresFallidos.join(', ') + '. El solicitante puede reintentar desde el portal o enviarlos directamente al equipo de diseño.'
    );
    return { ok: true };
  } catch (err) {
    return respuestaError_('registrarAdjuntosFallidos', err, 'No se pudo registrar el adjunto fallido.');
  }
}

/** Busca una solicitud por su número de ticket (ej. "DISF123456"). Expuesta al cliente. */
function buscarSolicitud(ticketTexto) {
  try {
    ticketTexto = (ticketTexto || '').trim();
    if (!ticketTexto) {
      return { ok: false, error: 'Ingresa el número de tu solicitud.' };
    }
    var pagina = buscarPorTicket_(ticketTexto);
    if (!pagina) {
      return { ok: false, error: 'No encontramos ninguna solicitud con ese número.' };
    }
    return { ok: true, solicitud: mapearSolicitudPublica_(pagina) };
  } catch (err) {
    return respuestaError_('buscarSolicitud', err, 'No se pudo consultar la solicitud. Intenta de nuevo en unos minutos.');
  }
}

// ---- Panel de gestión (?page=gestionar) ----
// Web app de acceso anónimo: el link firmado (t+id+s) ES la única llave de
// acceso — quien lo tenga puede gestionar esa solicitud. Por eso nunca se
// setXFrameOptionsMode(ALLOWALL) aquí (evita que quede embebible) y cada
// función gestion* revalida la firma en servidor, no solo al cargar la página.

function paginaGestion_(p) {
  if (!validarEnlace_(p.t, p.id, p.s)) {
    return HtmlService.createHtmlOutput(
      '<div style="font-family:Arial,Helvetica,sans-serif;max-width:420px;margin:80px auto;padding:32px;text-align:center;color:#5B6B7C;">' +
      '<p style="font-size:16px;color:#0B2038;font-weight:600;margin:0 0 8px;">Enlace inválido</p>' +
      '<p style="margin:0;">Este enlace de gestión no es válido o está incompleto.</p>' +
      '</div>'
    ).setTitle('Frozz Diseños');
  }
  var tpl = HtmlService.createTemplateFromFile('Gestionar');
  tpl.ticket = p.t;
  tpl.pageId = p.id;
  tpl.firma = p.s;
  return tpl.evaluate()
    .setTitle('Gestionar solicitud — ' + p.t)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function ctxValido_(ctx) {
  ctx = ctx || {};
  return validarEnlace_(ctx.t, ctx.id, ctx.s);
}

/** Carga la solicitud + el catálogo de personal (para el desplegable de responsable). Expuesta al cliente. */
function gestionCargar(ctx) {
  try {
    if (!ctxValido_(ctx)) return { ok: false, error: 'Enlace inválido.' };
    var pagina = notionObtenerPagina_(ctx.id);
    var catalogos = cargarCatalogosBase_();
    return { ok: true, solicitud: mapearSolicitudGestion_(pagina, catalogos.personal, catalogos.clientes), personal: catalogos.personal };
  } catch (err) {
    return respuestaError_('gestionCargar', err, 'No se pudo cargar la solicitud.');
  }
}

function gestionIniciar(ctx) {
  try {
    if (!ctxValido_(ctx)) return { ok: false, error: 'Enlace inválido.' };
    iniciarGestion_(ctx.id);
    return { ok: true };
  } catch (err) {
    if (err.esValidacion) return { ok: false, error: err.message };
    return respuestaError_('gestionIniciar', err, 'No se pudo iniciar la gestión.');
  }
}

function gestionCompletarRevision(ctx, responsableId, prioridad) {
  try {
    if (!ctxValido_(ctx)) return { ok: false, error: 'Enlace inválido.' };
    completarRevision_(ctx.id, responsableId, prioridad);
    return { ok: true };
  } catch (err) {
    if (err.esValidacion) return { ok: false, error: err.message };
    return respuestaError_('gestionCompletarRevision', err, 'No se pudo guardar la asignación.');
  }
}

function gestionDecidir(ctx, decision, comentario) {
  try {
    if (!ctxValido_(ctx)) return { ok: false, error: 'Enlace inválido.' };
    decidirAprobacion_(ctx.id, decision, comentario);
    return { ok: true };
  } catch (err) {
    if (err.esValidacion) return { ok: false, error: err.message };
    return respuestaError_('gestionDecidir', err, 'No se pudo guardar la decisión.');
  }
}

function gestionCompletarDesarrollo(ctx) {
  try {
    if (!ctxValido_(ctx)) return { ok: false, error: 'Enlace inválido.' };
    completarDesarrollo_(ctx.id);
    return { ok: true };
  } catch (err) {
    if (err.esValidacion) return { ok: false, error: err.message };
    return respuestaError_('gestionCompletarDesarrollo', err, 'No se pudo avanzar de etapa.');
  }
}

function gestionFinalizar(ctx, comentario) {
  try {
    if (!ctxValido_(ctx)) return { ok: false, error: 'Enlace inválido.' };
    finalizarSolicitud_(ctx.id, comentario);
    return { ok: true };
  } catch (err) {
    if (err.esValidacion) return { ok: false, error: err.message };
    return respuestaError_('gestionFinalizar', err, 'No se pudo finalizar la solicitud.');
  }
}

function gestionAgregarNota(ctx, texto) {
  try {
    if (!ctxValido_(ctx)) return { ok: false, error: 'Enlace inválido.' };
    if (!texto || !texto.trim()) return { ok: false, error: 'Escribe una nota.' };
    appendNota_(ctx.id, texto.trim());
    return { ok: true };
  } catch (err) {
    return respuestaError_('gestionAgregarNota', err, 'No se pudo guardar la nota.');
  }
}
