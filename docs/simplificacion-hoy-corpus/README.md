# Verificación de Hoy, preguntas frecuentes y navegación

La suite completa final pasó 97/97, las capturas posteriores 2/2 y la revisión de navegación terminó sin errores. Los resultados y registros están en [VALIDACION.md](VALIDACION.md).

Las capturas usan la aplicación real con los proveedores y conceptos sintéticos del arnés E2E. No contienen cuentas ni material clínico del corpus privado. El navegador bloquea peticiones externas y devuelve un error sintético para las rutas API. Consultar FAQ, índice, navegación o destinos retirados no crea sesiones ni modifica el historial.

La evidencia anterior se construyó desde el árbol inmutable `c0f6256738591233640639467823ba57f8223e07` de la entrega precedente. Sus fuentes `src/` y `e2e/` son idénticas a las de `d9e71f0f0ca99310aa17ba5c6173cec42e1c6efe`, punto de partida de esta entrega. El menú anterior tenía seis destinos y la Biblioteca tres tipos; sus listas exactas están en `antes/evidencia-*.json`.

Los nuevos contratos verifican:

- Trece FAQ inicialmente cerradas, cuatro grupos, apertura con Enter/Espacio y controles de al menos 44 px. La explicación usa los criterios guardados aunque se edite y cancele un borrador.
- El índice permanece sin cargar hasta abrirlo; se carga una vez y muestra la tabla de material publicado.
- Un concepto sintético ausente conserva todo su historial y no consume el único lugar de un concepto disponible en Cajas. Presentar ese concepto registra únicamente su vista.
- Menú de cuatro destinos y Biblioteca con Conceptos/Preguntas. Los hashes anteriores `inicio`, `auditoria`, `vinetas` y `cobertura` vuelven a Hoy conservando el estado íntegro.
- Los recorridos existentes de NBME, recuperación, teclado, pausa, presupuesto IA y progreso siguen formando parte de la suite completa.

Las imágenes se capturan a 390 y 1280 px, con movimiento reducido explícito, fecha sintética en Nueva York y página completa desde el inicio. Se espera el final de los títulos y se retira el foco transitorio salvo en la fotografía del menú abierto. Cada captura comprueba que no haya desbordamiento horizontal. No se modifica el producto para fotografiarlo.

Los primeros contratos de Cajas fallaron por dos selectores nuevos que yo había supuesto: el nombre accesible real es `cajas: 0 de 1`, y el reproductor mixto muestra `Bloque 1 de 1 · Paso 1 de 1` con la barra `Cajas hechas`. Se corrigieron los selectores después de inspeccionar el DOM; se conservaron las comprobaciones de cantidad, registro de vista e historial íntegro. La repetición pasó 2/2.

La primera suite completa pasó 94/97. Dos expectativas conservaban la copia anterior «Tu objetivo de hoy» y se actualizaron a «Objetivo de hoy», manteniendo el resto del contrato. El tercer fallo surgió al abrir Cómo va todo: el botón de la meta coexistía con el nuevo botón frontal para retomar. La prueba comprueba que el frontal esté visible y pulsa el botón dentro del panel de recuperación de la meta, para verificar la ruta solicitada sin elegir arbitrariamente el primero.

Las capturas finales pasaron 2/2 sobre una compilación nueva de la fuente actual, incluida la atribución de la evidencia docente en AyudaIA. Hay diez imágenes anteriores y dieciséis posteriores: además de las cinco pantallas comunes, las posteriores muestran FAQ ampliadas, el índice abierto y un destino retirado que vuelve a Hoy. La revisión independiente de navegación pasó con nueve capturas, cuatro destinos exactos y ningún error; su resumen está en `NAVBAR-REVIEW.json`.

Ejecución local:

```sh
CHROMIUM_PATH=/usr/bin/chromium npm run e2e
npx vite build --config e2e/arnes/vite.config.ts --outDir /workspace/work/hoy-faq-qa-despues --emptyOutDir
CHROMIUM_PATH=/usr/bin/chromium HOY_CAPTURE=despues HOY_QA_BUILD=/workspace/work/hoy-faq-qa-despues npx playwright test --config docs/simplificacion-hoy-corpus/playwright-capturas.config.ts
```

La revisión de los conceptos apartados se guarda y valida en un directorio privado, separado de estas pruebas. Los fixtures no incorporan sus IDs, fragmentos, preguntas ni imágenes. La suite sintética comprueba el producto; la verificación clínica y estructural del corpus se realiza de forma independiente.
