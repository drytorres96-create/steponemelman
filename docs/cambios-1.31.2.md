# Recuperar un error NBME con IA

Una generación que tardaba más de 20 segundos se interrumpía en el servidor y
mostraba un error genérico, aunque quedara presupuesto. El usuario observó una
espera de 20–30 segundos. Esto coincide con el corte reproducido; sin logs del
proveedor no permite excluir otros errores de Cloudflare.

- Recuperación admite hasta 60 segundos de inferencia; el navegador espera hasta
  90 segundos para incluir autenticación y lectura del material. Abortar el
  transporte no garantiza detener la inferencia ni devolver su coste.
- El modelo entrega un plan compacto con tipo, evidencia, respuesta y alternativas.
  El servidor construye la pregunta y explicación y aplica el mismo validador
  original: 3–6 ejercicios, diversidad, fuentes literales y respuestas inequívocas.
  La salida máxima pasa de 1800 a 2400 tokens para evitar lotes truncados.
- Se mantiene `@cf/meta/llama-3.3-70b-instruct-fp8-fast`. La recuperación dispone
  de 7225 neuronas frente al techo anterior de explicación de 5950, dentro de los
  mismos 8500 útiles. Se preservan reserva del 15 %, tope individual de 7650,
  300 llamadas y contador `v=2`; no hay reinicio ni proveedor de pago.
- Tiempo, capacidad, cuota Cloudflare y fallo del proveedor tienen mensajes
  distintos. Los logs incluyen fase, duración y código permitido, nunca texto
  de preguntas, razonamiento ni cuerpos del proveedor.
- El indicador contabiliza este Worker; no es una lectura de consumo de todas
  las aplicaciones de la cuenta Cloudflare. Esto se explica en la FAQ.
- Se elimina el aviso «Esta pregunta incluye una figura» y sus enlaces. La
  imagen, ampliación y navegación del NBME se conservan.

La petición sigue resolviendo en el servidor la revisión exacta y los permisos
antes de consultar IA o caché. El cliente conserva el formato de ejercicios y
las recuperaciones guardadas; no añade reintentos automáticos ni cambia historial,
sesiones NBME, criterios de dominio o meta de 60 días. La clave de generación se
versiona para que un fallo de la versión anterior no bloquee el nuevo prompt.

## Fuentes técnicas

- [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [Llama 3.3 70B Fast](https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/)
- [JSON Mode](https://developers.cloudflare.com/workers-ai/features/json-mode/)
- [Errores de Workers AI](https://developers.cloudflare.com/workers-ai/platform/errors/)
- [Binding oficial y señal de cancelación](https://github.com/cloudflare/workerd/blob/main/src/cloudflare/internal/ai-api.ts)

## Validación

Pruebas focales reproducen una respuesta de 35 segundos con 80 % de presupuesto,
el corte final con cancelación, respuestas tardías descartadas, errores del
proveedor y capacidad de recuperación tras agotarse la parte de explicación.
Se comprueban formato compacto, fuentes corregidas, permisos, persistencia y
regreso al mismo bloque. Los datos y respuestas de IA de las pruebas son sintéticos;
no se midió inferencia ni facturación real de Cloudflare desde este entorno.

Los resultados completos y capturas se registran en
[validación de la recuperación](recuperacion-ia-fiable/VALIDACION.md).

La corrida final completa aprobó 1076 pruebas unitarias, con las dos omisiones
previstas. El build de producción pasó; las 8 E2E nuevas de recuperación y las
7 focales de figuras pasaron sin reintentos. Capturas compiladas de antes y
después a 390 y 1280 px verifican saldo, error, espera y retorno; una revisión
independiente del diff no encontró hallazgos bloqueantes.
