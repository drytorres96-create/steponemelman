# Claude: reparto económico por función · 1.39.0

Antes las seis funciones compartían Sonnet 5.5. Ahora cada función tiene un
perfil central en `src/server/perfiles-claude.ts`: Haiku 5.5 para el uso habitual,
con razonamiento medio para entender el pedido, chat, práctica y calificación;
low para seleccionar candidatos y sin pensamiento para la frase del dashboard.
La [guía de modelos](modelos-claude.md) documenta parámetros, límites y ajustes.
AGENTS.md y CLAUDE.md conservan la decisión aprobada por Yoel.

Después de una explicación aparece «Revisar con Sonnet», con aviso de mayor
consumo. Revisa a petición explícita usando Sonnet 5.5 medium; la siguiente
pregunta vuelve a Haiku. Reintentar la revisión conserva Sonnet. No se activa al
montar el tutor, ante un error, ni al generar ejercicios. Requiere historial y
la misma autorización de fuentes que el chat habitual.

La API recibe parámetros de pensamiento compatibles con cada modelo. Se elimina
el reintento que retiraba esfuerzo y pensamiento al recibir un 400, para no
cambiar el consumo silenciosamente. La caché distingue perfiles y revisiones.
La contabilidad contempla el umbral de 100 000 tokens de entrada de Haiku y sus
tarifas de caché. El presupuesto mensual y los frenos existentes se conservan.

El evaluador pasa a 2.6.0 por el cambio de modelo, sin cambiar criterios locales
ni recalificar intentos históricos. Los estados anteriores y actuales se prueban
con datos sintéticos. No se escribe en la base, no se cambia contenido privado,
letras NBME, progreso ni RPC. Las fuentes restringidas y respuestas incompletas
siguen bloqueadas; una revisión por IA no constituye validación médica humana.

## Evidencia visual

| Ancho | Antes | Después | Revisión |
| --- | --- | --- | --- |
| 390 px | [Antes](claude-economico/before-390.png) | [Después](claude-economico/after-390.png) | [Sonnet](claude-economico/review-390.png) |
| 1280 px | [Antes](claude-economico/before-1280.png) | [Después](claude-economico/after-1280.png) | [Sonnet](claude-economico/review-1280.png) |

Capturas sintéticas con orden de CSS de producción. También se comprueba tema
oscuro, teclado, control táctil de 44 px, ancho sin desbordamiento, conversación
conservada y ausencia de cambios en los intentos al pedir la revisión.

## Validación

Las puertas locales y el resultado de CI sobre el HEAD exacto se registran en el
PR. Se prueban los perfiles reales de cada ruta, reintentos sin escaladas, errores
de parámetros, tarifas y umbrales, caché por perfil, compatibilidad de progreso y
la revisión manual completa. No se hicieron llamadas facturadas a Anthropic;
estas comprobaciones no miden equivalencia clínica ni ahorro mensual real.

Puertas locales en orden, con Node 22:

```text
npm ci
added 170 packages in 2s

npm test
Test Files  117 passed | 1 skipped (118)
Tests       1395 passed | 2 skipped (1397)

npm run build
tsc -b && vite build
sin errores

npx playwright test e2e/claude-modelos.spec.ts
2 passed
```

Las dos omisiones unitarias son las esperadas. CI ejecuta también toda la suite
de navegador, las pantallas integradas y la vista previa aislada antes de fusionar.
