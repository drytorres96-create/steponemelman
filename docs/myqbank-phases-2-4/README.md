# My Q Bank · fases 2–4

Implementación del 14-oct-2026 sobre `main` `313cd93e99bfef9f0456c009e43ba4355cb7f793`,
que ya incluye la fase 1 fusionada en PR 61. Rama integrada:
`codex/myqbank-phases-2-4`.

## Resultado

| Fase | Entrega |
| --- | --- |
| 1 · ajustes | Base visual aplicada a la aplicación real, acceso y recuperación; acciones accesibles en móvil; temas claro y oscuro. Se conserva la muestra aislada. |
| 2 | Bloques Tutor/Test de 5–80 ítems, orden y presentaciones persistentes, navegación libre, borradores de los diez formatos, marcas, omisiones, cierre y reanudación. Subrayados privados con respaldo local y sincronización CAS. |
| 3 | Dashboard con progreso real y Build a block: NBME / Mehlman Concepts / Mixed. Sistemas, grupos, forma y búsqueda; contador basado en la misma selección que se inicia. Settings y progreso detallado integrados. |
| 4 · software | Reproductor compartido, figuras y ampliación, laboratorio con fuente USMLE, explicación por secciones disponibles, resumen ampliable, drills con solución oculta y ayudas existentes. Los recorridos diarios y cajas conservan su motor y reciben explicación adaptable y subrayado. |
| 4 · editorial | 24 borradores privados en español, fuentes comprobadas y nueve observaciones de revisión primaria. Falta revisión médica independiente por ID y resolución de las observaciones antes de publicar el piloto. |

La cobertura editorial completa y la activación general son fase 5. No se ha
desplegado ni activado esta rama en Cloudflare. La tabla privada de anotaciones
y los dos paquetes de borradores sí están guardados en Supabase.

## Abrir y revisar

En el entorno habitual de la aplicación, abrir `/?workspace=myqbank`. La misma
cuenta y los proveedores existentes sirven el material privado. La activación
general mediante `VITE_MYQBANK_ENABLED=true` se reserva a la fase 5.

Para verificar los recorridos sin datos privados:

```sh
npm ci
npx playwright test e2e/myqbank-workspace.spec.ts
node qa/myqbank-review.mjs
```

El arnés utiliza datos sintéticos; las pruebas de navegador interceptan el API
NBME. El script de capturas prepara esa misma demostración automáticamente
y genera las capturas. Para una vista interactiva autónoma sin API, la muestra
de fase 1 sigue disponible mediante `npm run dev:myqbank`.

CI entrega `myqbank-phases-2-4` con el build real `dist/` y evidencia visual, y
`myqbank-phase-1-preview` con la muestra independiente. El build real necesita
el Worker y los permisos habituales; abrir sus archivos como HTML local no
sustituye esa integración.

## Persistencia y compatibilidad

- `study_state.myqbankBlocks` es opcional. Guarda la presentación preparada de
  cada concepto, referencias NBME exactas, modo, cursor y borradores. Las nuevas
  propiedades NBME también son opcionales; ambos estados históricos siguen
  pasando sus pruebas. Las solicitudes de preguntas se dividen en lotes de 20.
- El primer envío cuenta una sola vez. Test oculta resultados, mapa y métricas
  hasta cerrar. Una omisión no crea un fallo. Una respuesta por revisar queda
  fuera del denominador de aciertos. Respuestas concurrentes distintas conservan
  ambos textos y quedan pendientes; no se elige silenciosamente un acierto.
- Los relojes de control avanzan respecto de las marcas ya sincronizadas,
  incluso si otro dispositivo tenía una hora posterior. El tiempo activo se
  conserva por vista; los conceptos no incrementan el cronómetro NBME.
- Subrayados por cuenta, fuente, revisión, variante, versión editorial y región.
  Se reasocian únicamente a una coincidencia literal inequívoca. Los borrados
  dejan lápidas y no reaparecen al sincronizar un dispositivo desconectado.
- Se mantienen IDs, letras NBME, intentos, FSRS, metas, cuotas gratuitas y firmas
  de los RPC existentes. Un bloque de práctica adicional no sustituye las cajas
  ni la selección del trabajo diario.
- Los snapshots aumentan el tamaño de `study_state`. Antes de crear otro bloque
  se comprueba el umbral preventivo de 12 MiB, por debajo del límite de 16 MiB.
  La compactación de historia requiere un diseño posterior; no se borra progreso
  para conseguir espacio.

## Supabase y contenido privado

Proyecto: `rcwvwxchpukjbtqsrxfi`. Migración aplicada:
`myqbank_private_annotations_cas`, reproducida en
[`database/myqbank-annotations.sql`](../../database/myqbank-annotations.sql).
RLS exige cuenta propietaria y pertenencia a la aplicación; las anotaciones
NBME también requieren pertenencia NBME. No se usa `service_role` en el cliente.

Inventario revalidado: 2270 conceptos / 34 módulos; 596 preguntas NBME vigentes,
592 habilitadas. El piloto conserva los hashes de sus 24 originales. No se
modificaron módulos, preguntas, índices, `bankVersion` ni las claves evaluadoras.

Los dos paquetes están en `audits/myqbank/2026-10-14/pilot-drafts.json`, uno en
`corpus_assets` y otro en `nbme_assets`. La separación conserva el permiso NBME.

| Almacén | Piezas | Estado | MD5 del paquete JSONB |
| --- | --- | --- | --- |
| `corpus_assets` | 12 | `pending_independent_review` | `375ad2428d3f275d9500c267dd5e13bf` |
| `nbme_assets` | 12 | `pending_independent_review` | `e4c88de3f6b3f34e8d1a014f90898998` |

Los borradores, identificadores del piloto, fuentes clínicas y observaciones por
ID permanecen privados. Nueve observaciones incluyen errores de fundamento,
supuestos que faltan y una figura necesaria ausente; algunas requieren revisar
la evaluación original mediante un cambio versionado separado. Se inspeccionaron
las seis figuras NBME seleccionadas. Esto es revisión primaria, no independiente.

El lector acepta adaptaciones solo con `review=approved`, evidencia por sección,
revisor distinto del autor y coincidencia exacta de fuente/revisión/variante/hash.
Los borradores no están en las rutas que consume el lector. El texto disponible
sigue accesible y la adaptación pendiente se identifica. Una sola sección no
crea pestañas; no aplicable y pendiente son estados distintos. No hay generación
automática de explicaciones ni una nueva cuota de IA.

Antes de publicar el piloto se debe cumplir [AGENTS.md](../../AGENTS.md):
«obtener revisión independiente por ID», validar el corpus completo y publicar
atómicamente con CAS. No se ha sustituido esa revisión por una aprobación automática.

## Criterios de diseño aplicados

- **ADHD/neurocognición:** mostrar primero una idea y permitir ampliarla; conservar
  frases completas, negaciones, números y unidades. Reduce información simultánea
  sin inventar resúmenes clínicos. No supone eficacia clínica validada para ADHD.
- **Coach/productividad:** continuar antes de crear trabajo adicional; sesión
  finita, pausa visible y cierre sin penalizar omisiones. Mantener el calendario.
- **Diseño web:** tokens del ZIP, controles de 44 px, foco visible, temas y reflujo.
  En móvil, responder lleva al resultado y deja Labs después de la explicación.
- **Revisión adversarial:** proteger resultados Test, exactitud de la fuente,
  colisiones entre dispositivos, permisos y rollback sin pérdida de historia.

Ver [validación](VALIDATION.md) y [rollback](ROLLBACK.md).
