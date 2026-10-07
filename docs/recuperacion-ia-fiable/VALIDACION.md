# Recuperación IA NBME con espera, reintento y retorno

La prueba de navegador usa `NbmeProvider`, transporte HTTP, evaluación y almacenamiento locales reales. Playwright intercepta las peticiones con un banco sintético, saldo del 80 % y respuestas controladas; no llama a Cloudflare ni a Supabase. No sustituye el generador de React.

## Contratos del navegador

`e2e/recuperacion-ia-fiable.spec.ts` contiene cuatro recorridos a 390 y 1280 px (ocho casos):

- HTTP 503 JSON con `Retry-After: 60`, conservación del mensaje recibido y ausencia de reintento automático. El reintento manual mantiene la petición pendiente a los 26 s y luego acepta cuatro ejercicios. Respuesta comprobada y borrador se guardan y retoman tras recargar, sin regeneración. El retorno original/siguiente conserva sesión, revisión e historial.
- Timeout del cliente a los 90,001 s, indicador retirado y botón de generación reactivado; el intento permanece intacto y el 200 posterior no crea caché.
- Salida a la pregunta original durante la espera: cancelación y descarte del 200 tardío.
- Salida a la siguiente pregunta durante la espera: mismo descarte; sólo cambia la marca de revisión del intento existente, sin nueva sesión ni intento.

Se verifica revisión histórica y opción original en la petición de generación. Se comprueban almacenamiento, sesión, progreso, accesibilidad del indicador y ausencia de errores de página/desbordamiento horizontal. La respuesta 503 sintética reproduce el contrato comunicado del Worker (`codigo: tiempo`); la UI muestra su mensaje recibido y conserva `Retry-After: 60`.

## Comparación visual

BEFORE: build aislado del HEAD `463c1771b12445110874f7b0ea28195703f133c2` mediante un worktree detached. AFTER: build nuevo de la fuente final congelada. Ambos usan el mismo banco sintético, saldo, intervalo de 26 s y HTTP 503 con `Retry-After: 60`. El BEFORE reproduce el error controlado genérico «Error del servidor.»; el AFTER reproduce el contrato nuevo `codigo: tiempo` con su mensaje orientado al retorno o reintento. Ninguna captura acredita una llamada real de producción.

`capturas.spec.ts` comprueba HTML compilado, sin `/@vite/client`, y guarda cuatro imágenes por anchura: saldo, 503, generación y espera de 26 s. Los JSON anexos registran el bundle, navegador, fixture y conservación del intento. El BEFORE permite observar el timeout anterior de 25 s; el AFTER debe mantener la espera visible a los 26 s.

Los puertos son 5321 y 5322. No se insertan elementos ni estilos para preparar las capturas; se usa movimiento reducido y se desenfoca el control activo.

## Ejecución

Focales, una vez autorizada la puerta de pruebas:

```sh
CHROMIUM_PATH=/usr/bin/chromium npx playwright test e2e/recuperacion-ia-fiable.spec.ts
```

Capturas sobre el build preparado:

```sh
RECUPERACION_CAPTURE=antes RECUPERACION_QA_BUILD=/workspace/work/recuperacion-ia-qa-antes npx playwright test --config docs/recuperacion-ia-fiable/playwright-capturas.config.ts
RECUPERACION_CAPTURE=despues RECUPERACION_QA_BUILD=/workspace/work/recuperacion-ia-qa-despues npx playwright test --config docs/recuperacion-ia-fiable/playwright-capturas.config.ts
```

## Resultado comprobado

| Comprobación | Resultado |
| --- | --- |
| Transporte y UI de recuperación (coordinador) | 20/20 |
| Worker y clasificación de fallos (coordinador) | 123/123 |
| Compatibilidad tras ampliar espera (coordinador) | 19/19 |
| Ocho recorridos nuevos, 390 y 1280 px | 8/8 en 42,1 s |
| Figuras NBME, según [FIGURA.md](FIGURA.md) | 7/7 en 36,5 s |
| Build sintético BEFORE / AFTER | Verde; 2,16 s / 2,03 s |
| Capturas compiladas BEFORE / AFTER | 2/2 en 10,2 s / 2/2 en 8,6 s |
| Unitarias completas finales | 1076 aprobadas y dos omisiones previstas; 99 archivos aprobados y uno omitido, 82,05 s |

El bundle principal observado es `index-Bu-Dv-wC.js` BEFORE y `index-XY0GNv0U.js` AFTER. El bundle de `NbmePlayer` es `NbmePlayer-CuMgHBOm.js` BEFORE y `NbmePlayer-DyzBfcrn.js` AFTER. Los builds fueron preparados de nuevo en carpetas distintas antes de sus capturas; no se usó el servidor HMR.

Se guardaron **16 PNG y cuatro JSON** en `antes/` y `despues/`: cuatro estados por anchura y fase. La documentación de figuras mantiene sus artefactos propios en `figura/`.

| Estado | 390 px AFTER | 1280 px AFTER |
| --- | --- | --- |
| Saldo del 80 % | [saldo](despues/390-saldo-80.png) | [saldo](despues/1280-saldo-80.png) |
| HTTP 503 y reintento manual | [error](despues/390-error-503.png) | [error](despues/1280-error-503.png) |
| Generación recién iniciada | [generando](despues/390-generando.png) | [generando](despues/1280-generando.png) |
| Petición viva tras 26 s | [espera](despues/390-espera-26s.png) | [espera](despues/1280-espera-26s.png) |

Inspección visual de 390 y 1280 px mediante los PNG: estado de espera y salidas legibles, aviso recibido completo, sin recortes ni desbordamiento horizontal. El indicador indeterminado mantiene su semántica accesible; las capturas se toman con movimiento reducido. El medidor de cuota se muestra en Progreso antes de abrir el NBME y se oculta durante la concentración en la pregunta, por lo que saldo y error se documentan en imágenes separadas del mismo recorrido.

Los logs de esta ejecución están en [e2e-final.log](e2e-final.log), [build-antes.log](build-antes.log), [build-despues.log](build-despues.log), [capturas-antes.log](capturas-antes.log) y [capturas-despues.log](capturas-despues.log).
