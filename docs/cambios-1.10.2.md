# 1.10.2 — La separación baja de 96 h a 48 h

Publicado el 14 de septiembre de 2026.

Decidido por Yoel el 14-sep-2026. Cuatro días por concepto eran demasiados con el
examen en diciembre: el umbral quedaba fuera de alcance y el progreso dejaba de
verse. Dos noches de sueño separan los aciertos de verdad —que es lo que el
espaciado necesita— y caben dentro de la semana.

`CRITERIOS_POR_DEFECTO.separacionHoras` pasa de 96 a 48. El resto del criterio no
cambia: 3 recuperaciones, 2 sesiones distintas, al menos una sin pistas,
recuperación activa y 7 días sin confusiones.

## Migración de las cuentas que ya tenían 96 h

`criterios` es un campo persistido y sincronizado, así que cambiar la constante no
llega solo a una cuenta que ya guardó los valores anteriores. El mecanismo que ya
existía —migrar cuando lo guardado coincide **exactamente** con una generación
anterior, prueba de que nunca se tocó a mano— pasa de reconocer una generación a
reconocer una lista:

- `CRITERIOS_HEREDADOS` — 20 h / 14 días, anterior al 10-sep.
- `CRITERIOS_96H` — 96 h / 7 días, vigente del 10 al 14 de septiembre.

Unos criterios ajustados a mano siguen conservándose intactos.

## Efecto inmediato

Los seis conceptos que se quedaron sin acreditar adelantan su fecha:

| concepto | con 96 h | con 48 h |
|---|---|---|
| `CPT-ENDOCRINE-018-d85b859e` | mié 16, 19:35 | **hoy, 19:35** |
| `CPT-ENDOCRINE-012-f4c5531a` | jue 17, 20:23 | mar 15, 20:23 |
| `CPT-NEURO-PART-I-005-e1e22b49-a` | jue 17, 20:24 | mar 15, 20:24 |
| `CPT-ENDOCRINE-014-4d4bfb31` | jue 17, 20:25 | mar 15, 20:25 |
| `CPT-ENDOCRINE-005-2310ae6f` | jue 17, 20:31 | mar 15, 20:31 |
| `CPT-ENDOCRINE-002-6f0c78a4` | jue 17, 20:32 | mar 15, 20:32 |

Se acreditan solos al volver a acertarlos después de esa hora. No hay que tocar
ningún dato.
