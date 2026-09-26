# 1.22.1 — Intro ya no se salta la corrección

Publicado el 26 de septiembre de 2026. Arregla un fallo que trajo la 1.21.0 en las
cajas: al responder con **Intro**, la corrección no llegaba a verse.

## Qué pasaba

La 1.21.0 pone el foco en «Siguiente pregunta» en cuanto la respuesta queda corregida,
para que con el teclado baste con escribir, Intro, leer, Intro. Pero la respuesta se
enviaba al bajar la tecla y el navegador entregaba el resto de esa misma pulsación al
botón que acababa de recibir el foco. «Siguiente pregunta» se activaba sola y la caja
pasaba a la siguiente sin enseñar si era correcta, la respuesta de referencia ni la
explicación. Con el ratón no pasaba. Los intentos sí quedaban bien registrados: lo que
se perdía era ver la corrección.

Las pruebas no lo detectaron porque el entorno de pruebas (jsdom) no reproduce cómo
el navegador activa un botón con Intro. Se encontró durante la auditoría del 26-sep,
recorriendo las cajas en Chromium.

## Qué cambia

Intro envía la respuesta y la pulsación termina ahí: el navegador ya no la entrega al
botón nuevo. La corrección queda a la vista con el foco en «Siguiente pregunta», y un
segundo Intro pasa a la caja siguiente con el cursor en la respuesta. Vale para la
respuesta escrita, la numérica y la fijación ortográfica.

## Pruebas

- `reproductor-caja.test.tsx`: Intro corrige, la pulsación queda consumida
  (`defaultPrevented`), el foco pasa a «Siguiente pregunta» y la corrección se ve. Falla
  si se quita el arreglo.
- Comprobado en Chromium: escribir e Intro deja la corrección a la vista, tanto al
  acertar como al fallar; el segundo Intro avanza.
