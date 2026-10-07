# Revisión de ingeniería: estados de respuesta

El problema localizado está en los tokens de la piel de estudio. En oscuro, la
respuesta correcta usaba el mismo fondo que la tarjeta (`#14261f`) y cambiaba el
borde de selección (`#4fd6ae`) por un verde tenue (`#1f4539`). Confirmar un acierto
reducía la visibilidad del estado. El fallo NBME tenía un borde igualmente tenue.

La revisión usa Chromium del sistema (`/usr/bin/chromium`) con las hojas de estilo
de producción en su orden de importación, el contexto `editorial-app study-focus
session-focus` y controles deshabilitados después de responder. El contenido es
sintético; no se consulta ninguna cuenta ni se altera progreso.

## Medición anterior

Los colores y ratios siguientes se obtuvieron mediante `getComputedStyle` y la
fórmula de luminancia relativa de WCAG. El fondo exterior de referencia es la
superficie real de la tarjeta.

| Piel / estado NBME | Borde | Fondo de respuesta | Borde / exterior | Borde / respuesta |
| --- | --- | --- | ---: | ---: |
| Oscuro, seleccionada | `#4fd6ae` | `#14261f` | 8.71:1 | 8.71:1 |
| Oscuro, correcta | `#1f4539` | `#14261f` | 1.48:1 | 1.48:1 |
| Oscuro, incorrecta | `#4a3b1c` | `#2a2113` | 1.46:1 | 1.46:1 |
| Claro, correcta | `#c2e0d3` | `#e6f4ec` | 1.41:1 | 1.24:1 |
| Claro, incorrecta | `#ecd6ac` | `#fdf3e0` | 1.42:1 | 1.29:1 |

El texto NBME ya tenía contraste suficiente: 14.49:1 en oscuro y 13.92:1 en el
acierto claro. El problema principal era la identificación del estado, no la
legibilidad del enunciado. Melman y el panel de retroalimentación compartían los
tokens débiles. La respuesta correcta que el usuario no seleccionó tampoco
recibía un estilo de resultado consistente en Melman.

## Recomendación acordada con diseño web

- Separar selección y evaluación: azul para seleccionada; menta para correcta;
  coral para incorrecta. No presentar una selección sin evaluar como un acierto.
- Usar un borde sólido de 2 px y una franja interior de 5 px para los resultados.
  Mantener las etiquetas visibles «Respuesta correcta» y «Tu respuesta
  incorrecta», acompañadas de un símbolo decorativo oculto a lectores de pantalla.
- Mantener texto y bordes a plena opacidad después de responder. Los controles
  quedan deshabilitados funcionalmente sin atenuar la evidencia de su resultado.
- Cubrir NBME, opción múltiple Melman, flechas, fichas, retroalimentación, visor de
  falladas y ejercicios IA. El fallo IA debe tener su propio estado; el borde
  verde fijo en una respuesta fallada resultaba ambiguo.
- Conservar controles de al menos 44 px y foco de teclado visible. Los estados
  deben entenderse con texto y forma además de color.
- No añadir pulsos repetidos. El borde, la franja y la etiqueta persisten todo el
  tiempo que se revise la respuesta; cualquier transición se desactiva con
  `prefers-reduced-motion: reduce`.

El objetivo de comprobación es al menos 3:1 para el borde que identifica un
estado y 4.5:1 para texto de tamaño normal.

## Comprobación del CSS aplicado

Chromium confirma los siguientes resultados al aplicar todas las hojas de
estilo y `src/styles/respuestas-contraste.css` a controles representativos de
NBME, Melman, fichas, flechas, IA y visor de falladas. Son colores calculados por
el navegador, no sólo valores declarados en la hoja.

| Piel / estado | Borde / exterior | Borde / respuesta | Texto / respuesta | Etiqueta / fondo propio |
| --- | ---: | ---: | ---: | ---: |
| Oscuro, seleccionada | 10.40:1 | 7.66:1 | 10.92:1 | — |
| Oscuro, correcta | 11.87:1 | 9.91:1 | 12.46:1 | 11.08:1 |
| Oscuro, incorrecta | 8.77:1 | 7.56:1 | 12.65:1 | 9.49:1 |
| Claro, seleccionada | 6.66:1 | 5.82:1 | 12.46:1 | — |
| Claro, correcta | 6.07:1 | 5.35:1 | 11.89:1 | 6.07:1 |
| Claro, incorrecta | 6.71:1 | 6.05:1 | 12.60:1 | 6.71:1 |

Los bordes miden 2 px y la franja interior 5 px. Los controles de fichas y
flechas conservan 44 px de altura mínima. Todos los resultados comprobados
mantienen opacidad 1 al deshabilitar sus controles. El foco mide 3 px con 4 px de
separación; su contraste contra la respuesta seleccionada es 7.66:1 en oscuro y
5.82:1 en claro. Con movimiento reducido no queda ninguna animación ni
transición de estos estados. Con colores forzados, el acierto usa borde doble de
3 px y no usa sombra, conservando una señal de forma independiente del color.

La misma medición se repitió importando la hoja de contraste antes de las
pieles, como ocurre en el arnés, y después de ellas, como en la aplicación de
producción. No hubo diferencias en los colores, bordes, etiquetas, foco,
retroalimentación, fichas o flechas comprobados. El contexto `.editorial-app`
de las reglas de piel evita que otra hoja posterior atenúe el estado.

La aplicación real, con proveedores y contenido sintéticos, también se comprobó
en el arnés compilado a 390 y 1280 px. En ambos tamaños y ambas pieles, los
colores calculados de las respuestas NBME y sus etiquetas coinciden con la
tabla. Una opción seleccionada antes de comprobar mantiene el azul y no muestra
etiqueta de acierto; al comprobar una respuesta correcta pasa al menta y muestra
«✓ Respuesta correcta». No se detectó desbordamiento horizontal.

La comprobación usa el build que incluye el nuevo import de CSS, verificado
por los colores calculados; las capturas anteriores a ese import no se aceptan
como evidencia del resultado final.
