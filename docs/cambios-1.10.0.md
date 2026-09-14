# 1.10.0 — El plan de la semana en la pantalla de inicio

Publicado el 14 de septiembre de 2026.

## El problema que resuelve

La pantalla de inicio enseñaba tres tarjetas —las sesiones preparadas de
`weekly_sessions`— y el plan real enseñaba veinticuatro checkpoints. Dos sitios
que mirar y dos sitios que marcar. Ahora la portada es el plan: la semana
completa como lista marcable por días, con las sesiones preparadas dentro, en su
día, en vez de en una sección aparte.

## El Worker hace de proxy, y el navegador no abre una segunda sesión

El plan vive en otro proyecto de Supabase (`rcwvwxchpukjbtqsrxfi`), con usuarios
de auth distintos de los del material. Abrir un segundo cliente en el navegador
obligaría a una segunda sesión y a duplicar la gestión de tokens, así que el
Worker habla con esa base usando una `service_role` guardada como **secreto del
Worker**, nunca en `vars` ni en el bundle del cliente.

Tres secretos nuevos, que hay que poner con `wrangler secret put`:

| Secreto | Valor |
| --- | --- |
| `PLAN_SUPABASE_URL` | `https://rcwvwxchpukjbtqsrxfi.supabase.co` |
| `PLAN_SUPABASE_SERVICE_KEY` | la `service_role` de esa base |
| `PLAN_USER_ID` | el UUID de Yoel en la base del plan |

Si falta cualquiera de los tres, `/api/plan/*` responde `503` con
`{ error: 'plan no configurado' }` y la pantalla degrada. No es un fallo que haya
que resolver a las cinco de la mañana: es el camino previsto.

Dos rutas, en `src/server/plan.ts`:

- **`GET /api/plan/semana`** devuelve la semana que contiene hoy y, si hoy no cae
  en ninguna, la siguiente que empiece. La fecha llega como `?hoy=YYYY-MM-DD`
  desde el cliente: en UTC el día cambiaría a las ocho de la tarde en Florida. Se
  cachea 60 segundos por fecha.
- **`PATCH /api/plan/checkpoint/:id`** escribe `done` y `done_at`, sólo en filas
  de `PLAN_USER_ID`, y devuelve **el checkpoint releído de la base**, nunca el que
  se envió. Invalida el caché.

Las dos exigen una cuenta verificada con acceso al material. La `service_role` da
acceso total a la base del plan: una ruta abierta la dejaría en manos de
cualquiera aunque el plan sea de una sola persona.

## La portada, por días

- El **día de hoy va expandido** y los demás plegados. Si hoy es domingo o cae
  fuera de la semana, se abre el primer día con pendientes. Nunca hay dos
  abiertos: la pantalla llena es lo que hace que no se empiece.
- **Una sola lista.** La sesión preparada es una fila más, con su tarjeta rica
  —pasos, progreso, cobertura— dentro de la fila y su botón `Empezar sesión`.
- **Marcar es un clic.** Optimista en pantalla; si el `PATCH` falla, la marca se
  revierte y el motivo aparece en línea. Nunca queda una marca que la base no
  aceptó.
- **`descanso`** pinta el día entero como descanso: sin casilla, sin cronómetro y
  fuera del denominador de la cabecera. No es una tarea.
- **`podcast`** lleva 🎧 y un botón `Oído`. El audio se escucha fuera de la app.
- **`events.note`** va detrás de un `<details>` cerrado, `Por qué esta semana es
  así`. Es contexto valioso y largo; no puede ocupar la primera pantalla.

## El cronómetro sale del reproductor

`Cronometro` se movió de `src/screens/Reproductor.tsx` a
`src/components/Cronometro.tsx` sin tocar su conducta (commit aparte, revisable
solo). Ahora lo monta también `src/plan/Enfoque.tsx`: el panel de foco de una
tarea del plan, con los minutos de `MINUTOS_POR_KIND`.

| Tipo | Minutos |
| --- | --- |
| `qbank`, `leccion` | 30 |
| `tarjetas`, `assessment` | 20 |
| `lectura` | 15 |
| `podcast`, `descanso` | sin cronómetro |

Al llegar a cero el panel ofrece `Marcar como hecho` o `Seguir un poco más`
(+5 min). **No marca nada solo**: el cronómetro mide, no decide.

La excepción es la sesión preparada, que abre `SesionMixta` con su propio
cronómetro. Cuando esa sesión llega a `completada`, marca sola su checkpoint del
plan. Ese automatismo es la razón de ser de esta versión.

## Cómo se enlazan las dos bases

`src/plan/enlace.ts`. Los checkpoints de sesión preparada llevan en su etiqueta
`StepOneMelman · Sesión de la semana N/M · <título>`. El emparejamiento es por
**(semana, día)**, que es lo único que ambas bases comparten de forma fiable; el
prefijo del título sólo desempata cuando un día tiene más de una sesión. Ante un
empate no adivina: abrir la sesión equivocada cuesta más que no abrir ninguna.

`enlazarCheckpoints` reclama cada sesión **una sola vez**, para que dos
checkpoints del mismo día no acaben marcando lo mismo.

No se meten identificadores cruzados en las etiquetas del plan: esas etiquetas
las escribe Yoel desde el chat y se romperían a la primera edición.

> **Aviso sobre los datos de hoy.** Los cuatro checkpoints de sesión preparada de
> S2 y S3 están puestos en días distintos de los que tienen sus sesiones en
> `weekly_sessions` (checkpoint del lunes contra sesión del miércoles, y así).
> Mientras los días no coincidan, el enlace no se hace y la sesión sigue
> apareciendo como una fila normal sin su tarjeta. Se arregla desde el chat
> moviendo el `dia` de un lado o del otro; no hace falta tocar código.

## Adherencia al plan, en Progreso

Banda nueva y **separada**, arriba del todo: `% del plan hecho` de la semana en
curso y de las cuatro anteriores, leídas de la misma ruta con su fecha. Debajo,
una línea: *mide si se hizo, no si se domina*.

No se mezcla con las cifras de dominio a propósito. Hacer y dominar son cosas
distintas: promediarlas en un número dejaría los dos inservibles —una semana
entera cumplida sin nada consolidado se leería igual que media semana bien
aprendida—. Sin plan disponible, la banda no se dibuja.

## Degradación

Si `/api/plan/semana` devuelve `503`, falla la red o la semana viene vacía, la
pantalla vuelve exactamente a lo que hacía antes: las sesiones preparadas de
`weekly_sessions`, con una línea sutil arriba —*El plan no está disponible ahora
mismo. Estas son las sesiones de la semana.*— Ningún error bloqueante y ninguna
pantalla en blanco.

## Lo que no cambia

- `Recuperacion.tsx` sigue alimentándose de la repetición espaciada del
  contenido, que es independiente del plan.
- El menú `⋯ más` sigue igual.
- `bankVersion` no se toca: cambiarlo invalidaría las sesiones guardadas en
  `nbme_state`.
- La app **lee y marca** el plan; no lo posee. Sólo escribe `done` y `done_at`.
  Las etiquetas y la estructura las escribe Yoel desde el chat.

## Pruebas

- `src/plan/enlace.test.ts` — emparejamiento por día, desempate por título, y
  que una sesión no se reclame dos veces.
- `src/plan/api.test.ts` — degradación a `null` sin token, con 503 y sin red; el
  `PATCH` devuelve lo releído y el fallo permite revertir la marca local.
- `src/server/worker.test.ts` — las dos rutas: 503 sin secretos, el 404 de un
  `id` de otro `user_id`, el caché, y el filtro por usuario en las dos consultas.
- `src/__tests__/semana-plan.test.tsx` — hoy expandido y el resto plegado, el
  descanso sin casilla, la sesión dentro de su fila y la degradación sin plan.
