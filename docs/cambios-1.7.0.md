# StepOneMelman 1.7.0 — Medicina abstracta

## Dirección visual

Diseño médico minimalista y cinematográfico, corregido según la preferencia del propietario: abstracción inspirada en membranas y microscopía, no órganos reconocibles ni escenas de laboratorio.

Las superficies de trabajo combinan marfil, tinta verde oscura y acentos quirúrgicos apagados. La tipografía editorial aparece en cabeceras; preguntas, respuestas, tablas y controles conservan tipografía de interfaz legible. No se descargan fuentes ni recursos de terceros.

## Pantallas

- Acceso, registro y recuperación: panel cinematográfico con imagen original y formulario claro; se conservan los controles y la lógica de autenticación.
- Escritorio: navegación lateral y jerarquía nueva. En móvil, cabecera compacta y controles accesibles.
- Inicio: portada abstracta, sesión prioritaria, repaso y accesos a biblioteca/progreso. La sesión NBME pendiente conserva su prioridad y también recibe la portada nueva.
- Biblioteca de conceptos y preguntas: cabeceras luminosas, filtros, tarjetas y tablas con la nueva identidad.
- Progreso, repaso, ajustes y calidad: superficies, estados, tipografía y contraste coherentes.
- Estudio: superficies de lectura claras sin imágenes decorativas; se mantiene el modo de concentración sin menú, el reloj y los controles de respuesta existentes.
- Iconos del navegador y de la aplicación instalable actualizados con rutas nuevas; los anteriores no se borran.

## Imágenes y rendimiento

Se utilizó el generador integrado `image_gen`. Los PNG originales se conservaron fuera del repositorio; la aplicación publica únicamente las versiones optimizadas del arte abstracto seleccionado. Las tres primeras propuestas figurativas fueron descartadas y no se integran en el sitio.

| Recurso | Uso | Peso |
| --- | --- | ---: |
| `public/images/v170/membrane-768.webp` | Acceso, inicio y acceso a biblioteca | 12.496 bytes |
| `public/images/v170/membrane-1536.webp` | Variante de mayor resolución | 38.664 bytes |
| `public/images/v170/fluid-768.webp` | Cabeceras interiores | 10.082 bytes |
| `public/images/v170/fluid-1536.webp` | Variante de mayor resolución | 30.340 bytes |

Los cuatro archivos suman 91.582 bytes. `srcset` y `sizes` permiten elegir una variante, no descargar ambas. Las imágenes secundarias usan carga diferida; todas tienen dimensiones explícitas y son decorativas (`alt=""`, `aria-hidden`). Sus rutas están versionadas y se sirven con caché inmutable. El arte no se presenta como una figura anatómica validada ni se inserta en enunciados clínicos.

Los prompts finales completos se conservan en [Dirección de imágenes](diseno-imagenes-1.7.0.md).

## Protección de comportamiento

La base es `0a3de5e`, que ya incluye las mejoras recientes de corrección por IA y limpieza del reproductor. No se modifican los motores de evaluación, repetición o sincronización; no hay cambios en Supabase, membresías, preguntas, calificaciones o progreso. Los formularios conservan sus etiquetas, campos y acciones.

Se añaden pruebas de imágenes responsivas, presupuesto de descarga, semántica accesible, contraste AA de los colores de texto/estado y ausencia de imágenes durante el estudio. Las pruebas de continuidad, respuestas y autenticación siguen siendo puertas de publicación. Los breakpoints cubren escritorio, tableta y pantallas pequeñas; no se afirma una inspección visual autenticada sin una sesión del navegador.

Puertas locales: instalación limpia de las 170 dependencias, 297 pruebas correctas y las dos omisiones privadas esperadas; TypeScript y Vite sin errores. El aviso de Vite sobre el tamaño del bloque JavaScript sigue siendo informativo. La hoja de estilos de producción pesa aproximadamente 11,5 KB comprimida; las imágenes se sirven separadas del JavaScript.
