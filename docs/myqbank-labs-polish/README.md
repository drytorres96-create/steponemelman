# Laboratorios completos y acabado de interacciones

Solicitud de Yoel, 14 de octubre de 2026. El panel mostraba diez valores séricos y
enviaba al usuario a un PDF para el resto. Ahora las tres páginas de referencia se
consultan dentro de MyQBank: 114 entradas, divididas en 15 secciones, con búsqueda
por nombre/abreviatura y selección de unidades convencionales o SI.

## Una pasada, cinco grupos de ajustes

1. **Contenido y acceso:** química, hepático/proteínas, otros tests séricos/función
   renal, lípidos, hierro, endocrino, inmunoglobulinas, gases, LCR, hemograma,
   coagulación, otros hematológicos, HbA1c, orina y BMI. Conserva subgrupos,
   horarios, signos y unidades de la fuente. BMI informa que la fuente no aporta
   una segunda columna SI. La búsqueda es global; elegir sección limpia la consulta.
2. **Controles:** reflejo y sombra jade, respuesta de pulsación, estado abierto de
   Labs, subrayado de pestaña activa y foco visible; se conserva la paleta clara.
3. **Movimiento:** entradas de panel breves y transiciones de progreso; hover sólo
   con ratón/puntero fino; movimiento reducido desactiva animaciones y desplazamientos.
   No hay animación decorativa continua.
4. **Iconos:** trazo SVG uniforme en pausa, finalización, dashboard, búsqueda,
   enlaces y cantidades; movimiento breve por acción, ayudas nativas en iconos solos.
5. **Compatibilidad y lectura:** filas compactas, controles fijos durante la lectura
   normal, área de valores de al menos 140px y desplazamiento interno en ventanas
   bajas. Labs conserva consulta, sección, unidades y scroll al responder/cerrar.
   Las treinta anclas de las diez filas antiguas mantienen nombres y claves exactas.

## Fuente y revisión

[USMLE Step 1 Sample Test Questions](https://www.usmle.org/sites/default/files/2021-10/Step_1_Sample_Items.pdf#page=8),
actualización abril de 2026, páginas impresas 7–9. Se conserva la clasificación
del examen, sin sustituir sus valores por límites de otros laboratorios o guías.
La organización endocrina se aclara para no presentar orina de 24 horas o captación
tiroidea como concentraciones séricas.

[Revisión independiente por IA](labs-independent-review.json): 114/114 IDs,
rangos convencionales/SI y cobertura verificados contra el texto oficial. El
registro contiene hash SHA-256 del archivo exacto, localizadores por ID y siete
aclaraciones de contexto resueltas. No constituye aprobación médica humana. No se
afirma inspección visual del PDF: el conector sólo devolvió texto y marcadores de
imagen. No se copia el cuadernillo ni sus preguntas al repositorio.

## Comprobaciones

- `npm ci`, `npm test`, `npm run build`.
- `CHROMIUM_PATH=/usr/bin/chromium npx playwright test`.
- `CHROMIUM_PATH=/usr/bin/chromium npm run e2e:myqbank`.
- `CHROMIUM_PATH=/usr/bin/chromium MYQBANK_EVIDENCE_DIR=<carpeta> node qa/myqbank-review.mjs`.

Las pruebas nuevas cubren cobertura, búsquedas, unidades, ausencia de resultados,
BMI, resaltado por unidad, carga de treinta anclas antiguas, conservación de
controles/scroll al reubicar y reabrir, ratón/teclado/movimiento reducido, y tamaños
390×844, 768×844, 1024×844, 1280×844, 961×601 y 1024×601. En escritorio de estudio
se comprueba que el documento no crece ni horizontal ni verticalmente. Las capturas
de [antes/después](screenshots/) usan exclusivamente datos sintéticos y completan
las animaciones finitas antes de capturar.

La revisión adversarial resolvió tres hallazgos: compatibilidad de las anclas,
estado al mover el panel y espacio para la tabla en escritorios bajos. La publicación
requiere CI verde sobre el HEAD exacto; los resultados quedan en el PR asociado.
No hay migración de base, modificación de preguntas, claves ni historial.
