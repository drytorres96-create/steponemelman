# 1.19.0 — Hoy: el día como techo

Publicado el 25 de septiembre de 2026. Primera de dos entregas del rediseño que
Yoel pidió para que estudiar en Melman se sienta como estudiar en sus «anillos de
bioquímica», lo único que hasta ahora le hace terminar sesiones completas. Dos
cosas explican por qué funcionan y las dos se reproducen aquí: todo cabe en una
pantalla, y el techo lo pone el sitio. Lo que toca hoy es una cantidad finita y
visible; cuando se acaba, la pantalla lo dice y deja de ofrecer material.

Esta entrega trae el motor y la portada. Mi semana, Recuperación y Progreso
siguen existiendo en el menú discreto; la segunda entrega absorberá su contenido
en desplegables de Hoy.

## Qué cambia

**Hoy es la portada y la única entrada de la navegación.** Arriba, un anillo
dentro de otro: el interior es el día y el exterior el tema de la semana. Debajo,
una línea con lo que toca ahora y dos bloques, cada uno con su anillo pequeño,
su cuenta y un solo botón. El botón lleva al primer concepto o a la primera
pregunta en un clic.

**Dos vías, cada una con su techo y su cierre.** No se funden en una sesión
larga: un bloque que cierra por separado se puede hacer en un día malo.

- **Cajas**, primero, para entrar en calor con lo conocido. Es lo visto en días
  anteriores que aún no está cerrado. Escalera fija: caja 1 (24 h), caja 2
  (48 h), caja 3 (72 h). La caja sale de los aciertos vigentes independientes
  que ya registra la aplicación; el concepto se cierra cuando cumple los
  criterios de dominio de siempre, no al llegar al último escalón, y entonces
  vuelve al planificador normal. Entran como mucho **12 por día**. Si vencen
  más, el resto espera al día siguiente en silencio: la pantalla no cuenta lo
  que quedó fuera ni dice «atrasado». Las preguntas NBME falladas entran en la
  misma escalera.
- **Nuevo**, después: **10 conceptos nuevos y 5 preguntas NBME** del tema de la
  semana, vistos aunque no queden dominados, con el patrón de siempre (tres
  conceptos y una pregunta). Si la semana no tiene tanto, el techo baja a lo que
  hay y la vía se cierra con eso: nunca se queda abierta pidiendo algo que no
  existe.

**Cierre duro.** Con las dos vías cerradas desaparecen los botones —ni uno gris,
ni un «seguir de todas formas»—, el anillo interior se cierra en oro y una frase
dice qué se hizo, en cifras: conceptos nuevos, preguntas y cajas cerradas. Para
estudiar más hay que abrir **Cuenta y ajustes → Elegir contenido** a propósito;
el cierre no enlaza ahí. Un día sin nada que hacer también se ve cerrado, no
vacío ni roto.

**Un fallo dentro de las cajas vuelve a la caja 1** y reaparece cuatro pasos más
adelante en la misma sesión, como mucho tres veces. Después se deja para otro
día. La reaparición se registra como corrección con explicación previa, igual
que las correcciones de siempre, así que no cuenta como evidencia independiente.

## Decisiones de detalle

Lo que el encargo dejaba abierto y cómo quedó, para que se pueda revisar:

- **Cuándo se fija el día.** «Pendiente es lo que vence en menos de seis horas»
  se mide desde la primera respuesta del día. Hasta entonces la portada sigue al
  reloj; en cuanto se responde algo, el techo de las cajas ya no crece aunque
  avance la tarde. Es lo que permite que un día cerrado siga cerrado. Lo que
  vence más tarde entra al día siguiente.
- **El día empieza a las 3:00.** Una respuesta a las dos de la mañana cuenta
  para el día anterior.
- **Las cajas se cuentan en días de estudio.** La caja 1 vuelve al empezar el
  día siguiente, la 2 dos días después y la 3 tres, sin pasar nunca de 24, 48 o
  72 horas. Contar horas exactas dejaba fuera lo estudiado a las ocho de la
  tarde si al día siguiente se empieza temprano: la caja 1 se estiraba a dos
  días.
- **Lo nuevo sale de los guiones de la semana en curso**, conceptos y
  preguntas, en el orden en que la semana los presenta. Cuenta como visto
  cualquier primer intento resuelto hoy, venga de donde venga.
- **Las preguntas NBME suben una caja por día de estudio**, nunca el mismo día
  del fallo: la corrección tras ver la explicación no es evidencia de haberla
  aprendido. Tras la caja 3 quedan cerradas; un fallo nuevo las devuelve a la 1.
- **Lo dominado sale de las cajas.** Sus repasos de mantenimiento siguen en el
  planificador normal: **Plan diario clásico** y **Recuperación**, en el menú.
- **Recién abierto un dispositivo**, la portada no dice «ya está» hasta que
  llega la primera sincronización de la cuenta. Si no llegan las sesiones de la
  semana, lo nuevo muestra el aviso y el día no se da por cerrado.
- **Anillo exterior.** Conceptos cerrados sobre los que traen los guiones de la
  semana, un tramo por sesión. Si esta semana no tiene sesiones preparadas, mide
  las sesiones del plan hechas sobre las planificadas y lo dice; sin plan, se
  queda vacío y lo dice.

Nada de esto crea tablas ni columnas. No se tocaron los criterios de dominio, la
fecha del examen, el horizonte del planificador ni qué se registra como intento.

## Cómo está hecho

- `src/lib/dia.ts`: techos (`TECHO_CONCEPTOS_NUEVOS`, `TECHO_PREGUNTAS`,
  `TECHO_CAJAS`), el corte de las 3:00 y `estadoDelDia`, una función pura del
  historial de `study_state` y `nbme_state` más la fecha. El cierre sobrevive a
  cambiar de dispositivo sin sincronizar nada nuevo.
- `src/lib/cajas.ts`: la escalera. El vencimiento es el mínimo entre lo que
  propone el planificador y el techo de la caja, como ya hace `techoHorizonte`
  con el examen. Ninguna función devuelve cuántos ítems quedaron fuera.
- `AnilloDoble` en `src/components/comunes.tsx`: un solo `role="img"` con las dos
  cifras en su `aria-label`; la pista usa `--linea-interactiva`.
- `src/screens/Hoy.tsx` y `src/hoy.css`: la portada.
- `src/screens/SesionCajas.tsx`: el recorrido de las cajas. Monta el reproductor
  de conceptos o el de preguntas por paso. Cada pregunta tiene su propia sesión
  NBME, así que su reaparición es exactamente el reintento que esa sesión trae;
  si el reintento queda pendiente, la próxima vez que toque se retoma esa misma
  sesión y no se acumulan sesiones a medias. Cada paso de concepto registra con
  su propio identificador, así que retomarlo desde otra pantalla no duplica la
  respuesta. El reproductor de conceptos gana un modo caja opcional que no
  cambia nada para el resto de la aplicación.
- La vía nueva reutiliza la sesión mixta de siempre, armada al vuelo.

## Pruebas

Nuevas: `dia.test.ts` (12), `cajas.test.ts` (13), `hoy.test.tsx` (8),
`sesion-cajas.test.tsx` (4) y `reproductor-caja.test.tsx` (2). Entre ellas, las
que pedía el encargo: el día cierra exactamente en 10 + 5, un intento por
revisar no cuenta, lo ya intentado no es nuevo, el techo baja a 6 con solo 6
conceptos, el corte de las 3:00, el mapeo evidencia → caja, lo dominado no
vuelve, el vencimiento nunca pasa del techo de su caja, la ventana de seis
horas, 40 vencidos → 12 sin que salga la cifra 40, la reinserción a cuatro pasos
como mucho tres veces, ningún botón con el día completo (buscado por rol), el
día sin material cerrado, la reserva del anillo exterior y su `aria-label`.
`ui-navigation.test.tsx` se actualizó a la portada nueva.

Total: 515 pruebas, 513 pasan y 2 omitidas (las de siempre). Build sin errores
de TypeScript.
