# Validación · fases 2–4

Fecha: 14-oct-2026. Fixtures de navegador sintéticos; no se copió contenido
privado a Git ni a las capturas. No se utilizó una cuenta real para simular
respuestas de estudio.

## Comprobaciones

| Comprobación | Resultado |
| --- | --- |
| Instalación | `npm ci`; sin dependencias nuevas. |
| Unitarias | 1181 aprobadas; 2 omisiones esperadas. |
| Aplicación existente e integrada | 126 pruebas de navegador: 119 anteriores y 7 nuevas. |
| Muestra aislada fase 1 | 12 pruebas de navegador aprobadas. |
| Compilación | `npm run build` y `npm run build:myqbank` correctos. |
| Revisión visual | 24 capturas actuales; 390/1280, claro/oscuro; sin errores de página ni desbordamiento horizontal. |
| Anotaciones en Supabase | Migración aplicada; 10 aserciones RLS/CAS completadas en transacción revertida. |
| Conservación del piloto | 12 originales NBME y 12 conceptos mantienen su MD5 después de guardar los borradores. |

La ejecución completa de CI se enlaza desde el PR. Las pruebas locales no
equivalen a verificar un despliegue en Cloudflare.
Vite conserva una advertencia de tamaño: el chunk principal mide 564,63 kB
(163,63 kB gzip). No se elevó el umbral para silenciarla; revisar su división
antes de la activación general.

## Casos nuevos

- Bloque Test de 80 ítems: descarga por lotes de 20, borrador sin enviar, marca,
  pausa, recarga, cierre explícito y omisiones sin calificación. No se muestran
  resultado ni explicación antes del cierre.
- Los diez formatos de Mehlman conservan borradores y envían una sola respuesta.
  Test no colorea aciertos/fallos ni agrega sus resultados a las métricas visibles.
- Mixed conserva el orden exacto, los dos materiales y ambas historias tras
  recargar. Reanudar una sesión antigua de conceptos conserva su cola original.
- Subrayado tras recarga, eliminación persistente, cola offline, borrado durante
  un CAS en curso y respuesta tardía de otra cuenta.
- Permisos reales: lectura/escritura cruzada, propietario falsificado,
  pertenencia NBME ausente y acceso revocado. Los usuarios sintéticos y filas de
  esta prueba se retiraron mediante ROLLBACK.
- Conflictos de respuestas conservan ambos textos y quedan pendientes. Un reloj
  de otro dispositivo adelantado no deshace una activación, reanudación o borrador.
- Figura necesaria: no permite enviar mientras no se haya cargado; reintento y
  ampliación usan el visor existente. Laboratorio accesible en ambos tamaños.
  En móvil, el foco pasa al resultado y la explicación precede a la tabla Labs.
- Contrato editorial: rechaza fuente, revisión, variante o hash incorrectos y
  aprobación sin revisor independiente; no fabrica alternativas ni pestañas.

Los 119 recorridos anteriores cubren también recuperación IA, cuotas, cajas,
examen, historial, figuras, almacenamiento y selección diaria. No cambió el
evaluador ni se elevó `EVALUADOR_VERSION`.

## Capturas antes y después

| Pantalla | Antes 390 / 1280 | Después 390 / 1280 |
| --- | --- | --- |
| Dashboard | [390](../myqbank-phase-1/screenshots/before-dashboard-390.png) / [1280](../myqbank-phase-1/screenshots/before-dashboard-1280.png) | [390](after/dashboard-390-dark.png) / [1280](after/dashboard-1280-dark.png) |
| Estudio | [390](../myqbank-phase-1/screenshots/before-study-390.png) / [1280](../myqbank-phase-1/screenshots/before-study-1280.png) | [390](after/study-after-390-dark.png) / [1280](after/study-after-1280-dark.png) |
| Settings | [390](before/settings-390.png) / [1280](before/settings-1280.png) | [390](after/settings-390-light.png) / [1280](after/settings-1280-light.png) |
| Acceso | [390](before/auth-390.png) / [1280](before/auth-1280.png) | [390](after/auth-390-light.png) / [1280](after/auth-1280-light.png) |

También se incluyen el estado previo a responder, recuperación de contraseña y
ambos temas. Las capturas de Settings/acceso anteriores usan sus componentes
anteriores conservados detrás de la activación; dashboard/estudio utilizan la
línea base tomada antes de fase 1. No son datos ni estadísticas del usuario.

## Revisión adversarial y límites

Se inspeccionaron lectura/mezcla de estados, permisos, deduplicación, publicación
editorial, exposición de Test y continuidad del temporizador. Se corrigieron
la cuenta de conflictos ocultos de Test, el tiempo NBME durante conceptos, la
selección de texto en opciones y la pérdida de activación por reloj adelantado.
El rollback exige mantener los lectores nuevos; volver al binario anterior
puede rechazar bloques de 80 ítems.

Los 24 borradores todavía no cumplen la revisión médica independiente por ID.
No se publicaron adaptaciones aprobadas ni se corrigieron silenciosamente claves
del corpus. La tabla Labs contiene diez rangos contrastados con el documento
público USMLE y enlaza la tabla completa; no sustituye valores de un paciente.

Quedan para la fase 5 la publicación del piloto aprobado, ampliación editorial,
prueba manual con lector de pantalla y Safari/Firefox, revisión completa al 200 %
del flujo conectado y verificación del despliegue real. La muestra aislada sí
conserva su prueba de reflujo equivalente al 200 %. Los recorridos diarios
conservan mensajes históricos en español; los controles del nuevo bloque están
en inglés y el motor diario no se reescribe.
