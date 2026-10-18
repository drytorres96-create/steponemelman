# MyQBank · refinamiento visual · 1.40.0

**Diseño web.** Las tarjetas competían con el mismo volumen y el fondo saturado;
el constructor partía los tamaños de bloque en filas irregulares. El dashboard
conserva sus tres zonas, pero el siguiente paso ocupa el ancho del progreso y
el estudio. Progreso y actividad siguen a la vista, Claude tiene una entrada
propia y el constructor agrupa sus controles con intervalos regulares.

- Superficies claras y carbón/bosque, jade para estudiar y coral para Claude.
  Fondos más tranquilos, sombras cortas, radios y escala tipográfica coherentes.
- Métricas sin tarjetas anidadas, filtros por sistema alineados y tamaños de bloque
  en una fila de cinco controles. Cabecera móvil en una fila; a 320 px Dashboard
  conserva su icono, nombre accesible y área táctil.
- Pregunta y explicación con menos capas; Claude conserva el ancho expandido en
  estudio y el diálogo del dashboard permite hasta 780 px. Sus acciones frecuentes
  tienen objetivos táctiles de al menos 44 px.
- Ajustes con cabecera agrupada y FAQ en dos columnas en escritorio; acceso y
  recuperación de contraseña comparten las nuevas superficies.
- Entradas de 200–300 ms y respuesta breve al pasar el puntero. Sin movimiento
  decorativo continuo; `prefers-reduced-motion` elimina las transiciones.

## Referencias consultadas

- [Linear: How we redesigned the Linear UI](https://linear.app/now/how-we-redesigned-the-linear-ui):
  reducir ruido, ordenar superficies y conservar la navegación de una actualización contenida.
- [Radix Themes: Typography](https://www.radix-ui.com/themes/docs/theme/typography):
  escala, interlineado y jerarquía consistentes.
- [IBM Carbon: Motion](https://www.carbondesignsystem.com/building-blocks/foundations/motion/overview):
  movimiento breve para apoyar acciones repetidas y adaptación a movimiento reducido.

Se aplican principios, sin copiar componentes ni añadir dependencias, fuentes remotas
o solicitudes a terceros. La identidad y los componentes existentes se conservan.

## Implementación y límites

`src/myqbank/refinement.css` contiene la presentación exclusiva de producción,
importada desde `workspace.css` para incluir también acceso. Los selectores
`.mq-root.mq-workspace` prevalecen sobre la hoja de layout del chunk diferido,
independientemente del orden del build. El prototipo aislado conserva su diseño.
`Dashboard.tsx` y `MyQBankApp.tsx` sólo añaden agrupaciones de presentación y el
nombre accesible del acceso al dashboard.

No cambia selección, corrección, progreso, historial, sincronización, modelos de IA,
RPC ni contenido. El dashboard y Ajustes siguen desplazándose como documento;
en estudio de escritorio cada panel se desplaza por dentro. Labs conserva su
posición antes y después de responder. No se cambia la versión del evaluador.

## Revisión y evidencia

Capturas sintéticas antes/después a 390 y 1280 px en claro y oscuro: dashboard,
Ajustes, estudio antes y después de responder, acceso y recuperación. Las imágenes
seleccionadas están en `before/` y `after/`; la matriz completa se genera con
`MYQBANK_EVIDENCE_DIR=<directorio> node qa/myqbank-review.mjs` y queda también en
el artefacto de CI `myqbank-phases-2-4`.

| Vista | Antes | Después |
| --- | --- | --- |
| Dashboard · escritorio | [Claro](before/dashboard-1280-light.webp) · [Oscuro](before/dashboard-1280-dark.webp) | [Claro](after/dashboard-1280-light.webp) · [Oscuro](after/dashboard-1280-dark.webp) |
| Dashboard · móvil | [Claro](before/dashboard-390-light.webp) · [Oscuro](before/dashboard-390-dark.webp) | [Claro](after/dashboard-390-light.webp) · [Oscuro](after/dashboard-390-dark.webp) |
| Estudio y Claude | [Escritorio](before/study-after-1280-dark.webp) · [Móvil](before/study-after-390-light.webp) | [Escritorio](after/study-after-1280-dark.webp) · [Móvil](after/study-after-390-light.webp) |
| Ajustes | [Escritorio](before/settings-1280-light.webp) · [Móvil](before/settings-390-light.webp) | [Escritorio](after/settings-1280-light.webp) · [Móvil](after/settings-390-light.webp) |
| Acceso | [Escritorio](before/auth-1280-light.webp) · [Móvil](before/auth-390-light.webp) | [Escritorio](after/auth-1280-light.webp) · [Móvil](after/auth-390-light.webp) |
| Recuperar contraseña | [Escritorio](before/recovery-1280-light.webp) · [Móvil](before/recovery-390-dark.webp) | [Escritorio](after/recovery-1280-light.webp) · [Móvil](after/recovery-390-dark.webp) |

`e2e/myqbank-design.spec.ts` comprueba seis anchos de 320 a 1920 px, ambos temas,
diez sistemas, controles de 44 px, ausencia de solapes/desbordes, filtros expandidos,
foco visible con teclado, apertura/cierre de Claude y movimiento reducido. Los
recorridos existentes comprueban estudio, scroll, sesiones guardadas, diálogos y
la conservación de la conversación y recuperación activa al ampliar/reducir.

Puertas locales: `npm ci` (170 paquetes), `npm test` (1.395 aprobadas y 2 omisiones
previstas), `npm run build` (TypeScript y Vite sin errores). Pasaron los 50 recorridos
existentes de dashboard/Claude/estudio/scroll, los 6 casos de la nueva matriz visual
y los 5 casos de conversación y práctica expandida. La publicación exige además
el CI completo sobre el commit del PR y el despliegue de ese mismo cambio en main.

Revisión adversarial propia: el primer diseño a dos columnas desplazaba el progreso
demasiado abajo en una cuenta poblada; se sustituyó por tres zonas y una cabecera
compartida. La animación se aplica a las tarjetas, no al contenedor del diálogo
fijo. Se comprobó expresamente el orden de CSS de producción. Todo el material de
las capturas es ficticio y no constituye contenido médico publicado.
