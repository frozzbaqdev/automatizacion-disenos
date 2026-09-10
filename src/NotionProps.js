/**
 * Nombres exactos de las propiedades de Notion y sus vocabularios válidos.
 * Ningún otro archivo debe escribir estos nombres como texto literal — los
 * `select`/`status` de Notion crean una opción nueva en silencio ante un
 * typo, en vez de fallar.
 */

var P_DIS_ = {
  TITULO: 'Nombre del proyecto',
  TICKET: '#TICKET',
  ID: 'ID',
  SOLICITANTE: 'SOLICITANTE',
  CLIENTE: 'CLIENTE',
  RESPONSABLE: 'RESPONSABLE',
  CORREO_SOLICITANTE: 'Correo solicitante',
  ESTADO: 'Estado',
  ETAPA: 'Etapa',
  PRIORIDAD: 'Prioridad',
  TIPO: 'Tipo',
  CLASIFICACION: 'Clasificación',
  APROBACION: 'APROBACION',
  ORDEN_TRABAJO: 'ORDEN DE TRABAJO',
  DESCRIPCION: 'Descripción solicitud',
  NOTAS: 'Notas',
  DOCUMENTOS_SOPORTE: 'DOCUMENTOS SOPORTE',
  GESTIONAR: 'GESTIONAR DISEÑO',
  FECHA_RECIBIDO: 'Fecha recibido',
  FECHA_INICIO: 'Fecha inicio',
  FECHA_LIMITE: 'Fecha limite de entrega',
  FECHA_ENTREGA: 'Fecha de entrega'
};
// Nunca escribir: "progreso" (formula), "Check" (button),
// "Responsable" (people, legacy — colisiona en mayúsculas con RESPONSABLE),
// "Fecha tentativa de entrega" (queda siempre vacía), "ID" (unique_id, autogenerado).

var P_PERSONAL_ = {
  NOMBRE: 'Nombre',
  CORREO: 'Correo corporativo',
  ESTADO: 'ESTADO',
  EQUIPO: 'EQUIPO',
  CARGO: 'cargo'
};

var P_CLIENTE_ = {
  NOMBRE: 'NOMBRE DE CLIENTE',
  DOCUMENTO: '#DOCUMENTO',
  STATUS: 'CLIENTE_STATUS',
  CORREO: 'CORREO',
  CIUDAD: 'CIUDAD',
  TIPO_DOCUMENTO: 'TIPO DE DOCUMENTO'
};

var P_ORDEN_ = {
  CLIENTE: 'CLIENTES (COMERCIAL)',
  OT: 'OT',
  SERVICIO: 'Servicio'
};

var ETAPAS_ORDEN_ = ['Revisión', 'Aprobación', 'Desarrollo', 'Finalizada'];

/** Valor interno de Etapa para solicitudes rechazadas. Nunca se expone a los clientes: las vistas siguen mostrando la etapa "Aprobación" en rojo (ver mapearSolicitudPublica_/mapearSolicitudGestion_). */
var ETAPA_RECHAZADA_ = 'Rechazada';

var ESTADOS_ = {
  SIN_EMPEZAR: 'Sin empezar',
  EN_PAUSA: 'En pausa',
  EN_CURSO: 'En curso',
  LISTO: 'Listo'
};

var PRIORIDADES_VALIDAS_ = ['Urgente', 'Alta', 'Media', 'Baja'];
var PRIORIDAD_DEFECTO_ = 'Baja';

var TIPOS_VALIDOS_ = [
  'Solicitud sencilla',
  'Solicitud de complejidad media',
  'Solicitud compleja'
];

var CLASIFICACIONES_VALIDAS_ = ['Diseño comercial', 'Diseño ing de detalle'];
// Clasificación que exige seleccionar una Orden de Trabajo (ver ORDEN_TRABAJO arriba).
var CLASIFICACION_ORDEN_TRABAJO_ = 'Diseño ing de detalle';

var APROBACIONES_ = {
  APROBADO: 'APROBADO',
  RECHAZADO: 'RECHAZADO'
};

var PERSONAL_ESTADO_VINCULADO_ = 'Vinculado';
