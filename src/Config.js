/**
 * Configuración del proyecto vía PropertiesService. Cada función se corre
 * UNA sola vez, manualmente, desde el editor de Apps Script — nunca se
 * exponen al portal público ni se llaman desde el cliente.
 */

function configurarCredenciales(token, databaseId) {
  PropertiesService.getScriptProperties().setProperties({
    NOTION_TOKEN: token,
    NOTION_DATABASE_ID: databaseId
  });
}

function configurarBasesAuxiliares(clientesDbId, personalDbId) {
  PropertiesService.getScriptProperties().setProperties({
    NOTION_CLIENTES_DATABASE_ID: clientesDbId,
    NOTION_PERSONAL_DATABASE_ID: personalDbId
  });
}

function configurarCredencialesOrdenTrabajo(ordenTrabajoDbId) {
  PropertiesService.getScriptProperties().setProperty('NOTION_ORDEN_TRABAJO_DATABASE_ID', ordenTrabajoDbId);
}

function configurarUrlWebApp(url) {
  PropertiesService.getScriptProperties().setProperty('URL_WEB_APP', url);
}

function configurarSecretoEnlaces(secreto) {
  PropertiesService.getScriptProperties().setProperty('SECRETO_ENLACES', secreto);
}

function configurarSecretoAutodiagnostico(secreto) {
  PropertiesService.getScriptProperties().setProperty('SECRETO_SELFTEST', secreto);
}

function getNotionConfig_() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('NOTION_TOKEN');
  var databaseId = props.getProperty('NOTION_DATABASE_ID');
  if (!token || !databaseId) {
    throw new Error(
      'Credenciales de Notion no configuradas. Ejecuta configurarCredenciales(token, databaseId) desde el editor de Apps Script.'
    );
  }
  return { token: token, databaseId: databaseId };
}

function getDbClientes_() {
  var id = PropertiesService.getScriptProperties().getProperty('NOTION_CLIENTES_DATABASE_ID');
  if (!id) throw new Error('Falta NOTION_CLIENTES_DATABASE_ID. Ejecuta configurarBasesAuxiliares(...) desde el editor.');
  return id;
}

function getDbPersonal_() {
  var id = PropertiesService.getScriptProperties().getProperty('NOTION_PERSONAL_DATABASE_ID');
  if (!id) throw new Error('Falta NOTION_PERSONAL_DATABASE_ID. Ejecuta configurarBasesAuxiliares(...) desde el editor.');
  return id;
}

function getDbOrdenesTrabajo_() {
  var id = PropertiesService.getScriptProperties().getProperty('NOTION_ORDEN_TRABAJO_DATABASE_ID');
  if (!id) throw new Error('Falta NOTION_ORDEN_TRABAJO_DATABASE_ID. Ejecuta configurarCredencialesOrdenTrabajo(id) desde el editor.');
  return id;
}

function getUrlWebApp_() {
  var url = PropertiesService.getScriptProperties().getProperty('URL_WEB_APP');
  if (!url) throw new Error('Falta URL_WEB_APP. Ejecuta configurarUrlWebApp(url) desde el editor.');
  return url;
}

function getSecretoEnlaces_() {
  var secreto = PropertiesService.getScriptProperties().getProperty('SECRETO_ENLACES');
  if (!secreto) throw new Error('Falta SECRETO_ENLACES. Ejecuta configurarSecretoEnlaces(secreto) desde el editor.');
  return secreto;
}

function getSecretoSelftest_() {
  return PropertiesService.getScriptProperties().getProperty('SECRETO_SELFTEST') || '';
}
