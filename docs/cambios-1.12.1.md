# 1.12.1 — La lectura de la semana citaba conceptos que no sabía copiar

Publicado el 14 de septiembre de 2026. Corrige un fallo introducido en 1.12.0 y
reportado por Yoel el mismo día: la tarjeta «Lo que se te está mezclando» se veía,
pero pulsar «Leer mi semana con IA» no daba lectura, y el porcentaje de cuota no
aparecía nunca.

## Qué fallaba

Los dos síntomas eran uno solo: el porcentaje de cuota se pintaba dentro del
bloque de la lectura, así que si la lectura no llegaba, tampoco se veía.

La lectura no llegaba porque el prompt pedía citar cada concepto por su
**identificador del corpus**, y esos identificadores terminan en ocho caracteres
al azar. En la semana real de Yoel convivían estos dos:

```
CPT-ENDOCRINE-017-0ffaad42
CPT-ENDOCRINE-017-c5b8beda
```

Un carácter mal copiado invalidaba **la respuesta entera**, no la cita. Con dos
identificadores que solo se distinguen por su sufijo, eso falla casi siempre.

Las pruebas de 1.12.0 no lo detectaron porque usaban identificadores cortos
(`QA-1`, `QA-2`) y un modelo simulado que los devolvía exactos: ejercían el
camino, no la dificultad.

## Qué cambia

**Se cita por número.** Cada concepto va numerado en el campo `n` y el modelo
devuelve `conceptos: [1, 3]`. Un número de un dígito no se copia mal. El Worker
resuelve el número al identificador, así que lo que se muestra sigue saliendo de
la lista enviada y nunca del modelo.

**Lo irresoluble se cae solo.** Una cita que no se puede resolver se descarta sin
llevarse su patrón; un patrón sin conceptos se descarta sin llevarse la lectura.
Solo cuando no queda nada citable se responde que no hay lectura. Se siguen
aceptando identificadores exactos y números en texto.

**Se recorta en vez de rechazar.** Un `porque` de más de 500 caracteres o un
enfoque largo se truncan; antes tiraban la respuesta completa. El techo de
salida sube de 700 a 900 tokens, porque un JSON cortado a la mitad se leía como
«el modelo no devolvió JSON».

**El fallo dice qué pasó.** El 503 lleva ahora un `detalle` corto —«ningún patrón
citaba conceptos de esta semana», «el modelo no devolvió JSON»— que la tarjeta
muestra. Diagnosticar dejaba de ser posible sin mirar los registros del Worker.

**La cuota se consulta al entrar en Progreso**, no después de una lectura
correcta: no gasta IA, y saber cuánto queda antes de pulsar es parte de decidir
si pulsar.

## Garantía que no cambia

Un concepto que no estuviera en la semana enviada no se muestra nunca. Cada cita
se resuelve contra la lista; lo que no esté en ella se descarta.

## Pruebas

`src/server/worker.test.ts` pasa a 29 e incluye el caso real: los dos
identificadores que solo difieren en el sufijo, citados por número; un sufijo mal
copiado que se cae sin llevarse la lectura; y el recorte de textos largos.
`src/__tests__/lectura-semana.test.tsx` (5) comprueba que la cuota se ve antes de
pulsar y que el detalle del fallo llega a la pantalla.

Total: 426 pruebas pasan, 2 omitidas, build sin errores de TypeScript.
