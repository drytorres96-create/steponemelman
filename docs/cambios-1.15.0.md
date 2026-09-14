# 1.15.0 — El crédito de IA, a la vista

Publicado el 14 de septiembre de 2026. Pedido por Yoel el 14-sep-2026: que la
cantidad de IA gratuita que queda se vea de forma evidente —un círculo que se
consume, con el porcentaje dentro, en el raíl lateral— y que baje después de
cada uso que gaste.

## El problema

El presupuesto existe desde 1.12.0, pero solo se veía **después** de usar la IA,
en una línea de texto dentro de una tarjeta de Progreso. Para saber si quedaba
cuota había que gastarla.

Además cada pantalla que quisiera enseñarlo tenía que pedirlo por su cuenta, así
que dos sitios podían mostrar dos cifras distintas.

## Medidor en el raíl

Un anillo de 40 px encima de «Cuenta y ajustes», con el porcentaje en el centro
y el rótulo **IA gratis hoy** al lado. Se ve sin buscarlo y no compite con la
navegación.

- **Verde** mientras hay margen, **ámbar** por debajo del 20 %, **gris** cuando
  la ayuda está desactivada en el despliegue.
- El arco **transiciona en vez de saltar** (0,75 s), para que el consumo se vea
  ocurrir; con `prefers-reduced-motion` la transición desaparece.
- En el encabezado compacto de móvil queda solo el anillo; el rótulo lo da el
  título accesible.
- Mientras no hay dato, no ocupa sitio: nada de un hueco con un cero.

## Una sola fuente para la cuota

`src/lib/cuota-ia.ts`, nuevo. Un store con `useSyncExternalStore`: se carga la
primera vez que algo lo pinta, y todos los que lo muestran leen el mismo valor.
La línea de «Lo que se te está mezclando» en Progreso ahora lee de ahí, así que
no puede desviarse del medidor.

**Se refresca tras cada uso.** Los cinco clientes de IA —corregir, explicar,
analizar, confusión, viñeta y chat— avisan al terminar, haya ido bien o mal:
una llamada que falla también consume su reserva. Las consultas se agrupan con
una espera de 0,9 s, así que dos usos seguidos no provocan dos lecturas.

Consultar la cuota **no gasta cuota**: el Worker responde con lo contabilizado,
sin llamar a ningún modelo.

**Sin descuento optimista.** Lo que se pinta es lo que el servidor ha
contabilizado. Un uso servido desde caché no gasta nada, y adelantar un
descuento que luego no ocurre sería mentir sobre el saldo. Si la consulta falla
—sin red, sin sesión— se conserva el último dato bueno en vez de vaciar el
indicador.

## Archivos

| archivo | qué |
|---|---|
| `src/lib/cuota-ia.ts` | el store, el hook y el aviso de uso |
| `src/components/MedidorIA.tsx` | el anillo |
| `src/editorial.css` | estilos del medidor |
| `src/App.tsx` | su sitio en el raíl |
| `src/lib/*-ia.ts` | los cinco clientes avisan al terminar |
| `src/screens/LecturaSemana.tsx` | pasa a leer del store |

## Qué mirar en la aplicación

1. Al entrar, el anillo del raíl debe mostrar el porcentaje de hoy.
2. Usa el chat o pide una viñeta: al cabo de un segundo el anillo baja solo,
   sin recargar.
3. Pasa el cursor por encima: el título dice cuánto queda y cuándo se renueva.

## Pruebas

Nuevo `src/__tests__/medidor-ia.test.tsx` (6): el porcentaje llega al arco, el
aviso de cuota baja y agotada, la ayuda desactivada, la bajada tras un uso sin
que la pantalla pida nada, la conservación del último dato cuando la red o la
sesión fallan, y la escala acotada.

Total: 458 pruebas pasan, 2 omitidas, build sin errores de TypeScript.
