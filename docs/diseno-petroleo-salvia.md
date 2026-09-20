# Cristal cinematográfico · petróleo y salvia — septiembre de 2026

Rediseño de presentación sobre v1.15.1, a partir del paquete de entrega
«Rediseño plataforma médica» (prototipo `Melman Cristal` y paleta B). Cambia la
capa visual de Mi semana, Recuperación, Progreso, la biblioteca y las vistas de
concentración. No cambia la lógica de sesiones, plan, progreso, corpus,
autenticación ni sincronización: ningún componente de estudio recibió estado nuevo.

## Qué cambia

Una escena fotográfica ocupa la ventana entera y los paneles de cristal ahumado
flotan sobre ella, separados entre sí; solo el objeto recortado cruza el borde de
su panel. Un haz de luz, niebla y un halo cálido cruzan la composición despacio.
Al cambiar de vista, la escena completa se funde en 0,9 s.

- **Barra superior**: el raíl lateral se convierte en una píldora de cristal
  pegada arriba, con marca, los tres destinos, «USMLE Step 1», el medidor de IA y
  «Cuenta y ajustes». El contenido recupera el ancho completo (máx. 1560 px).
- **Cabeceras**: panel de cristal con su fotografía dentro y velo propio a la
  izquierda, que es lo que sostiene el contraste del texto.
- **Columna fotográfica**: `figure.scene-window` fija (`sticky`) a la derecha, con
  la foto de detalle, el objeto recortado y el pie de escena. Aparece en Mi semana,
  Recuperación, Progreso y el plan diario clásico; las herramientas anchas
  (biblioteca, auditoría, ajustes) se quedan la pantalla entera.
- **Mi semana**: los días pasan a fila de píldoras dentro del panel del día; las
  tareas son filas redondeadas con casilla salvia, y la sesión preparada es el
  panel de cristal alto con reflejo diagonal y el botón principal salvia→cobre.
- **Recuperación y Progreso**: mismos grupos y cifras sobre el cristal nuevo.
- **Lectura y respuesta**: superficie opaca (`--vidrio-lectura`), sin paralaje y
  con la atmósfera atenuada mientras se responde.

## Escenas por vista

| Vista | Fondo | Foto de la cabecera | Panel lateral | Objeto |
| --- | --- | --- | --- | --- |
| Mi semana | Constelación | Cintas | Amanecer | Cristal |
| Recuperación | Lente | Lente | Piedra | Óptico |
| Progreso | Horizonte | Piedra | Cintas | Bosque |
| Sesión y preguntas | Humo | — | — | — |
| Biblioteca · Auditoría · Ajustes | Cintas · Piedra · Humo | la de su sección | — | — |

Las rutas son literales, no construidas al pintar: una URL montada en el render
acababa en peticiones 404. Las escenas ya vistas se quedan montadas para que el
fundido de vuelta no vuelva a pedir la imagen. Toda la fotografía es decorativa
(`alt=""`, `aria-hidden`) y no entra en la lectura asistida.

## Tipografía

Hanken Grotesk (variable, pesos 200–700) autoalojada en `public/fonts`, con la
licencia SIL OFL del proyecto junto a los archivos. No se pide a Google Fonts: la
política de seguridad del sitio (`public/_headers`) solo admite fuentes y estilos
de este origen, así que un enlace a `fonts.gstatic.com` quedaría bloqueado y el
texto caería al tipo del sistema. Latín y latín extendido suman 54 kB.

## Movimiento y preferencias

Respiración de la fotografía (64 s), haz (28 s), niebla (78 s), halo (46 s) y
flotación del objeto (17 s); paralaje de puntero con `public/depth-motion.js`, que
no cambió. Cada plano consume `--depth-x/--depth-y` con un factor distinto —
cabecera .22, acción .34, paneles bajos .10, panel fotográfico −.45, objeto 1.15—
y en concentración el guion ya reduce ese factor. Con
`prefers-reduced-motion: reduce` no queda animación ni desplazamiento; con
`prefers-reduced-transparency: reduce` o sin `backdrop-filter`, los cristales
suben su opacidad por encima de .90 y el diseño se lee igual sin desenfoque.

En el teléfono la rejilla cae a una columna y la fotografía reducida es la de la
cabecera, justo encima de la acción del día: un paisaje alto al final de la página
sería peso muerto debajo de todo, y su imagen ni siquiera llega a pedirse.

## Verificación

- `npm ci`, `npm test` (462 pruebas, 2 omitidas esperadas) y `npm run build` sin
  errores de TypeScript. No se desactivó ninguna prueba.
- Revisión visual reproducible con el arnés del repositorio
  (`MELMAN_DESIGN_EXPORT=… npm test -- src/__tests__/design-export.test.tsx`)
  sobre los componentes reales, en Chromium a 1440 × 900 y 390 × 844: Mi semana con
  plan, Recuperación, Progreso, biblioteca y acceso. Sin peticiones fallidas.
- Las pruebas de diseño se actualizaron en el mismo cambio: la cabecera ya no
  contiene el paisaje lateral, y el panel fotográfico se comprueba aparte.

Queda pendiente mirar en la aplicación, con sesión iniciada, una sesión mixta y un
bloque NBME: el arnés exporta las pantallas de portada, no las de concentración.
