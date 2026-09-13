# 1.8.0 — Tres secciones y sesiones mixtas

Publicado el 13 de septiembre de 2026.

La aplicación pasa de seis pantallas a tres. Nada de lo que funcionaba se borra:
lo que cambia es **quién decide qué se estudia** y **cómo se presenta**.

## Mi semana — la portada

`src/screens/Semana.tsx` es lo único que se ve al entrar. Lee `weekly_sessions`
de Supabase, agrupa por semana y enseña una tarjeta por sesión con su día, su
composición (`15 conceptos · 5 preguntas · ~30 min`) y un botón «Empezar» o
«Continuar» según el cursor guardado. Las sesiones completadas se quedan a la
vista, atenuadas, hasta que la auditoría de fin de semana las pasa a `auditada`.

Sin sesiones pendientes, el vacío lleva a Recuperación. La biblioteca de siempre
sigue ahí, plegada al final en «Quiero hacer algo más».

## La sesión mixta

`src/semana/SesionMixta.tsx` recorre el guion planificado —tres conceptos, una
pregunta, repetido— montando el reproductor de conceptos o el de preguntas según
el paso. Ninguno de los dos se reescribió:

- `Reproductor` acepta `onTramoCompleto`, y con ella el fin de cola devuelve el
  control al orquestador en vez de sacarte de la sesión.
- `NbmePlayer` acepta `modoPaso`: enseña una pregunta y devuelve el control tras
  la revisión. Sin esa prop, se comporta exactamente como antes.

El guion no se recalcula: viene construido desde la planificación y la aplicación
sólo lo recorre. El cursor se persiste paso a paso en `weekly_sessions`; el
progreso real sigue viviendo en `study_state` y `nbme_state`, así que un fallo al
guardar la posición no borra nada estudiado.

La lógica del recorrido vive aparte y con pruebas: `src/semana/guion.ts`
(`separarGuion`, `posicionEnCola`, `pasoActual`, `construirGuion`).

## Recuperación

`src/screens/Recuperacion.tsx` releva a `Repaso` y unifica los dos mundos que
hasta ahora estaban separados:

- **Cerca de dominio** primero: los que con un acierto más cruzan el umbral.
- **Conceptos**: vencidos por FSRS y errores de los últimos siete días.
- **Preguntas**: las preguntas NBME cuyo último intento sigue sin corregir.
- **Mezclar**: arma una sesión mixta al vuelo con lo que haya de ambos.

La tabla de detalle del planificador se conserva, plegada.

## Progreso

Una banda de cifras arriba: conceptos dominados frente al corpus, aciertos de
primera sin ayuda en preguntas NBME, sesiones de la semana completadas frente a
planificadas, y el ritmo de las últimas cuatro semanas frente al que pide lo que
queda hasta el 21 de diciembre de 2026. Números y una línea que los explique.

## Lo que se retira sin borrarse

«Elegir contenido», «Ajustes y respaldo» y «Calidad del material» pasan al menú
de «Cuenta y ajustes». El plan diario clásico (`Inicio`) queda ahí también, como
«Plan diario clásico», hasta confirmar que no se echa de menos. Los enlaces
guardados a `#repaso` resuelven hacia Recuperación.

## Base de datos

`public.weekly_sessions` ya existía y ya tenía datos: esta versión no crea ni
migra nada. Se lee y escribe con la clave publicable y las políticas RLS del
usuario, sin pasar por el Worker.
