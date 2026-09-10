/**
 * Capa de transporte con la API de Notion. Solo lógica genérica: nada de
 * nombres de propiedad ni de bases de datos específicas — eso vive en
 * NotionProps.js y en los módulos de dominio (NotionDisenos.js,
 * NotionCatalogos.js).
 */

var NOTION_API_BASE_ = 'https://api.notion.com/v1';
var NOTION_VERSION_ = '2022-06-28';
var ZONA_HORARIA_CO_ = 'America/Bogota';

function formatoFecha_(d) {
  return Utilities.formatDate(d, ZONA_HORARIA_CO_, 'yyyy-MM-dd');
}

function notionOpciones_(config, payload) {
  var options = {
    headers: {
      Authorization: 'Bearer ' + config.token,
      'Notion-Version': NOTION_VERSION_
    },
    contentType: 'application/json',
    muteHttpExceptions: true
  };
  if (payload) options.payload = JSON.stringify(payload);
  return options;
}

/** Convierte una HTTPResponse (de fetch o fetchAll) en el body ya parseado, o lanza si Notion devolvió error. */
function notionLeerRespuesta_(response) {
  var status = response.getResponseCode();
  var texto = response.getContentText();
  var body;
  try {
    body = texto ? JSON.parse(texto) : {};
  } catch (e) {
    throw new Error('Notion API [' + status + ']: respuesta no-JSON: ' + texto.slice(0, 200));
  }
  if (status >= 400) {
    var mensaje = (body && body.message) || 'Error desconocido de Notion';
    throw new Error('Notion API [' + status + ']: ' + mensaje);
  }
  return body;
}

function notionRequest_(path, method, payload, intento) {
  intento = intento || 1;
  var config = getNotionConfig_();
  var options = notionOpciones_(config, payload);
  options.method = method;
  var response = UrlFetchApp.fetch(NOTION_API_BASE_ + path, options);

  if ((response.getResponseCode() === 429 || response.getResponseCode() >= 500) && intento < 3) {
    Utilities.sleep(300 * intento);
    return notionRequest_(path, method, payload, intento + 1);
  }

  return notionLeerRespuesta_(response);
}

/**
 * Ejecuta varias peticiones de Notion EN PARALELO con UrlFetchApp.fetchAll
 * (una sola petición HTTP hacia Notion no lo permite, pero varias sí se
 * pueden despachar juntas). Solo para peticiones independientes entre sí —
 * nunca para una que dependa del resultado de otra — y sin reintentos: si
 * una falla, se lanza y quien llama decide (normalmente cae al camino
 * secuencial de siempre). `peticiones` es [{ path, method, payload }].
 */
function notionFetchAll_(peticiones) {
  var config = getNotionConfig_();
  var requests = peticiones.map(function (p) {
    var options = notionOpciones_(config, p.payload);
    options.url = NOTION_API_BASE_ + p.path;
    options.method = p.method || 'get';
    return options;
  });
  return UrlFetchApp.fetchAll(requests).map(notionLeerRespuesta_);
}

/** Pagina una consulta de base de datos hasta agotar next_cursor. */
function notionQueryAll_(databaseId, filtro, orden) {
  var resultados = [];
  var cursor = null;
  do {
    var payload = { page_size: 100 };
    if (filtro) payload.filter = filtro;
    if (orden) payload.sorts = orden;
    if (cursor) payload.start_cursor = cursor;
    var pagina = notionRequest_('/databases/' + databaseId + '/query', 'post', payload);
    resultados = resultados.concat(pagina.results || []);
    cursor = pagina.has_more ? pagina.next_cursor : null;
    if (cursor) Utilities.sleep(120);
  } while (cursor);
  return resultados;
}

function notionObtenerPagina_(pageId) {
  return notionRequest_('/pages/' + pageId, 'get');
}

function notionActualizarPagina_(pageId, properties) {
  return notionRequest_('/pages/' + pageId, 'patch', { properties: properties });
}

// ---- Helpers de serialización (JS -> propiedad de Notion) ----

function title_(texto) {
  return { title: [{ text: { content: texto } }] };
}

function rt_(texto) {
  return { rich_text: [{ text: { content: texto } }] };
}

function sel_(nombre) {
  return { select: { name: nombre } };
}

function multiSel_(nombres) {
  return { multi_select: nombres.map(function (n) { return { name: n }; }) };
}

function status_(nombre) {
  return { status: { name: nombre } };
}

function date_(fecha) {
  return { date: { start: formatoFecha_(fecha) } };
}

/** Para strings ya en formato yyyy-MM-dd (ej. desde un <input type="date">): NO pasar por new Date(). */
function dateIso_(yyyyMmDd) {
  return { date: { start: yyyyMmDd } };
}

function email_(correo) {
  return { email: correo };
}

function url_(u) {
  return { url: u };
}

function relation_(ids) {
  return { relation: ids.map(function (id) { return { id: id }; }) };
}

/** Trocea texto en objetos rich_text de <=1900 chars (límite de Notion: 2000/objeto, 100 objetos/array). */
function rtChunks_(texto) {
  var LIMITE = 1900;
  if (texto.length <= LIMITE) return rt_(texto);
  var trozos = [];
  var resto = texto;
  while (resto.length > 0 && trozos.length < 100) {
    if (resto.length <= LIMITE) {
      trozos.push(resto);
      resto = '';
      break;
    }
    var corte = resto.lastIndexOf('\n', LIMITE);
    if (corte < LIMITE * 0.5) corte = LIMITE;
    trozos.push(resto.slice(0, corte));
    resto = resto.slice(corte);
  }
  return { rich_text: trozos.map(function (t) { return { text: { content: t } }; }) };
}

/** Vacía una propiedad según su tipo de valor Notion. */
function vaciarSelect_() { return { select: null }; }
function vaciarFecha_() { return { date: null }; }
function vaciarRelacion_() { return { relation: [] }; }

// ---- Helpers de lectura (propiedad de Notion -> JS) ----

function leerTitulo_(prop) {
  if (!prop || !prop.title || !prop.title.length) return '';
  return prop.title.map(function (t) { return t.plain_text; }).join('');
}

function leerTexto_(prop) {
  if (!prop || !prop.rich_text || !prop.rich_text.length) return '';
  return prop.rich_text.map(function (t) { return t.plain_text; }).join('');
}

function leerSelect_(prop) {
  return (prop && prop.select && prop.select.name) || '';
}

function leerMultiSelect_(prop) {
  if (!prop || !prop.multi_select) return [];
  return prop.multi_select.map(function (o) { return o.name; });
}

function leerStatus_(prop) {
  return (prop && prop.status && prop.status.name) || '';
}

function leerFecha_(prop) {
  return (prop && prop.date && prop.date.start) || '';
}

function leerEmail_(prop) {
  return (prop && prop.email) || '';
}

function leerUniqueId_(prop) {
  if (!prop || !prop.unique_id) return '';
  return prop.unique_id.prefix + '-' + prop.unique_id.number;
}

function leerUrl_(prop) {
  return (prop && prop.url) || '';
}

function leerRelacion_(prop) {
  if (!prop || !prop.relation) return [];
  return prop.relation.map(function (r) { return r.id; });
}

function leerFormula_(prop) {
  if (!prop || !prop.formula) return '';
  var f = prop.formula;
  if (f.type === 'string') return f.string || '';
  if (f.type === 'number') return (f.number != null) ? String(f.number) : '';
  if (f.type === 'boolean') return f.boolean ? 'Sí' : 'No';
  if (f.type === 'date') return (f.date && f.date.start) || '';
  return '';
}

/** Lector genérico por si el tipo real de una columna (select, rich_text, formula...) no está garantizado. */
function leerPropiedadTexto_(prop) {
  if (!prop) return '';
  switch (prop.type) {
    case 'title': return leerTitulo_(prop);
    case 'rich_text': return leerTexto_(prop);
    case 'select': return leerSelect_(prop);
    case 'multi_select': return leerMultiSelect_(prop).join(', ');
    case 'status': return leerStatus_(prop);
    case 'formula': return leerFormula_(prop);
    case 'number': return (prop.number != null) ? String(prop.number) : '';
    case 'url': return leerUrl_(prop);
    case 'email': return leerEmail_(prop);
    default: return '';
  }
}
