# 1.11.0 — El dominio pasa de seis puertas a dos señales continuas

Publicado el 14 de septiembre de 2026. Diseño acordado con Yoel el 14-sep-2026.

## El problema

El dominio era un `AND` de seis puertas binarias. Si fallaba una, el avance
visible era cero: nada se movía, nada explicaba por qué. Además:

- **Un fallo borraba toda la evidencia.** Cuatro aciertos y un mal día te
  devolvían al principio.
- **El «recargo por reconocimiento»** (+1 acierto si todo era opción múltiple)
  era un parche: no distinguía acertar entre dos opciones de acertar entre cinco.
- **El tiempo era una puerta, no un parámetro.**

## Señal 1 — Probabilidad de que la racha sea suerte

`src/srs/azar.ts`. Cada acierto trae su propia probabilidad de haberse acertado
sin saber, y el conjunto se multiplica. La evidencia se acumula como
probabilidad, no como conteo.

| formato | azar |
|---|---|
| recuerdo libre, completar, numérico, escritura | 0,05 |
| tarjeta, caso clínico, simulador, aplicación | 0,10 |
| clasificar, relacionar, secuencia | 0,15 |
| visual | 0,20 |
| opción múltiple (y formato desconocido) | 0,25 |
| predicción direccional | 0,33 |
| verdadero o falso | 0,50 |
| acierto con ayuda | 1,00 (no suma, tampoco borra) |

Se exige **≤ 1 %**. En la práctica: dos recuerdos libres bastan (0,25 %); de
opción múltiple hacen falta cuatro (0,39 %), tres todavía no (1,6 %); verdadero
o falso no acredita hasta siete. Los valores abiertos no son cero a propósito: se
puede acertar por parecido o por descarte, y 0,05 reconoce ese suelo.

Esto sustituye al recargo y al criterio «recuerdo libre o aplicación», bajo el
mismo interruptor `exigirRecuperacionActiva` de Ajustes.

## Señal 2 — Probabilidad de recordarlo hoy

La retención del planificador, `R(t) = (1 + 19/81·t/S)^-0,5`, entra en el detalle
del dominio como cifra visible. Sube con cada acierto bien espaciado y baja sola
con los días.

Es **indicador, no puerta**: el planificador ya fija `proxima` en el instante en
que la retención cae a ese mismo 0,90, así que exigirla otra vez duplicaría el
vencimiento y borraría la diferencia entre «nunca lo dominaste» y «toca
repasarlo». La cifra que se enseña y la regla que vence un concepto son el mismo
0,90.

Con esto el espaciado deja de ser un muro y pasa a ser un parámetro: aciertos
juntos dan poca estabilidad y la retención cae rápido; separados, se sostiene.

## Retroceso: un fallo descuenta dos aciertos

`DESCUENTO_POR_FALLO = 2`. Fallar retrocede un escalón real —y el planificador
además recorta la estabilidad, así que la retención baja sola y el concepto
vuelve a la cola ese mismo día— sin tirar semanas de trabajo. Dos fallos
seguidos descuentan cuatro; nunca baja de cero. Una respuesta por revisar ni suma
ni resta. Un acierto con ayuda no suma, pero tampoco protege del descuento.

## Lo que se ve

`resumenDominio` lleva ahora siempre las dos señales:

```
Dominio: 2/3 aciertos independientes · 2/2 sesiones · recuerdo hoy 94 % · azar 1.6 %
Dominio acreditado · recuerdo hoy 100 % · azar 0.25 %
```

Dos números que se mueven cada día, en lugar de un binario que no se mueve.

## Lo que no cambia

Las 48 h de separación siguen como puerta, decidido por Yoel: garantía dura
contra acreditar algo estudiado de una sentada. El riesgo de bloqueo invisible
desaparece porque ahora las otras señales sí se mueven. `CriteriosDominio` no
cambia de forma, así que el estado sincronizado entre dispositivos sigue siendo
compatible.
