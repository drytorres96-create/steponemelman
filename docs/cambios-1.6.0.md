# Versión 1.6.0 · Preguntas de aplicación

La plataforma permite estudiar las tres formas importadas en sesiones de 5, 10 o 20 preguntas. Se incorporan a **Elegir contenido → Preguntas**; **Hoy** permite retomar una sesión pendiente y **Progreso → Preguntas** separa el resultado inicial de las correcciones. Las tres formas se destinan a estudio por decisión del usuario. No se calcula puntuación oficial, equivalencia NBME ni probabilidad de aprobar.

## Decisiones de diseño

La revisión con agentes de productividad, pedagogía médica y aprendizaje con ADHD recomendó una acción principal, pasos breves y pausas disponibles, sin razonamientos escritos obligatorios ni valoraciones de confianza en cada respuesta. Son revisiones de IA desde esas perspectivas, no una evaluación clínica humana.

- Los filtros de sistema, disciplina, forma y estado se combinan con AND. Las preguntas ya respondidas siguen disponibles.
- Las opciones A–I se conservan. Se puede responder con radio o teclado, y comprobar con una acción explícita.
- Un error se repite tras las otras preguntas del bloque y sigue pendiente hasta acertarlo. La sesión puede pausarse siempre.
- El primer resultado no cambia al repetir. Los conflictos entre dispositivos se conservan y se excluyen del cálculo inicial.
- La explicación y el objetivo aparecen después de comprobar. El texto de origen permanece en inglés; no se inventan traducciones o distractores.
- Se conservaron nueve asociaciones conservadoras con conceptos existentes, ocho en preguntas actualmente disponibles, y se muestran como sugerencias; las demás preguntas permiten explorar los fundamentos por sistema y disciplina. Ninguna respuesta marca automáticamente como dominado un concepto.

## Inventario de esta importación

Versión del banco: `1.0.0-392d86977641`.

| Forma | Disponible para práctica | Pendiente de revisión | Total recibido |
| --- | ---: | ---: | ---: |
| 27 | 124 | 74 | 198 |
| 28 | 122 | 78 | 200 |
| 29 | 132 | 66 | 198 |
| Total | 378 | 218 | 596 |

Los 596 registros recibidos se preservan; no se afirma que sean una copia completa de cada formulario oficial. Se reconciliaron siete identificadores y se conservaron opciones que las columnas limitadas del Excel no incluían. El export posterior de la forma 27 sustituye campos no vacíos conservando trazabilidad de los anteriores.

`Disponible` significa que pasó controles estructurales; no certifica exactitud médica u OCR completa. La clasificación temática es inferida y orientativa. Los motivos de bloqueo incluyen figuras necesarias sin estímulo utilizable, opciones incompletas o desalineadas, valores ilegibles y revisión editorial pendiente. Pueden coincidir varios motivos en un registro.

Los 37 recortes recibidos son referencias privadas y no se muestran como estímulos: algunos revelan respuestas o tienen recortes incompletos. Para habilitar los 218 pendientes se necesita cotejar los PDF o imágenes completos y corregir cada registro con una nueva revisión. No se reconstruyen claves ni tablas por suposición.

## Guardado y acceso

Se añade `nbme_state` con versiones, borradores, pausas, intentos y sincronización CAS. La copia local se separa por usuario. Un inicio o una reanudación en línea vuelve a comprobar el acceso y la disponibilidad. Las sesiones guardan referencias exactas de preguntas; no se sustituye una revisión silenciosamente. El material cargado puede seguir utilizándose sin conexión; los cambios necesitan volver a sincronizarse para aparecer en otro dispositivo.

`study_state` y el dominio de los conceptos existentes permanecen independientes. La verificación posterior a la carga confirmó que el progreso anterior no cambió.

El banco reside en `nbme_assets`, con RLS y acceso explícito mediante `nbme_members` además de `app_members`. La migración no concede membresía automáticamente. Los endpoints `/api/nbme/*` exigen una cuenta verificada, permiso del banco, solicitudes acotadas y respuestas sin caché pública. El repositorio y los archivos estáticos no contienen las preguntas ni las respuestas.

La habilitación inicial del destinatario requiere completar la confirmación de autorización pendiente. Hasta entonces se conserva funcional el estudio de conceptos y la sección de preguntas muestra que falta acceso.

## Comprobaciones

- Importador y verificador independientes: 596 identidades únicas, conservación de opciones, paridad catálogo/preguntas, hashes de revisión, siete correcciones de ID y figuras de referencia intactas.
- Once pruebas del importador; pruebas de modelo, interfaz, permisos y sincronización, incluidas corrección repetida y recuperación en un segundo dispositivo simulado.
- Contrato del cliente validado contra los 596 registros privados: 378 aceptados para practicar, 218 rechazados.
- La batería final contiene 218 pruebas correctas y una prueba de corpus omitida; el contrato privado NBME sí se ejecutó. La comprobación visual en navegador quedó impedida porque el navegador bloqueó el servidor local; la interfaz fue verificada mediante pruebas de DOM.
- TypeScript y compilación de producción; la auditoría de Supabase no reportó problemas de RLS en las tablas nuevas.

El control de Supabase mantiene un aviso previo sobre protección contra contraseñas filtradas, ajeno a esta migración. Documentación: [protección de contraseñas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Los scripts reproducibles están en `scripts/nbme`; sus entradas, sobrescrituras editoriales y salidas con contenido deben permanecer privadas. Para probar el contrato se usa `STEP1_NBME_BANK_DIR` apuntando al directorio privado del banco.
