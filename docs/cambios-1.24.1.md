# 1.24.1 — Exportar todo

Publicado el 26 de septiembre de 2026. Cierra el bloque 2 de la auditoría del 26-sep:
«Exportar progreso» ya guarda todo lo que la aplicación tiene de ti.

## Qué cambia

- La copia incluye también **las sesiones de la semana** (`semanas`) y **el plan de esta
  semana** (`plan`), además de los conceptos y las preguntas NBME de 1.24.0.
- Son dos lecturas de red. Si tardan más de 4 segundos o fallan, el respaldo sale igual,
  sin ellas: la copia de lo importante nunca espera a lo accesorio.
- Mientras se prepara, el botón dice «Preparando la copia…».
- «Importar progreso» sigue leyendo sólo los conceptos, en el mismo formato de siempre.

## Qué no cambia

El estudio, los techos, las cajas, el dominio, la meta, la sincronización y el Worker.

## Cómo está hecho

`src/screens/Ajustes.tsx`: `descargar` pide a la vez `cargarHistorialSesiones` y
`cargarPlanSemana`, cada una con `LIMITE_EXTRAS_MS` (4 s), y las añade con
`exportar({ nbme, semanas, plan })`.

## Pruebas

- `simplificacion.test.tsx`:
  - el archivo trae conceptos, NBME, sesiones y plan;
  - si las sesiones fallan y el plan no responde, a los 4 s sale igual, sin ellos, y el
    botón vuelve a estar disponible.
- Mutaciones comprobadas (3). Cada una hace fallar su prueba:
  - exportar sin sesiones ni plan;
  - esperar sin límite;
  - dejar el botón en «Preparando».

Total: 560 pruebas, 558 pasan y 2 omitidas (las de siempre). Build sin errores de
TypeScript.
