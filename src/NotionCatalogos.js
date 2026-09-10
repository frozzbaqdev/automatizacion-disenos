/**
 * Lectura de PERSONAL ACTIVO y CLIENTES (COMERCIAL) para poblar los
 * desplegables del formulario. Ambas bases superan el límite de 100 filas
 * por página de Notion, así que usan notionQueryAll_. Los resultados se
 * cachean (CacheService, 6 h) porque cambian poco y consultarlos completos
 * en cada carga de formulario sería lento e innecesario.
 */

var CACHE_TTL_CATALOGOS_ = 21600; // 6 horas, el máximo de CacheService
var CACHE_CLAVE_PERSONAL_ = 'catalogo_personal_v1';
var CACHE_CLAVE_CLIENTES_ = 'catalogo_clientes_v1';

function mapearFilasPersonal_(filas) {
  return filas.map(function (fila) {
    var p = fila.properties;
    return {
      id: fila.id,
      nombre: leerTitulo_(p[P_PERSONAL_.NOMBRE]),
      correo: leerEmail_(p[P_PERSONAL_.CORREO])
    };
  });
}

function mapearFilasClientes_(filas) {
  return filas.map(function (fila) {
    var p = fila.properties;
    return {
      id: fila.id,
      nombre: leerTitulo_(p[P_CLIENTE_.NOMBRE]),
      documento: leerTexto_(p[P_CLIENTE_.DOCUMENTO])
    };
  });
}

function listarPersonalActivo_() {
  var cache = cacheJsonGet_(CACHE_CLAVE_PERSONAL_);
  if (cache) return cache;

  var filas = notionQueryAll_(
    getDbPersonal_(),
    { property: P_PERSONAL_.ESTADO, select: { equals: PERSONAL_ESTADO_VINCULADO_ } },
    [{ property: P_PERSONAL_.NOMBRE, direction: 'ascending' }]
  );

  var lista = mapearFilasPersonal_(filas);
  cacheJsonPut_(CACHE_CLAVE_PERSONAL_, lista, CACHE_TTL_CATALOGOS_);
  return lista;
}

function listarClientes_() {
  var cache = cacheJsonGet_(CACHE_CLAVE_CLIENTES_);
  if (cache) return cache;

  var filas = notionQueryAll_(
    getDbClientes_(),
    null,
    [{ property: P_CLIENTE_.NOMBRE, direction: 'ascending' }]
  );

  var lista = mapearFilasClientes_(filas);
  cacheJsonPut_(CACHE_CLAVE_CLIENTES_, lista, CACHE_TTL_CATALOGOS_);
  return lista;
}

/**
 * Entrega personal + clientes juntos. Si ambos cachés están fríos (primera
 * carga tras expirar las 6 h), consulta las dos bases de Notion EN PARALELO
 * con notionFetchAll_ en vez de una tras otra — es la única carga que
 * bloquea el formulario inicial, así que vale la pena. Si alguna base supera
 * las 100 filas (raro), cae de vuelta a listarPersonalActivo_/listarClientes_
 * (que sí pagina completo) en vez de complicar el camino rápido.
 */
function cargarCatalogosBase_() {
  var personal = cacheJsonGet_(CACHE_CLAVE_PERSONAL_);
  var clientes = cacheJsonGet_(CACHE_CLAVE_CLIENTES_);
  if (personal && clientes) return { personal: personal, clientes: clientes };
  if (personal || clientes) {
    return {
      personal: personal || listarPersonalActivo_(),
      clientes: clientes || listarClientes_()
    };
  }

  var respuestas = notionFetchAll_([
    {
      path: '/databases/' + getDbPersonal_() + '/query',
      method: 'post',
      payload: {
        page_size: 100,
        filter: { property: P_PERSONAL_.ESTADO, select: { equals: PERSONAL_ESTADO_VINCULADO_ } },
        sorts: [{ property: P_PERSONAL_.NOMBRE, direction: 'ascending' }]
      }
    },
    {
      path: '/databases/' + getDbClientes_() + '/query',
      method: 'post',
      payload: { page_size: 100, sorts: [{ property: P_CLIENTE_.NOMBRE, direction: 'ascending' }] }
    }
  ]);

  personal = respuestas[0].has_more ? listarPersonalActivo_() : mapearFilasPersonal_(respuestas[0].results || []);
  clientes = respuestas[1].has_more ? listarClientes_() : mapearFilasClientes_(respuestas[1].results || []);

  if (!respuestas[0].has_more) cacheJsonPut_(CACHE_CLAVE_PERSONAL_, personal, CACHE_TTL_CATALOGOS_);
  if (!respuestas[1].has_more) cacheJsonPut_(CACHE_CLAVE_CLIENTES_, clientes, CACHE_TTL_CATALOGOS_);

  return { personal: personal, clientes: clientes };
}

function formatearOrdenTrabajo_(p) {
  var ot = leerPropiedadTexto_(p[P_ORDEN_.OT]);
  var servicio = leerPropiedadTexto_(p[P_ORDEN_.SERVICIO]);
  return ot + (servicio ? ' — ' + servicio : '');
}

/**
 * Órdenes de trabajo de un cliente puntual, para el campo condicional de
 * "Diseño ing de detalle". No se cachea (a diferencia de personal/clientes):
 * depende del cliente elegido en cada solicitud, así que se consulta directo.
 */
function listarOrdenesTrabajoPorCliente_(clienteId) {
  if (!clienteId) return [];
  var filas = notionQueryAll_(
    getDbOrdenesTrabajo_(),
    { property: P_ORDEN_.CLIENTE, relation: { contains: clienteId } },
    null
  );
  return filas.map(function (fila) {
    return { id: fila.id, nombre: formatearOrdenTrabajo_(fila.properties) };
  });
}

/** Borra el caché de ambos catálogos — correr manualmente tras cambios masivos en Notion. */
function invalidarCatalogos() {
  var cache = CacheService.getScriptCache();
  cache.remove(CACHE_CLAVE_PERSONAL_);
  cache.remove(CACHE_CLAVE_PERSONAL_ + '_n');
  cache.remove(CACHE_CLAVE_CLIENTES_);
  cache.remove(CACHE_CLAVE_CLIENTES_ + '_n');
}

// ---- Cache JSON con troceo (CacheService limita cada valor a 100 KB) ----

var CACHE_TROZO_MAX_ = 90000;

function cacheJsonPut_(clave, obj, ttlSegundos) {
  var cache = CacheService.getScriptCache();
  var json = JSON.stringify(obj);
  if (json.length <= CACHE_TROZO_MAX_) {
    cache.put(clave, json, ttlSegundos);
    cache.remove(clave + '_n');
    return;
  }
  var n = Math.ceil(json.length / CACHE_TROZO_MAX_);
  var valores = {};
  for (var i = 0; i < n; i++) {
    valores[clave + '_' + i] = json.slice(i * CACHE_TROZO_MAX_, (i + 1) * CACHE_TROZO_MAX_);
  }
  valores[clave + '_n'] = String(n);
  cache.putAll(valores, ttlSegundos);
}

function cacheJsonGet_(clave) {
  var cache = CacheService.getScriptCache();
  var n = cache.get(clave + '_n');
  if (n) {
    var claves = [];
    for (var i = 0; i < Number(n); i++) claves.push(clave + '_' + i);
    var partes = cache.getAll(claves);
    var json = '';
    for (var j = 0; j < claves.length; j++) {
      if (!partes[claves[j]]) return null; // algún trozo expiró: invalida todo el conjunto
      json += partes[claves[j]];
    }
    try { return JSON.parse(json); } catch (e) { return null; }
  }
  var valor = cache.get(clave);
  if (!valor) return null;
  try { return JSON.parse(valor); } catch (e) { return null; }
}
