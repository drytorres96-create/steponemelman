# Diseño web: identificar la respuesta al confirmar

La selección previa y el resultado confirmado ahora conservan estados distintos.
En la piel oscura verde, el acierto antes compartía el fondo de la tarjeta y
reemplazaba un borde seleccionado visible por uno tenue. El nuevo estilo mantiene
la identificación del resultado durante todo el tiempo de revisión.

| Estado | Identificación persistente |
| --- | --- |
| Seleccionada, sin comprobar | Fondo azul y borde azul claro; radio seleccionado. |
| Correcta | Borde menta sólido de 2 px, franja interior de 5 px y etiqueta «✓ Respuesta correcta». |
| Elegida incorrecta | Borde coral sólido de 2 px, franja interior de 5 px y etiqueta «× Tu respuesta incorrecta». |
| Foco de teclado | Contorno azul de 3 px, separado 4 px del borde del estado. |

Las etiquetas son texto real. Los símbolos decorativos usan `aria-hidden` y
acompañan al texto, por lo que el color no es la única señal de corrección. La
respuesta correcta se distingue incluso cuando se eligió otro distractor. El
fondo claro usa tonos de borde más oscuros para conservar el contraste.

La hoja `src/styles/respuestas-contraste.css` cubre NBME, preguntas Melman,
fichas, flechas, retroalimentación, visor de falladas y recuperación con IA.
Define colores de estado locales y se importa después de las pieles existentes;
no cambia el tema general ni los colores de las barras de progreso. Conserva los
controles táctiles de al menos 44 px.

Se eligió una marca permanente y no se añadió movimiento. Una animación corta
puede pasar inadvertida al cambiar la mirada de la explicación a las opciones;
el borde, la franja y la etiqueta siguen visibles. `prefers-reduced-motion`
desactiva las transiciones existentes en esos controles. En colores forzados, el
acierto lleva un borde doble y el fallo uno discontinuo.

La revisión independiente de ingeniería documenta colores computados y ratios
en [CONTRASTE-INGENIERIA.md](./CONTRASTE-INGENIERIA.md). La comprobación usa
umbrales de 3:1 para bordes de estado y 4.5:1 para texto normal. Las capturas a
390 y 1280 px se guardan en `antes/` y `despues/`; los datos son sintéticos y no
se altera ninguna cuenta para producirlas.
