/**
 * Dominio de la base DISEÑOS: creación de solicitudes, enlaces de gestión
 * firmados, notas con historial, y lectura para las vistas pública y de
 * gestión.
 */

// ---- Generación de ticket único ----

function existeTicket_(ticket) {
  var config = getNotionConfig_();
  var resultado = notionRequest_('/databases/' + config.databaseId + '/query', 'post', {
    filter: { property: P_DIS_.TICKET, rich_text: { equals: ticket } },
    page_size: 1
  });
  return !!(resultado.results && resultado.results.length);
}

function generarTicketUnico_() {
  for (var intento = 0; intento < 8; intento++) {
    var candidato = 'DISF' + String(Math.floor(100000 + Math.random() * 900000));
    if (!existeTicket_(candidato)) return candidato;
  }
  throw new Error('No se pudo generar un número de ticket único tras 8 intentos.');
}

// ---- Enlaces de gestión firmados (capability link) ----

function firmarEnlace_(ticket, pageId) {
  var secreto = getSecretoEnlaces_();
  var firma = Utilities.computeHmacSha256Signature(ticket + '|' + pageId, secreto);
  return Utilities.base64EncodeWebSafe(firma);
}

function validarEnlace_(ticket, pageId, firma) {
  if (!ticket || !pageId || !firma) return false;
  return firmarEnlace_(ticket, pageId) === firma;
}

function construirUrlGestion_(ticket, pageId) {
  var base = getUrlWebApp_();
  var firma = firmarEnlace_(ticket, pageId);
  return base +
    '?page=gestionar&t=' + encodeURIComponent(ticket) +
    '&id=' + encodeURIComponent(pageId) +
    '&s=' + encodeURIComponent(firma);
}

// ---- Creación ----

/**
 * `datos` ya viene validado y normalizado desde Code.js/validarDatosSolicitud_.
 * Escribe exactamente las propiedades listadas abajo — nunca "progreso",
 * "Check", "Responsable" (people, legacy) ni "Fecha tentativa de entrega".
 */
function crearSolicitudDiseno_(datos) {
  var config = getNotionConfig_();
  var ticket = generarTicketUnico_();
  var carpeta = crearCarpetaTicket_(ticket);

  var properties = {};
  properties[P_DIS_.TITULO] = title_(datos.nombreProyecto);
  properties[P_DIS_.TICKET] = rt_(ticket);
  properties[P_DIS_.SOLICITANTE] = relation_([datos.solicitanteId]);
  properties[P_DIS_.CLIENTE] = relation_([datos.clienteId]);
  properties[P_DIS_.CORREO_SOLICITANTE] = email_(datos.correoSolicitante);
  properties[P_DIS_.TIPO] = sel_(datos.tipo);
  properties[P_DIS_.CLASIFICACION] = multiSel_([datos.clasificacion]);
  if (datos.ordenTrabajoId) {
    properties[P_DIS_.ORDEN_TRABAJO] = relation_([datos.ordenTrabajoId]);
  }
  properties[P_DIS_.DESCRIPCION] = rt_(datos.descripcion);
  properties[P_DIS_.FECHA_LIMITE] = dateIso_(datos.fechaLimite);
  properties[P_DIS_.DOCUMENTOS_SOPORTE] = url_(carpeta.url);
  properties[P_DIS_.ESTADO] = status_(ESTADOS_.SIN_EMPEZAR);
  properties[P_DIS_.ETAPA] = sel_(ETAPAS_ORDEN_[0]);
  properties[P_DIS_.PRIORIDAD] = sel_(PRIORIDAD_DEFECTO_);
  properties[P_DIS_.FECHA_RECIBIDO] = date_(new Date());

  var pagina = notionRequest_('/pages', 'post', {
    parent: { database_id: config.databaseId },
    properties: properties
  });

  var urlGestion = construirUrlGestion_(ticket, pagina.id);
  var propGestion = {};
  propGestion[P_DIS_.GESTIONAR] = url_(urlGestion);
  notionActualizarPagina_(pagina.id, propGestion);

  correoConfirmacionSolicitud_(datos.correoSolicitante, {
    nombre: datos.solicitanteNombre,
    nombreProyecto: datos.nombreProyecto,
    ticket: ticket
  });

  correoNuevaSolicitudInterna_({
    ticket: ticket,
    nombreProyecto: datos.nombreProyecto,
    solicitanteNombre: datos.solicitanteNombre,
    urlGestion: urlGestion
  });

  return {
    ticket: ticket,
    pageId: pagina.id,
    carpetaId: carpeta.id,
    carpetaUrl: carpeta.url,
    urlGestion: urlGestion
  };
}

// ---- Notas (historial acumulado) ----

function appendNota_(pageId, texto) {
  var pagina = notionObtenerPagina_(pageId);
  var actual = leerTexto_(pagina.properties[P_DIS_.NOTAS]);
  var marca = Utilities.formatDate(new Date(), 'America/Bogota', 'dd/MM/yyyy HH:mm');
  var linea = '[' + marca + '] ' + texto;
  var nuevo = linea + (actual ? '\n' + actual : '');

  var props = {};
  props[P_DIS_.NOTAS] = rtChunks_(nuevo);
  notionActualizarPagina_(pageId, props);
  return nuevo;
}

// ---- Lectura ----

function buscarPorTicket_(ticketTexto) {
  var ticket = String(ticketTexto || '').trim().toUpperCase();
  if (!ticket) return null;
  var config = getNotionConfig_();
  var resultado = notionRequest_('/databases/' + config.databaseId + '/query', 'post', {
    filter: { property: P_DIS_.TICKET, rich_text: { equals: ticket } },
    page_size: 1
  });
  if (!resultado.results || !resultado.results.length) return null;
  return resultado.results[0];
}

/** Whitelist estricta para la vista pública: nunca expone GESTIONAR DISEÑO, DOCUMENTOS SOPORTE, Notas crudas, Prioridad ni Estado. */
function mapearSolicitudPublica_(pagina) {
  var p = pagina.properties;
  var etapa = leerSelect_(p[P_DIS_.ETAPA]) || ETAPAS_ORDEN_[0];
  if (etapa === ETAPA_RECHAZADA_) etapa = ETAPAS_ORDEN_[1];
  var aprobacion = leerSelect_(p[P_DIS_.APROBACION]);
  var rechazada = aprobacion === APROBACIONES_.RECHAZADO;
  var etapaFinal = etapa === ETAPAS_ORDEN_[ETAPAS_ORDEN_.length - 1];
  var finalizada = etapaFinal && leerStatus_(p[P_DIS_.ESTADO]) === ESTADOS_.LISTO;
  return {
    ticket: leerTexto_(p[P_DIS_.TICKET]),
    nombreProyecto: leerTitulo_(p[P_DIS_.TITULO]),
    etapa: etapa,
    etapas: ETAPAS_ORDEN_,
    tipo: leerSelect_(p[P_DIS_.TIPO]),
    clasificacion: leerMultiSelect_(p[P_DIS_.CLASIFICACION]),
    descripcion: leerTexto_(p[P_DIS_.DESCRIPCION]),
    aprobacion: aprobacion,
    finalizada: finalizada,
    nota: (rechazada || finalizada) ? limpiarNota_(ultimaNota_(p[P_DIS_.NOTAS])) : '',
    fechaRecibido: leerFecha_(p[P_DIS_.FECHA_RECIBIDO]),
    fechaLimite: leerFecha_(p[P_DIS_.FECHA_LIMITE]),
    fechaEntrega: leerFecha_(p[P_DIS_.FECHA_ENTREGA])
  };
}

/** Extrae solo la línea más reciente de Notas (la primera, por orden de inserción). */
function ultimaNota_(prop) {
  var texto = leerTexto_(prop);
  if (!texto) return '';
  return texto.split('\n')[0];
}

/** Quita el prefijo "[fecha] " de una línea de nota, dejando solo el texto. */
function limpiarNota_(linea) {
  if (!linea) return '';
  return linea.replace(/^\[[^\]]*\]\s*/, '');
}

function resolverNombre_(lista, id) {
  if (!id) return '';
  var item = lista.filter(function (x) { return x.id === id; })[0];
  return item ? item.nombre : '';
}

/** Vista completa para el panel de gestión — sí incluye Notas, documentos y responsable. `personal`/`clientes` se reciben ya cargados (ver gestionCargar_/cargarCatalogosBase_) para no repetir la consulta. */
function mapearSolicitudGestion_(pagina, personal, clientes) {
  var p = pagina.properties;
  var solicitanteId = leerRelacion_(p[P_DIS_.SOLICITANTE])[0];
  var clienteId = leerRelacion_(p[P_DIS_.CLIENTE])[0];
  var responsableId = leerRelacion_(p[P_DIS_.RESPONSABLE])[0];
  var ordenTrabajoId = leerRelacion_(p[P_DIS_.ORDEN_TRABAJO])[0];
  var ordenesCliente = ordenTrabajoId ? listarOrdenesTrabajoPorCliente_(clienteId) : [];
  var etapa = leerSelect_(p[P_DIS_.ETAPA]) || ETAPAS_ORDEN_[0];
  if (etapa === ETAPA_RECHAZADA_) etapa = ETAPAS_ORDEN_[1];

  return {
    pageId: pagina.id,
    ticket: leerTexto_(p[P_DIS_.TICKET]),
    nombreProyecto: leerTitulo_(p[P_DIS_.TITULO]),
    estado: leerStatus_(p[P_DIS_.ESTADO]) || ESTADOS_.SIN_EMPEZAR,
    etapa: etapa,
    etapas: ETAPAS_ORDEN_,
    prioridad: leerSelect_(p[P_DIS_.PRIORIDAD]),
    tipo: leerSelect_(p[P_DIS_.TIPO]),
    clasificacion: leerMultiSelect_(p[P_DIS_.CLASIFICACION]),
    descripcion: leerTexto_(p[P_DIS_.DESCRIPCION]),
    aprobacion: leerSelect_(p[P_DIS_.APROBACION]),
    notas: leerTexto_(p[P_DIS_.NOTAS]),
    documentosSoporte: leerUrl_(p[P_DIS_.DOCUMENTOS_SOPORTE]),
    solicitanteNombre: resolverNombre_(personal, solicitanteId),
    correoSolicitante: leerEmail_(p[P_DIS_.CORREO_SOLICITANTE]),
    clienteNombre: resolverNombre_(clientes, clienteId),
    ordenTrabajo: resolverNombre_(ordenesCliente, ordenTrabajoId),
    responsableId: responsableId || '',
    responsableNombre: resolverNombre_(personal, responsableId),
    fechaRecibido: leerFecha_(p[P_DIS_.FECHA_RECIBIDO]),
    fechaInicio: leerFecha_(p[P_DIS_.FECHA_INICIO]),
    fechaLimite: leerFecha_(p[P_DIS_.FECHA_LIMITE]),
    fechaEntrega: leerFecha_(p[P_DIS_.FECHA_ENTREGA])
  };
}

/** Error "esperado" (validación / carrera de estado): no dispara alerta interna por correo. */
function errorValidacion_(mensaje) {
  var e = new Error(mensaje);
  e.esValidacion = true;
  return e;
}

function conBloqueo_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    throw errorValidacion_('El sistema está ocupado procesando otra acción. Intenta de nuevo en unos segundos.');
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// ---- Transiciones de etapa (todas revalidan el estado leído en fresco) ----

function iniciarGestion_(pageId) {
  return conBloqueo_(function () {
    var pagina = notionObtenerPagina_(pageId);
    var estadoActual = leerStatus_(pagina.properties[P_DIS_.ESTADO]);
    if (estadoActual !== ESTADOS_.SIN_EMPEZAR) {
      throw errorValidacion_('Esta solicitud ya está en gestión.');
    }
    var props = {};
    props[P_DIS_.FECHA_INICIO] = date_(new Date());
    props[P_DIS_.ESTADO] = status_(ESTADOS_.EN_CURSO);
    notionActualizarPagina_(pageId, props);
  });
}

function completarRevision_(pageId, responsableId, prioridad) {
  return conBloqueo_(function () {
    var pagina = notionObtenerPagina_(pageId);
    var etapaActual = leerSelect_(pagina.properties[P_DIS_.ETAPA]) || ETAPAS_ORDEN_[0];
    if (etapaActual !== ETAPAS_ORDEN_[0]) {
      throw errorValidacion_('Esta solicitud ya avanzó a otra etapa. Recarga la página.');
    }
    if (PRIORIDADES_VALIDAS_.indexOf(prioridad) === -1) {
      throw errorValidacion_('Selecciona una prioridad válida.');
    }
    var responsable = listarPersonalActivo_().filter(function (p) { return p.id === responsableId; })[0];
    if (!responsable) {
      throw errorValidacion_('Selecciona un responsable válido.');
    }

    var props = {};
    props[P_DIS_.RESPONSABLE] = relation_([responsableId]);
    props[P_DIS_.PRIORIDAD] = sel_(prioridad);
    props[P_DIS_.ETAPA] = sel_(ETAPAS_ORDEN_[1]);
    notionActualizarPagina_(pageId, props);

    if (responsable.correo) {
      var ticket = leerTexto_(pagina.properties[P_DIS_.TICKET]);
      var nombreProyecto = leerTitulo_(pagina.properties[P_DIS_.TITULO]);
      correoAsignacionResponsable_(responsable.correo, {
        nombre: responsable.nombre,
        nombreProyecto: nombreProyecto,
        ticket: ticket,
        urlGestion: construirUrlGestion_(ticket, pageId)
      });
    }
  });
}

function decidirAprobacion_(pageId, decision, comentario) {
  return conBloqueo_(function () {
    var pagina = notionObtenerPagina_(pageId);
    var etapaActual = leerSelect_(pagina.properties[P_DIS_.ETAPA]) || ETAPAS_ORDEN_[0];
    if (etapaActual !== ETAPAS_ORDEN_[1]) {
      throw errorValidacion_('Esta solicitud ya avanzó a otra etapa. Recarga la página.');
    }
    if (decision !== APROBACIONES_.APROBADO && decision !== APROBACIONES_.RECHAZADO) {
      throw errorValidacion_('Decisión inválida.');
    }
    if (!comentario || !comentario.trim()) {
      throw errorValidacion_('El comentario es obligatorio.');
    }
    comentario = comentario.trim();

    var props = {};
    props[P_DIS_.APROBACION] = sel_(decision);
    if (decision === APROBACIONES_.APROBADO) {
      props[P_DIS_.ETAPA] = sel_(ETAPAS_ORDEN_[2]);
    } else {
      props[P_DIS_.ETAPA] = sel_(ETAPA_RECHAZADA_);
      props[P_DIS_.ESTADO] = status_(ESTADOS_.LISTO);
      props[P_DIS_.FECHA_ENTREGA] = date_(new Date());
    }
    notionActualizarPagina_(pageId, props);
    appendNota_(pageId, comentario);

    var ticket = leerTexto_(pagina.properties[P_DIS_.TICKET]);
    var nombreProyecto = leerTitulo_(pagina.properties[P_DIS_.TITULO]);
    var correoSolicitante = leerEmail_(pagina.properties[P_DIS_.CORREO_SOLICITANTE]);
    var solicitanteId = leerRelacion_(pagina.properties[P_DIS_.SOLICITANTE])[0];
    var responsableId = leerRelacion_(pagina.properties[P_DIS_.RESPONSABLE])[0];
    var personal = listarPersonalActivo_();
    var responsable = personal.filter(function (p) { return p.id === responsableId; })[0];
    correoDecisionAprobacion_(correoSolicitante, {
      nombre: resolverNombre_(personal, solicitanteId) || 'cliente',
      nombreProyecto: nombreProyecto,
      ticket: ticket,
      decision: decision,
      comentario: comentario,
      responsableNombre: responsable ? responsable.nombre : '',
      responsableCorreo: responsable ? responsable.correo : ''
    });
  });
}

function completarDesarrollo_(pageId) {
  return conBloqueo_(function () {
    var pagina = notionObtenerPagina_(pageId);
    var etapaActual = leerSelect_(pagina.properties[P_DIS_.ETAPA]) || ETAPAS_ORDEN_[0];
    if (etapaActual !== ETAPAS_ORDEN_[2]) {
      throw errorValidacion_('Esta solicitud ya avanzó a otra etapa. Recarga la página.');
    }
    var props = {};
    props[P_DIS_.ETAPA] = sel_(ETAPAS_ORDEN_[3]);
    notionActualizarPagina_(pageId, props);
  });
}

function finalizarSolicitud_(pageId, comentario) {
  return conBloqueo_(function () {
    var pagina = notionObtenerPagina_(pageId);
    var etapaActual = leerSelect_(pagina.properties[P_DIS_.ETAPA]) || ETAPAS_ORDEN_[0];
    if (etapaActual !== ETAPAS_ORDEN_[3]) {
      throw errorValidacion_('Esta solicitud ya avanzó a otra etapa. Recarga la página.');
    }
    var estadoActual = leerStatus_(pagina.properties[P_DIS_.ESTADO]);
    if (estadoActual === ESTADOS_.LISTO) {
      throw errorValidacion_('Esta solicitud ya fue finalizada.');
    }
    comentario = comentario && comentario.trim() ? comentario.trim() : '';

    var props = {};
    props[P_DIS_.ESTADO] = status_(ESTADOS_.LISTO);
    props[P_DIS_.FECHA_ENTREGA] = date_(new Date());
    notionActualizarPagina_(pageId, props);
    appendNota_(pageId, comentario || 'Solicitud finalizada.');

    var ticket = leerTexto_(pagina.properties[P_DIS_.TICKET]);
    var nombreProyecto = leerTitulo_(pagina.properties[P_DIS_.TITULO]);
    var correoSolicitante = leerEmail_(pagina.properties[P_DIS_.CORREO_SOLICITANTE]);
    var solicitanteId = leerRelacion_(pagina.properties[P_DIS_.SOLICITANTE])[0];
    correoFinalizacion_(correoSolicitante, {
      nombre: resolverNombre_(listarPersonalActivo_(), solicitanteId) || 'cliente',
      nombreProyecto: nombreProyecto,
      ticket: ticket
    });
  });
}
