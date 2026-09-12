# StepOneMelman 1.7.1 — Textura orgánica y cristal

Adaptación de las referencias visuales adjuntadas por Yoel: verdes bosque, musgo y oliva; tipografía marfil; cristal esmerilado con bordes luminosos finos; profundidad mediante sombras y luces suaves; botones redondeados con relieve. Se toma la materialidad de las referencias y se crea una composición original, sin publicar sus capturas, productos, marcas o interfaces.

## Aplicación

- Acceso, registro y recuperación sobre un fondo orgánico completo, con formulario real de cristal oscuro y controles legibles.
- Navegación verde bosque, selección salvia, área de trabajo clara con borde translúcido.
- Inicio con portada y panel esmerilado; tarjetas de repaso y progreso con figuras circulares en relieve.
- Cabeceras de biblioteca y progreso con superficie verde, formas curvas y el nuevo arte.
- Botones, tarjetas, campos, sombras, radios y estados de interacción coherentes en las pantallas.
- Las preguntas mantienen fondos sólidos y el modo de concentración existente. No se cambian autenticación, evaluación, banco, sincronización ni progreso.

## Rendimiento y accesibilidad

El generador integrado `image_gen` creó un único fondo original. Se sirve en dos tamaños WebP, 768 y 1536 píxeles, con `srcset`, dimensiones reservadas y caché versionada. Pesan 22.406 y 59.782 bytes: 82.188 bytes en total. Las imágenes anteriores se conservan para no romper recursos antiguos, pero el acceso, inicio y nuevas cabeceras usan el fondo nuevo.

El desenfoque se limita al formulario y al panel de portada; no se aplica a cada tarjeta ni se anima. Los fondos de cristal conservan una base oscura incluso si el navegador no admite desenfoque. Se respetan movimiento y transparencia reducidos. El texto de las superficies claras y del cristal se comprueba con contraste AA; el fondo de estudio es sólido.

## Validación

Puertas locales correctas: instalación limpia de 170 paquetes, 297 pruebas correctas con las dos omisiones privadas previstas y compilación TypeScript/Vite. Se amplían las verificaciones existentes para el presupuesto y contraste del arte nuevo, sin omitir pruebas. El CSS de producción pesa 13,78 KB comprimido; no hay nuevas dependencias. La inspección visual pública comprueba acceso, versión y carga de imágenes; no se afirma una inspección autenticada sin sesión.

El prompt completo y las rutas están en [Imágenes de esta versión](diseno-imagenes-1.7.1.md).
