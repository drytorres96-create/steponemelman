# Versión 1.31.3

Revisor adversarial / diseño web: el pie de Ajustes y los atributos internos de la
aplicación seguían mostrando 1.31.0 porque `src/release.ts` contenía una versión fija,
mientras el paquete publicado ya estaba en 1.31.2. Recargar no podía corregir ese texto.

`APP_VERSION` importa ahora la versión de `package.json`. Ajustes, la aplicación y
la pantalla de acceso conservan sus consumidores actuales y comparten esa única fuente.
No se modifica el almacenamiento, las sesiones, el historial, el material ni las metas.

La comprobación de navegador de Ajustes verifica que el texto visible y el atributo
de la aplicación coinciden con el paquete, a 390 y 1280 píxeles, junto con sus controles
y la conservación del estado sintético. La publicación exige las pruebas unitarias,
la compilación, CI verde sobre el commit exacto y el despliegue de Cloudflare.

Validación local: `npm ci`, 1076 pruebas unitarias aprobadas y dos omisiones
esperadas; compilación de producción correcta; cuatro pruebas de navegador de
FAQ/Hoy aprobadas. Las capturas antes/después confirman el cambio de 1.31.0 a
1.31.3 en ambos anchos, sin desborde ni errores JavaScript. Revisión independiente
del diff sin hallazgos bloqueantes, altos o medios.
