# Figura NBME sin aviso previo

Se retiraron el aviso «Esta pregunta incluye una figura. Consúltala para responder.» y los enlaces «Ir a la figura» / «Ir a las respuestas». La imagen, el botón **Ampliar figura**, el visor y la carga diferida se conservan. También se retiraron las siete reglas CSS exclusivas del aviso.

Las capturas usan exclusivamente el arnés sintético (`escena=abierto&figura=larga&tabla=1`), con una imagen generada por el propio arnés de 1200 × 800 y texto sin contenido clínico. No consultan Supabase, el banco NBME ni Workers AI. Fecha: 7 de octubre de 2026; reloj del arnés fijado al 5 de octubre a las 07:30 de Nueva York.

| Vista | Antes | Después |
| --- | --- | --- |
| Pregunta a 390 px | [Captura](figura/nbme-antes-390.png) | [Captura](figura/nbme-despues-390.png) |
| Pregunta a 1280 px | [Captura](figura/nbme-antes-1280.png) | [Captura](figura/nbme-despues-1280.png) |
| Visor a 390 px | [Captura](figura/modal-antes-390.png) | [Captura](figura/modal-despues-390.png) |
| Visor a 1280 px | [Captura](figura/modal-antes-1280.png) | [Captura](figura/modal-despues-1280.png) |

Los registros [antes](figura/validacion-antes.json) y [después](figura/validacion-despues.json) verifican ambas anchuras: el aviso pasa de uno a cero; la imagen mantiene sus dimensiones; abrir el visor, cerrarlo con Escape y devolver el foco a Ampliar funciona; no hay desbordamiento horizontal ni errores del navegador. Las capturas posteriores se inspeccionaron visualmente.

Pruebas de componente: `npx vitest run src/nbme/ui.test.tsx src/nbme/player-recuperacion.test.tsx`, **22/22**. Cubren la ausencia del aviso y enlaces, la descarga al entrar en el viewport, el bloqueo antes de decodificar y el visor existente.

Las pruebas de navegador existentes se adaptaron para desplazar la figura y enfocar las respuestas sin los enlaces retirados. El caso horizontal verifica geometría y foco programático del fieldset; la navegación del visor mantiene las comprobaciones de foco y Escape.

Resultado: **7/7 E2E** (36,5 s), incluidos los dos tamaños de figura, carga diferida, errores de descarga/decodificación y reintento, móvil horizontal y visor del flujo de estudio. La ejecución usó un Vite sintético aislado en el puerto 5207 y una configuración equivalente a la del repositorio para evitar compartir servidor con las pruebas de recuperación.

```sh
CHROMIUM_PATH=/usr/bin/chromium npx playwright test e2e/movil-auditoria.spec.ts e2e/estudio.spec.ts --grep 'figura grande sintética|la descarga espera|error-descarga|error-imagen|respuestas y modal|NBME: la figura se amplía'
```
