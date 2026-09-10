/**
 * Correos transaccionales. Usa MailApp con el logo como imagen inline (CID)
 * — Gmail bloquea <img src="data:..."> en el cuerpo del correo, así que el
 * base64 de Logo.html se decodifica a un Blob y se referencia por cid.
 * El HTML de correo es tablas + estilos inline (no CSS variables, no
 * flexbox): los clientes de correo, sobre todo Outlook, no soportan nada
 * de eso, e ignoran linear-gradient por completo.
 */

var CORREO_REMITENTE_NOMBRE_ = 'Frozz Colombia · Diseños';

/** Destinatarios fijos que reciben el aviso de cada solicitud nueva (no salen del formulario). Agrega o quita correos aquí. */
var CORREOS_NOTIFICACION_NUEVAS_SOLICITUDES_ = ['mmendoza@frozzcolombia.com', 'lmojica@frozzcolombia.com'];

var logoBlobCache_ = null;
function logoBlob_() {
  if (logoBlobCache_) return logoBlobCache_;
  var dataUri = HtmlService.createHtmlOutputFromFile('Logo').getContent().trim();
  var base64 = dataUri.substring(dataUri.indexOf(',') + 1);
  logoBlobCache_ = Utilities.newBlob(Utilities.base64Decode(base64), 'image/png', 'logo-frozz.png');
  return logoBlobCache_;
}

function saludoPorHora_() {
  var hora = Number(Utilities.formatDate(new Date(), 'America/Bogota', 'H'));
  if (hora < 12) return 'Buenos días';
  if (hora < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

/**
 * o = {
 *   nombre: String,
 *   parrafos: String[]  (cada uno se pinta justificado, se permite HTML simple como <strong>),
 *   cajaTicket: {label, valor} | null  (caja destacada — solo se usa en la confirmación de creación),
 *   nota: {label, texto} | null  (caja de comentario — decisiones de aprobación/rechazo),
 *   cta: {texto, url} | null,
 *   acento: 'brand' | 'success' | 'danger'
 * }
 */
function plantillaCorreo_(o) {
  var colores = {
    brand: '#1467C7',
    success: '#1E8F6F',
    danger: '#C23A2E'
  };
  var fondosSuaves = {
    brand: '#E2ECF5',
    success: '#DFF3EC',
    danger: '#FBE6E3'
  };
  var acento = colores[o.acento] || colores.brand;
  var fondoSuave = fondosSuaves[o.acento] || fondosSuaves.brand;
  var ESTILO_P_ = 'padding:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#0B2038;text-align:justify;';

  var parrafosHtml = (o.parrafos || []).map(function (p) {
    return '<tr><td style="' + ESTILO_P_ + '">' + p + '</td></tr>';
  }).join('');

  var cajaTicketHtml = o.cajaTicket
    ? '<tr><td align="center" style="padding:4px 0 24px;">' +
      '<table role="presentation" cellpadding="0" cellspacing="0" style="background:#F5F8FB;border:1.5px solid #DCE6EF;border-radius:12px;"><tr><td style="padding:16px 32px;text-align:center;">' +
      '<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;letter-spacing:0.05em;color:' + acento + ';text-transform:uppercase;margin:0 0 6px;">' + o.cajaTicket.label + '</div>' +
      '<div style="font-family:\'Courier New\',Consolas,monospace;font-size:28px;font-weight:bold;letter-spacing:0.02em;color:' + acento + ';">' + o.cajaTicket.valor + '</div>' +
      '</td></tr></table>' +
      '</td></tr>'
    : '';

  var notaHtml = o.nota
    ? '<tr><td style="padding:4px 0 20px;">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + fondoSuave + ';border-radius:12px;"><tr><td style="padding:14px 18px;">' +
      '<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;letter-spacing:0.05em;color:' + acento + ';text-transform:uppercase;margin:0 0 6px;">' + o.nota.label + '</div>' +
      '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#0B2038;text-align:justify;">' + o.nota.texto + '</div>' +
      '</td></tr></table>' +
      '</td></tr>'
    : '';

  var ctaHtml = o.cta
    ? '<tr><td align="center" style="padding:8px 0 24px;">' +
      '<table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="' + colores.brand + '" style="border-radius:10px;">' +
      '<a href="' + o.cta.url + '" style="display:inline-block;padding:12px 28px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#FFFFFF;text-decoration:none;">' + o.cta.texto + '</a>' +
      '</td></tr></table></td></tr>'
    : '';

  return '' +
'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF4FA;padding:24px 0;">' +
'<tr><td align="center">' +
'<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#FFFFFF;border-radius:16px;overflow:hidden;">' +

'<tr><td bgcolor="' + colores.brand + '" style="background:' + colores.brand + ';background-image:linear-gradient(120deg,#0A3D7A,#1467C7 55%,#4FC3E8);padding:32px 20px;text-align:center;">' +
'<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr><td bgcolor="#FFFFFF" style="background:#FFFFFF;border-radius:14px;padding:10px 20px;">' +
'<img src="cid:logoFrozz" width="120" alt="Frozz Colombia" style="display:block;height:32px;width:auto;">' +
'</td></tr></table>' +
'</td></tr>' +

'<tr><td style="padding:32px 28px 8px;">' +
'<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' +
'<tr><td style="' + ESTILO_P_ + '">' + saludoPorHora_() + ', <strong>' + o.nombre + '</strong>.</td></tr>' +
parrafosHtml +
cajaTicketHtml +
notaHtml +
ctaHtml +
'<tr><td style="padding:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#0B2038;text-align:justify;">Cordialmente,<br><strong>Equipo de Diseño</strong><br>Frozz Colombia</td></tr>' +
'</table>' +
'</td></tr>' +

'<tr><td bgcolor="#F5F8FB" style="background:#F5F8FB;padding:16px 28px;text-align:center;">' +
'<div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#8494A6;">Este es un mensaje automático del portal de Diseños de Frozz Colombia. Por favor no responda directamente a este correo.</div>' +
'</td></tr>' +

'</table>' +
'</td></tr>' +
'</table>';
}

/** `destino` acepta un correo único o un arreglo de correos (ej. CORREOS_NOTIFICACION_NUEVAS_SOLICITUDES_). */
function enviarCorreo_(destino, asunto, html) {
  var destinos = (Array.isArray(destino) ? destino : [destino]).filter(esCorreoValido_);
  if (!destinos.length) return;
  MailApp.sendEmail({
    to: destinos.join(','),
    subject: asunto,
    htmlBody: html,
    name: CORREO_REMITENTE_NOMBRE_,
    inlineImages: { logoFrozz: logoBlob_() }
  });
}

function correoConfirmacionSolicitud_(destino, o) {
  var html = plantillaCorreo_({
    nombre: o.nombre,
    parrafos: [
      'Gracias por comunicarse con <strong>Frozz Colombia</strong>. Le confirmamos que su solicitud de diseño <strong>"' + o.nombreProyecto + '"</strong> fue registrada exitosamente y ya se encuentra en proceso de revisión por nuestro equipo técnico.',
      'En breve, uno de nuestros diseñadores se pondrá en contacto con usted para darle seguimiento a su caso.',
      'Le recomendamos conservar este número para consultar el estado de su solicitud en cualquier momento a través de nuestro portal.'
    ],
    cajaTicket: { label: 'NÚMERO DE TICKET', valor: o.ticket },
    acento: 'brand'
  });
  enviarCorreo_(destino, 'Tu solicitud de diseño fue registrada · ' + o.ticket, html);
}

function correoNuevaSolicitudInterna_(o) {
  var html = plantillaCorreo_({
    nombre: 'equipo de diseño',
    parrafos: [
      'Se creó una nueva solicitud de diseño <strong>' + o.ticket + '</strong>, <strong>"' + o.nombreProyecto + '"</strong>, solicitada por <strong>' + o.solicitanteNombre + '</strong>. Por favor revísala, inicia su gestión y asigna un responsable.'
    ],
    cta: { texto: 'Gestionar solicitud', url: o.urlGestion },
    acento: 'brand'
  });
  enviarCorreo_(CORREOS_NOTIFICACION_NUEVAS_SOLICITUDES_, 'Nueva solicitud de diseño creada · ' + o.ticket, html);
}

function correoAsignacionResponsable_(destino, o) {
  var html = plantillaCorreo_({
    nombre: o.nombre,
    parrafos: [
      'Se le asignó la solicitud de diseño <strong>' + o.ticket + '</strong>, <strong>"' + o.nombreProyecto + '"</strong>. Puede abrir la gestión de esta solicitud con el botón de abajo para ver el detalle y continuar con el flujo.'
    ],
    cta: { texto: 'Abrir solicitud', url: o.urlGestion },
    acento: 'brand'
  });
  enviarCorreo_(destino, 'Se te asignó una solicitud de diseño · ' + o.ticket, html);
}

function correoDecisionAprobacion_(destino, o) {
  var aprobado = o.decision === APROBACIONES_.APROBADO;
  var parrafos = [
    aprobado
      ? 'Le informamos que su solicitud de diseño <strong>' + o.ticket + '</strong>, <strong>"' + o.nombreProyecto + '"</strong>, fue <strong style="color:#1E8F6F;">aprobada</strong> y continúa a la etapa de <strong>Desarrollo</strong>.'
      : 'Le informamos que su solicitud de diseño <strong>' + o.ticket + '</strong>, <strong>"' + o.nombreProyecto + '"</strong>, fue <strong style="color:#C23A2E;">rechazada</strong>. A continuación encontrará el motivo.'
  ];
  if (o.responsableNombre) {
    parrafos.push(
      'Para más información, puede comunicarse con el diseñador a cargo de su solicitud: <strong>' + o.responsableNombre + '</strong>' +
      (o.responsableCorreo ? ' (' + o.responsableCorreo + ')' : '') + '.'
    );
  }
  var html = plantillaCorreo_({
    nombre: o.nombre,
    parrafos: parrafos,
    nota: o.comentario ? { label: 'Comentario del equipo de diseño', texto: o.comentario } : null,
    acento: aprobado ? 'success' : 'danger'
  });
  enviarCorreo_(
    destino,
    (aprobado ? 'Tu solicitud de diseño fue aprobada' : 'Tu solicitud de diseño fue rechazada') + ' · ' + o.ticket,
    html
  );
}

function correoFinalizacion_(destino, o) {
  var html = plantillaCorreo_({
    nombre: o.nombre,
    parrafos: [
      'Su solicitud de diseño <strong>' + o.ticket + '</strong>, <strong>"' + o.nombreProyecto + '"</strong>, fue <strong style="color:#1E8F6F;">finalizada</strong>. Gracias por confiar en Frozz Colombia.'
    ],
    acento: 'success'
  });
  enviarCorreo_(destino, 'Tu solicitud de diseño fue finalizada · ' + o.ticket, html);
}
