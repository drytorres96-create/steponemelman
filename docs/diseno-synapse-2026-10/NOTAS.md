# 1.28.0 · Synapse adaptado a Melman

Lote 1 · diseño web. La referencia SynapseX se integra en el entorno de estudio existente: cápsulas de navegación, cristal oscuro con salvia, trama de puntos, tarjetas de cifras y una entrada breve de los títulos. Hoy mantiene el anillo, el siguiente bloque, el orden de los repasos, los techos y los accesos secundarios. Los indicadores conservan sus valores y definiciones; no hay carrusel que esconda información.

El fondo responde al desplazamiento con un movimiento de hasta 18px y una escala máxima de 1.025. Usa las imágenes locales existentes y sólo solicita un cuadro cuando cambia la posición. El desenfoque inferior queda dentro del fondo, detrás del contenido. Los títulos animan como máximo dos letras durante 560ms y conservan texto accesible estable. Movimiento reducido y pestaña oculta detienen los efectos; las sesiones retiran este entorno y mantienen sus pieles de lectura.

El menú conserva el elemento nativo `details`, sus destinos y sus etiquetas. El icono se transforma al abrirlo y Escape lo cierra devolviendo el foco. En pantallas de 320px, la etiqueta de cuenta puede ocupar dos líneas para mantener la marca completa. No se añadieron dependencias, descargas externas de vídeo ni cambios de autenticación, datos, contenido médico o lógica de estudio.

## Revisión

- Capturas antes/después de Hoy, Biblioteca y Progreso a 390 y 1280px en `capturas/`, con datos sintéticos del arnés y movimiento reducido.
- Pruebas de navegador adicionales a 320, 390 y 1280px: teclado, destinos del menú, marca completa, cifras sin desbordamientos y entrada en concentración.
- Comprobación con imágenes bloqueadas y cambio de movimiento reducido mientras está abierta la página.
- Pruebas de ciclo de vida: finalización de letras, accesibilidad, límites del fondo y retirada de eventos/cuadros al desmontar.
- Revisión adversarial: corregidos el recorte de marca a 320px y la continuidad del texto de la cabecera clásica en el DOM.

Las capturas no contienen material ni progreso de una cuenta real.

## Validación local

Node 22.23.3; `npm ci` terminó correctamente. `npm test`: 802 aprobadas y 2 omisiones previstas. `npm run build`: TypeScript y Vite correctos; se mantiene el aviso informativo del chunk principal mayor de 500kB. El recorrido completo del navegador aprobó 75 de 76 escenarios; se corrigió el reinicio accidental de `animation-play-state` en fondos ocultos y la repetición de los ocho escenarios de rendimiento e integración aprobó 8/8. El CI vuelve a recorrer la suite completa sobre el commit a publicar.
