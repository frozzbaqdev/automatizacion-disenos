/**
 * Manejo centralizado de errores: log + correo interno de alerta.
 * Las funciones públicas nunca dejan que un error real llegue al cliente
 * (mensaje genérico), pero el equipo interno sí necesita enterarse.
 */

var CORREOS_NOTIFICACION_ERRORES_ = ['mmendoza@frozzcolombia.com', 'jflorez@frozzcolombia.com'];

function notificarErrorPorCorreo_(contexto, err) {
  try {
    var mensaje = String(err && err.message || err);
    var stack = (err && err.stack) || '(sin stack)';
    var cuerpo = 'Contexto: ' + contexto + '\n\nError: ' + mensaje + '\n\nStack:\n' + stack;
    CORREOS_NOTIFICACION_ERRORES_.forEach(function (destino) {
      MailApp.sendEmail(destino, '[Frozz Diseños] Error: ' + contexto, cuerpo);
    });
  } catch (e) {
    // Si notificar también falla, no hay más que hacer: solo queda el log.
    Logger.log('notificarErrorPorCorreo_ falló: ' + e);
  }
}

/** Envoltorio estándar para funciones públicas: loguea, notifica y devuelve un mensaje genérico. */
function respuestaError_(contexto, err, mensajePublico) {
  Logger.log(contexto + ': ' + (err && err.stack || err));
  notificarErrorPorCorreo_(contexto, err);
  return { ok: false, error: mensajePublico || 'Ocurrió un error inesperado. Intenta de nuevo en unos minutos.' };
}
