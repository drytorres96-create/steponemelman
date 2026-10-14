# Trabajo siguiente a la base visual

La fase 1 entrega código de presentación aislado y contratos. Estas tareas no
se ejecutan por abrir o construir la vista previa.

## Fase 2 Sesiones y persistencia

1. Añadir campos opcionales para modo, cursor, omisiones y cierre; valores por
   defecto Tutor para sesiones antiguas. Actualizar parseo, normalización y merge.
2. Compartir la protección de resultados entre jugador, mapa y métricas durante
   Test. Probar pausas, cambios de pantalla y pestañas simultáneas.
3. Separar borrador, intento enviado y reintento; idempotencia y recuperación de
   escritura fallida. Los conceptos pendientes de calificación no son errores.
4. Preparar diseño revisable de anotaciones y RLS según CONTRACTS. Si se aprueba
   esa fase, implementar migración y reversión con aislamiento entre cuentas.
5. Cola y resolución de conflictos con lápidas; fixtures anteriores, archivos,
   reset/generation y lectores compatibles con rollback.
6. Tamaños 5–80 con carga NBME en lotes de máximo 20 referencias por solicitud.

Aceptación: dos dispositivos convergen; un intento se guarda una vez; no se pierden
borradores; no se revelan resultados de Test ni anotaciones ajenas.

## Fase 3 Dashboard y pantallas generales

1. Conectar el único Build a block a NBME, Mehlman Concepts y Mixed, usando selección
   por identidad y el motor actual para conceptos. Contador igual a cola creada.
2. Integrar progreso y meta en Dashboard; conservar techo, prioridades, calendario
   y reglas del examen. Retirar Biblioteca y Progreso como destinos independientes.
3. Conectar estadísticas por material, estados sin datos y lectura diferida.
4. Reutilizar la marca, tokens y componentes en Settings y autenticación; conservar
   respaldo, sincronización, recuperación de cuenta y FAQ.
5. Tema global con preferencia compatible. La muestra no modifica la preferencia
   `step1-piel-estudio`; decidir transición y probar montajes superpuestos.

Aceptación: datos reales, filtros sin duplicados, cero historial, pausa/reanudación
y meta sin cambios. Solo se retiran rutas cuando las acciones tienen destino nuevo.

## Fase 4 Estudio y piloto editorial

1. Integrar contenedor común con los diez formatos existentes, preservando sus
   evaluadores y variantes. Usar las presentaciones exactas guardadas en sesiones.
2. Conectar recursos originales, visor de imagen, errores de carga y referencia
   de laboratorio validada. Su posición depende de poder revelar la explicación.
3. Implementar subrayado por selección y borrado sin marcar accidentalmente una
   respuesta. Compatibilidad teclado/táctil/navegadores y persistencia de fase 2.
4. Revalidar la selección privada 12 + 12. Redactar y revisar explicaciones en
   español con evidencia por sección, especialmente las alternativas NBME.
5. Integrar estados editoriales, hash/revisión, fallback y carga diferida. Drills
   finitos con solución inicialmente oculta y retorno al bloque original.
6. Reutilizar Workers AI, COACH y cuotas. No añadir proveedor de pago, claves o
   generación al mostrar automáticamente una explicación.

Aceptación: correspondencia funcional con los estados de los ZIP, sin pestañas
vacías, resultado guardado una vez y piloto revisado por identificador.

## Fase 5 Cobertura y entrega

1. Ampliar contenido por sistema y formato; medir esfuerzo real desde el piloto.
2. Mantener inventario privado aprobado/pendiente/no aplicable y revisión clínica
   independiente, con atención a negaciones, unidades, figuras y distractores.
3. Validar sin red, cuenta caducada, IA agotada, conflictos, teclado, lector de
   pantalla, zoom, contraste y rendimiento de carga.
4. Integrar tras activación controlada, CI verde y revisión del diff. Publicar
   sobre el commit comprobado en Workers Builds y verificar la versión servida.
5. Preparar reversión de UI compatible con nuevos estados y reversión editorial
   protegida por versión/CAS. Mantener fuente y progreso originales.

La cobertura visual y la editorial se informan por separado. No se declara todo
el contenido adaptado mientras haya piezas pendientes dentro del alcance.
