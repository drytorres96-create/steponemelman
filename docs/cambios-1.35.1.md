# El scroll de MyQBank vuelve a funcionar en escritorio · 1.35.1

Aviso de Yoel del 17-oct-2026: en `?workspace=myqbank`, ni el dashboard ni Ajustes se podían
desplazar para ver lo que hay más abajo.

## Qué pasaba

La raíz del espacio de trabajo lleva dos clases, `mq-preview` y `mq-workspace`. La primera
(`layout.css`) fija `height: 100dvh; overflow: hidden`; la segunda (`workspace.css`) la corrige con
`height: auto; overflow: visible`. Las dos tienen la misma especificidad, así que manda la que cargue
después. En el build, la hoja de entrada (que arrastra `workspace.css` desde `AuthFrame`) carga
**antes** que la del bloque de MyQBank (que trae `layout.css`), de modo que ganaba `overflow: hidden`
y la página se quedaba al alto de la ventana. En móvil (≤ 960 px) otra regla de `layout.css` lo
reabría, y por eso allí sí se desplazaba. El servidor de desarrollo inyecta las hojas en el orden
contrario, así que ninguna prueba lo veía.

## Qué cambia

`workspace.css` pasa esas tres declaraciones a `.mq-preview.mq-workspace`, más específico que
`.mq-preview`: el resultado ya no depende del orden en que cargue cada hoja. La regla de la vista de
estudio en escritorio (`.mq-workspace--study`, que fija el alto de la ventana y desplaza los paneles
por dentro) sube al mismo nivel (`.mq-preview.mq-workspace--study`) y, al ir después, sigue ganando
allí. No cambia nada más.

## Validación

- `e2e/myqbank-scroll.spec.ts` (nueva): a 1280 × 720, en el dashboard y en Ajustes, comprueba que la
  raíz no recorta, que el documento es más alto que la ventana y que la rueda del ratón desplaza la
  página. Reproduce el orden de producción moviendo `layout.css` detrás de `workspace.css`: con el
  código anterior falla (`overflow: hidden`), con el nuevo pasa.
- Comprueba también que la vista de estudio sigue fija al alto de la ventana con ese mismo orden.
- Las 36 specs de MyQBank pasan (`e2e/myqbank-*.spec.ts`).
