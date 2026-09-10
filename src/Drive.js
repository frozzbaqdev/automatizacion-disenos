/**
 * Integración con Google Drive usando el servicio nativo DriveApp de Apps
 * Script (no REST). DriveApp resuelve automáticamente el acceso a carpetas
 * dentro de unidades compartidas para cuentas que ya son miembro de ellas,
 * sin necesitar banderas explícitas ni habilitar la API de Drive aparte en
 * Google Cloud Console.
 */

var DRIVE_CARPETA_RAIZ_ID_ = '1GfP3FXF9Hwl2Zs4kHrkrP2t10y07Bllf';

/**
 * Crea (o reutiliza si ya existe) la carpeta de soportes de un ticket dentro
 * de la carpeta raíz en la unidad compartida "Automatización Frozz".
 * Devuelve {id, url}.
 */
function crearCarpetaTicket_(nombreCarpeta) {
  var raiz = DriveApp.getFolderById(DRIVE_CARPETA_RAIZ_ID_);
  var existentes = raiz.getFoldersByName(nombreCarpeta);
  var carpeta = existentes.hasNext() ? existentes.next() : raiz.createFolder(nombreCarpeta);
  return { id: carpeta.getId(), url: urlCarpeta_(carpeta.getId()) };
}

/** Sube un archivo (ya recibido en base64 desde el cliente) a la carpeta del ticket. */
function subirArchivoTicket_(carpetaId, nombreArchivo, mimeType, base64Datos) {
  var carpeta = DriveApp.getFolderById(carpetaId);
  var bytes = Utilities.base64Decode(base64Datos);
  var blob = Utilities.newBlob(bytes, mimeType, sanitizarNombreArchivo_(nombreArchivo));
  var archivo = carpeta.createFile(blob);
  return { id: archivo.getId(), url: archivo.getUrl() };
}

function sanitizarNombreArchivo_(nombre) {
  return String(nombre).replace(/[\\/:*?"<>|]/g, '_').slice(0, 200);
}

function urlCarpeta_(id) {
  return 'https://drive.google.com/drive/folders/' + id;
}

/**
 * Verificación manual de acceso — correr desde el editor de Apps Script.
 * Crea una carpeta de prueba dentro de la raíz y sube un archivo pequeño.
 * Si falla, el mensaje de DriveApp suele indicar si la cuenta no tiene
 * acceso a la carpeta/unidad compartida (p. ej. "You do not have permission
 * to access the requested document" o "File not found").
 */
function verificarAccesoDrive() {
  var nombrePrueba = 'DISF-TEST-' + Math.floor(100000 + Math.random() * 900000);
  Logger.log('Creando carpeta de prueba: ' + nombrePrueba);
  var carpeta = crearCarpetaTicket_(nombrePrueba);
  Logger.log('Carpeta creada: ' + carpeta.url);

  var contenido = Utilities.base64Encode('prueba de acceso a Drive - ' + new Date());
  var archivo = subirArchivoTicket_(carpeta.id, 'prueba.txt', 'text/plain', contenido);
  Logger.log('Archivo de prueba subido: ' + archivo.url);

  Logger.log('OK. Carpeta de prueba verificada en: ' + carpeta.url);
  return carpeta.url;
}
