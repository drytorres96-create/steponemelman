# 1.23.0 — Estudio sin fricción

Publicado el 26 de septiembre de 2026. Es el primer bloque de la auditoría del 26-sep,
hecha desde tres miradas: psiconeurología y TDAH, ciencias básicas y USMLE, e
ingeniería web con IA. El recorrido de estudio pierde cortes, saltos y decisiones. No
cambia qué se estudia, ni los techos, ni los criterios de dominio. Sí cambia una cosa
de lo que cuenta, y la decidió Yoel: las respuestas que el corrector no sabe juzgar.

## Qué cambia

**«Nuevo» ya no se corta.** Cada tres conceptos salía «Sesión terminada · Has
completado 3 preguntas» y había que pulsar «Continuar la sesión». Con TDAH, una señal
de fin es una salida. Ahora el tramo termina y sigue la pregunta, sin resumen
intermedio. El resumen de la sesión sigue al final, como estaba.

**Una sola decisión tras responder.** Debajo de la corrección queda un botón,
«Siguiente pregunta». Lo demás espera plegado en **«Más sobre esta pregunta»**: Sigo
sin entender, Profundizar, Cómo caería en el examen, Preguntar sobre esta pregunta,
Ajustar dificultad y la fuente.

**Cuando el corrector no sabe, decides tú** (decisión de Yoel del 26-sep).
- En «Respuesta por revisar» ya no están «Volver a responder» ni «Continuar con
  respuesta pendiente de revisión». En su lugar hay dos botones, **«La sabía»** y **«No
  la sabía»**, que cuentan como acierto o como fallo y pasan a la siguiente.
- Reescriben el mismo intento, igual que corregir un veredicto de la IA.
- «No la sabía» se registra como desconocimiento, no como confusión: no bloquea el
  dominio siete días ni acorta más el repaso.
- La ayuda usada antes de responder sigue contando como ayuda.
- «Que la IA juzgue mi respuesta» sigue disponible.

**Un solo color en toda la sesión.** La piel de estudio se montaba con el reproductor
de conceptos y se retiraba en las preguntas NBME, así que la pantalla pasaba de clara a
oscura a mitad de sesión. Ahora la llevan las cajas y lo nuevo enteros.

**El progreso no retrocede.**
- En las cajas, la cuenta es de cajas de hoy: «12 de 40 · caja 2». Un fallo que vuelve
  se repasa («Repaso de un fallo · caja 1») sin alargar el total.
- En lo nuevo, la cuenta avanza con cada respuesta: «3 de 12 · 7 conceptos y 5
  preguntas». Antes decía «Paso 1 de 12» y no se movía durante tres conceptos.

**Pausa sugerida cada ~20** (decisión de Yoel).
- En las cajas y en lo nuevo, tras 20 ítems seguidos aparece una tarjeta de respiro:
  «Seguir» (también con Intro) o «Parar por ahora».
- No cambia los techos ni cuenta como dejarlo, y la última caja no la pide.
- Mientras dura, no se abre la siguiente pregunta NBME: el respiro no cuenta como tiempo
  en la pregunta.

**Menos presión y menos ruido durante la sesión.**
- Dentro de un recorrido ya no aparecen el formato del concepto («Recuperación libre»),
  su estado (el rojo de «Requiere repaso»), la cuenta propia del reproductor ni
  «Correcciones pendientes» en las preguntas NBME. La cuenta la pone el recorrido.
- La pregunta NBME se titula «Pregunta NBME», en vez de «Pregunta 1 de 1».
- Un fallo NBME dice adónde va. En las cajas, que vuelve dentro de unos pasos. En lo
  nuevo, que vuelve en las cajas de los próximos días; antes decía «volverá durante la
  práctica», que ahí no era cierto.

**Teclado.**
- Lo nuevo tiene el mismo foco que las cajas: el cursor en la respuesta y, una vez
  corregida, en «Siguiente pregunta».
- En las preguntas NBME, la letra elige, Intro comprueba y el foco pasa a «Continuar».
  Intro sobre un botón sigue activando ese botón.

**Letra legible durante el estudio.** Con la piel de estudio:
- el enunciado deja el trazo fino (peso 400);
- el enunciado NBME sube a 18 px;
- el texto de apoyo no baja de 14 px;
- los rótulos pasan de 10 a 12 px.

## Qué no cambia

Los techos, el viernes, las cajas y su escalera, los criterios de dominio, la meta de 60
días, qué se registra como intento (salvo lo decidido sobre «por revisar»), el Worker y
el corpus. Las sesiones sueltas desde **Elegir contenido** conservan su resumen al
terminar.

## Cómo está hecho

- `src/lib/piel-estudio.ts` y `src/components/PielEstudio.tsx`: una sola piel
  compartida entre todas las pantallas que la montan. Se retira al salir la última.
- `src/components/PausaSugerida.tsx`: la tarjeta de respiro, con `PAUSA_CADA = 20`.
- `src/screens/Reproductor.tsx`:
  - el modo recorrido (`enSesion`) devuelve el control sin resumen, pone el foco y
    oculta etiquetas;
  - `autocalificar` para «La sabía» y «No la sabía»;
  - la corrección con una acción y el bloque «Más sobre esta pregunta».
- `src/screens/SesionCajas.tsx` y `src/semana/SesionMixta.tsx`: la piel de sesión, la
  cuenta que no retrocede y la pausa.
- `src/nbme/NbmePlayer.tsx`: en modo paso, sin cuenta propia; `avisoFallo`; Intro para
  comprobar; foco en «Continuar».
- CSS:
  - `src/piel-estudio.css`: letra de estudio, bloque «Más», botones de
    autoevaluación y pausa;
  - `src/nbme/nbme.css`: la cabecera del modo paso.

## Pruebas

- `reproductor-caja.test.tsx`:
  - «La sabía» cuenta y pasa con un toque;
  - tras responder hay una sola acción principal y el resto queda en «Más sobre esta
    pregunta»;
  - en un tramo de lo nuevo no hay «Sesión terminada» y el foco funciona igual que en
    las cajas.
- `sesion-cajas.test.tsx`:
  - la cuenta es de cajas y nunca retrocede;
  - la pausa llega a los 20 pasos seguidos, con el foco en «Seguir», y no se pide en la
    última caja;
  - la piel se mantiene en los pasos de pregunta y se retira al salir;
  - el fallo NBME dice adónde va.
- `sesion-mixta.test.tsx`:
  - la cuenta avanza con cada respuesta;
  - la piel dura toda la sesión;
  - la pausa llega entre pasos, nunca a mitad de un tramo;
  - el fallo NBME de lo nuevo va a las cajas.
- `nbme/ui.test.tsx`:
  - en modo paso no se repite la cuenta, se dice adónde va el fallo, Intro comprueba y
    se consume, y el foco va a «Continuar»;
  - Intro sobre un botón manda el botón.
- `piel-estudio.test.tsx`: una sesión y su reproductor comparten piel. Salir del
  reproductor no la quita; salir de la sesión, sí.
- `release-integration.test.ts`:
  - se reescriben las dos pruebas que describían el «por revisar» anterior («no cuenta»
    y «volver a responder»). Ahora comprueban «No la sabía» como desconocimiento sobre
    el mismo intento y «La sabía» sin convertirlo en fallo;
  - una prueba nueva comprueba que la ayuda previa sigue contando.
- Mutaciones comprobadas: cada una de estas hace fallar su prueba:
  - volver al resumen entre tramos;
  - poner el foco solo en las cajas;
  - quitar la pausa en cajas o en lo nuevo;
  - calcular el progreso sobre pasos;
  - registrar «No la sabía» como confusión;
  - no consumir el Intro de NBME;
  - retirar la piel con el reproductor.
- Comprobado en Chromium:
  - cajas con concepto, «por revisar», fallo y pregunta NBME con teclado;
  - lo nuevo sin cortes;
  - pausa a los 20 pasos.

Total: 539 pruebas, 537 pasan y 2 omitidas (las de siempre). Build sin errores de
TypeScript.
