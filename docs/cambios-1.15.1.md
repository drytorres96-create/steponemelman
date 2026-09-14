# 1.15.1 — El medidor, legible

Publicado el 14 de septiembre de 2026. Yoel probó el de 1.15.0 el mismo día:
demasiado pequeño, y con esos colores los números no se leían. Pedía más
visible, animado, con más protagonismo e intención.

## Qué fallaba

El anillo medía 40 px y la cifra 10 px, pintada del **mismo color que el arco**
—un verde medio— sobre papel claro. Lo único que había que leer ahí era el
número, y era justo lo que peor se veía.

## Qué cambia

**El número manda.** Pasa a 1,6 rem, en `var(--texto)` —el color del texto
normal, con contraste de sobra— y con cifras tabulares para que no baile al
contar. El símbolo `%` va aparte, más pequeño y en gris: acompaña, no compite.

**El color es el estado, no el dato.** Verde con margen, ámbar por debajo del
20 %, **rojo** cuando está agotada —antes agotada y baja compartían color, así
que el ámbar no significaba nada— y gris cuando la ayuda está desactivada.

**El anillo tiene sitio propio.** 84 px dentro de un panel con borde y un
degradado suave, con el rótulo «IA GRATIS HOY» encima y el estado debajo. Deja
de ser un adorno al lado del menú y pasa a ser un bloque que se mira.

**El porcentaje cuenta hasta su nuevo valor** cuando algo gasta, con
desaceleración, a la vez que el arco recorre su camino. El movimiento es la
información: algo acaba de consumir cuota.

**El primer dato aparece directo**, sin contador. Al entrar se quiere leer el
saldo, no ver una animación arrancando de cero. Esto era además un fallo real:
como la cuota llega asíncrona, el primer valor entraba animado desde 0.

Con `prefers-reduced-motion` no hay ni conteo ni transición: el número salta a
su sitio.

**En móvil** el bloque se tumba: píldora con anillo de 42 px, la cifra al lado y
el rótulo en texto, dentro del encabezado compacto.

## Pruebas

`src/__tests__/medidor-ia.test.tsx` pasa a 8, con dos nuevas: que el primer dato
se pinta sin contar y que un cambio posterior sí recorre valores intermedios, y
que agotada se distingue de baja.

Total: 460 pruebas pasan, 2 omitidas, build sin errores de TypeScript.
