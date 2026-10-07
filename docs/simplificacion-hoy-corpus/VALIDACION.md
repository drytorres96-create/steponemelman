# Validación final de la entrega 1.31.0

Verificación local completada el 7 de octubre de 2026 sobre la fuente final, incluida la corrección de atribución de evidencia docente en AyudaIA. El arnés utiliza datos sintéticos y no escribe en ninguna base de datos.

| Comprobación | Resultado | Evidencia |
| --- | --- | --- |
| Suite unitaria completa | 996 aprobadas y dos omisiones previstas; 84,93 s | `UNITARIAS.txt` |
| Compilación de producción | Aprobada, TypeScript y Vite | `BUILD-PRODUCCION.txt` |
| Suite E2E completa, sin reintentos | 97/97 aprobadas; 5,6 minutos | `E2E-COMPLETO.txt` |
| Copia nueva de Hoy y alcance del botón de reanudación | 4/4 aprobadas | `E2E-COPIA-Y-ALCANCE.txt` |
| Cajas con historial de material ausente | 2/2 aprobadas | `E2E-CAJAS-DISPONIBLES.txt` |
| Capturas anteriores, 390 y 1280 px | 2/2 aprobadas; 10 imágenes | `CAPTURAS-ANTES.txt`, `antes/` |
| Capturas posteriores, 390 y 1280 px | 2/2 aprobadas; 16 imágenes | `CAPTURAS-DESPUES.txt`, `despues/` |
| Revisión visual y accesible de navegación | 9 capturas; 0 errores | `NAVBAR-REVIEW.json` |
| Compilación nueva del arnés para AFTER | Aprobada; salida absoluta | `BUILD-DESPUES.txt` |

La suite completa incluye los cuatro nuevos contratos de FAQ/índice/material disponible, los destinos retirados, navegación con teclado y tacto, movimiento reducido, rendimiento, continuidad de las sesiones, recuperación NBME e historial de revisiones. Los criterios, intentos y resultados iniciales se conservan al consultar las FAQ, abrir el índice o navegar.

El primer lote completo obtuvo 94/97: dos expectativas usaban la copia anterior de Hoy y una consulta global encontraba dos botones de reanudación válidos. Las correcciones mantienen las comprobaciones de una acción principal, identidad de sesión, intento guardado y destino final. El registro parcial permanece en `E2E-PARCIAL-COPIA-Y-ALCANCE.txt`; la repetición completa final es el resultado de referencia.

La evidencia anterior de esta entrega procede del árbol `c0f6256738591233640639467823ba57f8223e07`, cuyas fuentes coinciden con el punto de partida `d9e71f0f0ca99310aa17ba5c6173cec42e1c6efe`. El script general de revisión de navegación conserva su baseline propio `ef9e3c21514b11a9fd4791cce618e03acdae244b`, indicado en su JSON. Sus imágenes temporales se guardaron fuera del repositorio; las capturas de esta entrega están en `antes/` y `despues/`.

Las imágenes muestran la página completa desde el inicio, títulos terminados y foco transitorio retirado salvo en el menú abierto. Todas comprueban ausencia de desbordamiento horizontal. Las PNG históricas autoactualizadas por los tests de recuperación se restauraron; esta entrega conserva sólo sus nuevas capturas.

La revisión clínica y la validación de los conceptos apartados se realizan por separado en archivos privados. Estas pruebas no incorporan sus IDs, fragmentos, preguntas o imágenes, y no sustituyen esa revisión.
