# Pulido del sistema visual · Melman 1.27.3

La última pasada conserva el verde oscuro, las superficies cálidas de estudio,
el acento menta y el dorado de los hitos. Corrige detalles de coherencia y
legibilidad sin cambiar cómo se estudia ni añadir elementos a las pantallas.

## Diseño web

- Los campos de Biblioteca, Cuenta y acceso comparten tipografía de 16 px,
  peso, radios, bordes y foco del sistema. Las opciones nativas usan la paleta
  de Melman; la piel clara y la oscura siguen controlando la sesión.
- En móvil, el único botón Hoy ocupa la fila de navegación y el botón de
  comenzar una sesión personalizada ocupa el ancho disponible. Una navegación
  con más de un botón mantiene sus dos columnas.
- Las acciones principales fuera de sesión usan menta y una sombra breve.
  Las secundarias mantienen una superficie discreta y un borde claro al pasar
  el cursor. Hoy conserva su estado activo bajo hover.
- Las cifras de Hoy, Progreso y la tabla de metas usan ancho tabular para
  mantener estables los indicadores.
- El campo «Así lo razoné» tiene letra de 16 px, más espacio para escribir y
  conserva el ancho de la sesión. El tamaño pretende evitar el zoom automático
  por texto pequeño en iPhone; esto no sustituye una prueba real en Safari.

## Accesibilidad y estados

- El hover neutro deja de reemplazar el color de una respuesta elegida,
  correcta o incorrecta. El cambio se aplica a NBME y a opciones de concepto.
- Los bordes de controles durante hover usan el acento contrastante en ambas
  pieles. El foco de teclado rodea toda la fila de una respuesta NBME.
- Se conserva el movimiento reducido existente. No se añaden fuentes,
  imágenes, dependencias ni animaciones.

## Alcance

Los cambios de producción son tres hojas CSS y el identificador de versión.
No cambian algoritmos, criterios de dominio, repetición espaciada, recuperación,
intentos, persistencia, límites diarios, IA, cuotas o contratos de sincronización.
No se accede a bases de datos ni a contenido médico privado.

## Validación visual y revisión adversarial

La comparación reproducible usa escenas sintéticas del arnés, sin cuenta ni
contenido real. [Las capturas](capturas/) comparan Hoy, Biblioteca, Progreso,
Cuenta, concepto y NBME a 390 y 1280 px, entre main 3a094834 (1.27.2) y el
código congelado de esta versión. Los ficheros `medidas.json` registran versión,
colores, tamaños, movimiento reducido y errores de cada escena.

Las 12 escenas después del cambio no tienen desbordamiento horizontal ni
errores de JavaScript. Una revisión adversarial independiente de Hoy,
Biblioteca y Cuenta a 320, 375, 390, 768 y 1280 px no encontró regresiones
bloqueantes, controles visibles menores de 44 px, campos menores de 16 px ni
animaciones activas con movimiento reducido.

Se añaden diez regresiones de navegador para selección y resultados bajo
hover, contraste de bordes y foco, escritura de razonamiento, opciones nativas,
ancho de navegación y botón móvil, y ausencia de desbordamiento en ambas
pieles. El contexto de Playwright configura `reducedMotion` explícitamente y
comprueba su activación antes de medir estilos.

La validación de navegador se realiza en Chromium. Los resultados completos
de instalación, pruebas y build se guardan en `VALIDACION.txt`. La comprobación
de despliegue se contrasta con el commit fusionado en Cloudflare; si el proxy
del entorno bloquea workers.dev, no se atribuye a la aplicación.
