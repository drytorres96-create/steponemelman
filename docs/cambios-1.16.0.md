# 1.16.0 — Una piel para estudiar

Publicado el 21 de septiembre de 2026. Yoel lo pidió mirando las dos pantallas
donde pasa las horas: la sesión de estudio y el panel de foco. La paleta de
petróleo y salvia le gusta de lejos, pero a las cinco de la mañana y en una hora
seguida de preguntas pesa. Quería algo más alegre sin volverse ruidoso.

## Qué cambia

**Las dos pantallas de concentración tienen paleta propia.** Mientras están
abiertos el reproductor de sesión y el panel de foco, la ventana entera cambia
de piel. Al salir vuelve todo a como estaba: el resto de la aplicación —Mi
semana, Recuperación, Progreso, Ajustes— no se toca.

**De día, papel y tinta.** Fondo hueso `#FBF8F3`, tarjetas blancas, tinta
`#1E2422` y un acento terracota `#B4502E`. Lo que ya está dominado se marca en
verde. La alegría viene de la luz, no de la saturación: se lee como un libro.

**De noche, noche cálida.** Sigue siendo oscuro, pero deja el petróleo por un
gris azulado `#15171E`, con coral `#FF8A5B` y menta `#4FD6AE`. Mismo contraste,
menos peso.

**Sin atmósfera.** Dentro de la sesión se apagan la fotografía de fondo, el haz
de luz, la niebla, la viñeta y el desenfoque del cristal. Las superficies pasan
a ser planas, con una línea y una sombra corta. Lo que se mira durante una hora
no debe pedir atención.

**El conmutador está donde se necesita.** Un botón discreto —sol o luna— en la
cabecera de la sesión y en el panel de foco. Dice adónde va, no dónde está:
«Modo noche» cuando estás en claro. En móvil se queda solo el icono, con su
etiqueta accesible.

**Sin preferencia guardada manda el dispositivo**: claro si el sistema está en
claro, oscuro si no. En cuanto se toca el conmutador, esa elección manda y se
recuerda en este navegador. No viaja a Supabase: es una decisión del sitio donde
se estudia, no del progreso.

## Cómo está hecho

Una hoja nueva, `src/piel-estudio.css`, cuelga entera de `[data-piel-estudio]`
en `<html>`. El atributo solo existe mientras el reproductor o el panel de foco
están montados, así que fuera de ellos la hoja no pinta nada y ninguna de las
otras cuatro hojas cambia. Dentro, los mismos nombres de siempre —`--panel`,
`--acento`, `--linea`— apuntan a los colores de la piel, y las reglas con
colores literales de `cinema.css` se sobrescriben una por una.

La lógica vive en `src/lib/piel-estudio.ts` y el gancho de React en
`src/components/PielEstudio.tsx`.

## Pruebas

`src/__tests__/piel-estudio.test.tsx`, cuatro nuevas: que la piel se aplica
mientras el panel está abierto y se retira al salir, que el conmutador cambia y
recuerda, que sin preferencia decide el dispositivo y que una preferencia
guardada manda sobre él.

Total: 466 pruebas pasan, 2 omitidas, build sin errores de TypeScript.
