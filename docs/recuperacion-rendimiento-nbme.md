# Recuperación de rendimiento y presentación NBME

12 de septiembre de 2026. Base: aplicación 1.6.0, commit `8f3bdd5316514f9488eba936de2af645639507b9`.

Esta rama reconstruye cambios de software comprobables a partir del código publicado. Los dos documentos de traspaso adjuntos describen la etapa inicial del proyecto; no contienen el código final de 1.6.1 ni su banco revisado.

## Problemas y cambios

- La API leía por separado el catálogo y cada pregunta. Ahora, tras comprobar sesión y membresía, una consulta obtiene el catálogo y las revisiones solicitadas. Un bloque de 20 preguntas requiere 3 solicitudes a Supabase en lugar de 23. La respuesta se reordena por las referencias solicitadas y se rechaza por completo si falta alguna revisión o si el catálogo bloquea alguna pregunta. Se conservan RLS, credenciales del usuario y respuestas privadas sin caché pública.
- Vite forzaba todas las pantallas al archivo inicial. Las pantallas secundarias se importan al abrirlas con `React.lazy` y `Suspense`; se elimina `inlineDynamicImports`. El plan diario y la selección de sesiones se memorizan por sus entradas, y el selector NBME calcula el progreso una sola vez por pregunta antes de ordenar.
- El reproductor separa párrafos existentes, alinea letras y opciones mediante columnas y permite desplazar tablas dentro de su contenedor en móvil. Los bloques opcionales de presentación se validan; una tabla solo se dibuja cuando contiene encabezados explícitos y todas sus celdas. No se infieren columnas ni se inventan figuras. Las explicaciones siguen ocultas antes de responder.

## Estado del contenido y publicación

La consulta de lectura de Supabase confirmó el catálogo activo `1.0.0-392d86977641`, con 596 posiciones. Hay 488 revisiones con bloques de presentación para 484 preguntas distintas. Eso deja 112 preguntas sin esa presentación; los registros parciales no acreditan por sí mismos que sean el banco final revisado.

Esta rama no activa esos registros ni modifica preguntas, claves, progreso, sesiones o esquema de base de datos. No cambia la versión declarada a 1.6.1: esa entrega requiere recuperar o rehacer la revisión faltante y comprobar el catálogo completo antes de publicarlo.

## Verificación

Se incluyen pruebas de carga agrupada con 20 revisiones en orden distinto, fallos de acceso y carga, tablas incompletas, conservación de texto y ocultación de las explicaciones. Se mantienen las pruebas existentes de sesiones y sincronización.

La instalación/ejecución mediante npm no estuvo disponible en el entorno local. La suite y la compilación deben ejecutarse con el flujo existente de GitHub Actions sobre esta rama. No se declara una comprobación visual con cuenta real ni una mejora de tiempo de carga medida en producción.

Referencias de implementación: [React.lazy](https://react.dev/reference/react/lazy) y [filtros IN de PostgREST](https://docs.postgrest.org/en/stable/references/api/tables_views.html#operators).
