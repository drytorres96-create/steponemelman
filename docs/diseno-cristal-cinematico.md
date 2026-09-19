# Cristal cinematográfico — septiembre de 2026

Rediseño de presentación sobre v1.15.1. Se conservan Mi semana, Recuperación,
Progreso, NBME, el plan diario clásico y las herramientas de cuenta. No cambia
la lógica de sesiones, autenticación, progreso, material privado ni sincronización.

## Dirección y escenas

La página es un paisaje continuo verde petróleo; la navegación flota en cristal
ahumado, con reflejos discretos que prolongan la luz de la fotografía. Tarjetas
oscuras, controles transparentes y títulos editoriales sustituyen el escritorio
claro anterior. Las cabeceras son compactas: el estudio sigue siendo lo primero.

| Vista | Escena estable |
|---|---|
| Acceso y Mi semana | Constelación |
| Recuperación | Lente |
| Progreso | Horizonte |
| Elegir contenido | Cintas de cristal |
| Plan diario clásico | Amanecer |
| Calidad del material | Piedra |
| Ajustes | Cristal ahumado |
| Sesión mixta, conceptos y preguntas | Fondo liso sin fotografía |

Los fondos proceden de los activos aportados por el usuario. El manifiesto de
`public/images/cinematic/manifest.json` conserva procedencia, dimensiones y
puntos focales. Las variantes móviles evitan descargar imágenes de escritorio
cuando la pantalla es estrecha; solo se carga la escena mostrada. No hay
información clínica, métricas ni controles incrustados en el arte.

## Lectura y adaptación

Las preguntas y correcciones usan superficies opacas. Los estados conservan
sus nombres y colores diferenciados; la navegación activa tiene borde y marca
además de color. No hay partículas ni parallax continuo. La entrada dura 240 ms;
la elevación se limita a hover con puntero preciso. Se respetan preferencias de
movimiento y transparencia reducidos. Sin backdrop-filter permanecen fondos
suficientemente oscuros; el blur se limita al rail y a la tarjeta de acceso.

La navegación pasa a cabecera compacta móvil. Los fondos respetan el foco lateral
de cada escena. Las imágenes son decorativas y se excluyen de la lectura asistida.

## Verificación y límites

Las pruebas editoriales verifican rutas responsive, semántica decorativa,
presupuesto de imágenes y contraste de los tokens oscuros. No constituyen una
medición visual de todas las composiciones translúcidas. Las pruebas existentes
siguen cubriendo el comportamiento funcional; no se han desactivado pruebas.

Queda pendiente la inspección visual autenticada en una vista previa accesible:
Mi semana con plan, Recuperación, Progreso y sesión NBME, en escritorio y móvil.
La prueba visual local está bloqueada por la política del navegador remoto;
no se ha sustituido por otro navegador ni afirmado su comprobación.
