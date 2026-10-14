# Reversión sin pérdida de datos

1. Desactivar la entrada My Q Bank (`VITE_MYQBANK_ENABLED` y el enlace de acceso),
   conservando los lectores nuevos de `study_state` y `nbme_state`. Si hace falta
   retirar completamente la entrada por URL, cambiar `myqbankEnabled()` manteniendo
   los serializadores y las exportaciones.
2. No volver directamente al binario anterior a estas fases: su lector NBME tenía
   un límite de 20 y no conoce los nuevos bloques. Primero preparar un hotfix con
   los lectores compatibles. El flujo anterior identifica un bloque nuevo y dirige
   a My Q Bank; no lo convierte en una sesión antigua ni revela un Test abierto.
3. Exportar por cuenta desde Settings antes de migraciones futuras. El respaldo
   incluye progreso NBME/Mehlman y anotaciones identificadas por propietario.
   La restauración de anotaciones rechaza otra cuenta y respeta las lápidas.
4. Conservar `myqbank_annotations`, el RPC y sus políticas. No ejecutar DROP ni
   borrar lápidas o revisiones. La aplicación anterior simplemente no los usa.
5. Los borradores privados del piloto no son leídos por producción. Se pueden
   conservar como evidencia; no hay originales que revertir. Cuando se publique
   una adaptación aprobada, registrar versión/hash anterior y revertir esa ruta
   concreta mediante CAS, sin tocar preguntas ni calificaciones.
6. Verificar con los fixtures de ambas generaciones, bloques de 80, borradores,
   subrayado y Test abierto antes de desplegar cualquier hotfix de reversión.

Cloudflare conserva el Worker, bindings `AI`/`COACH`, rutas y presupuesto gratuito.
No se ha cambiado la configuración de despliegue ni creado otra aplicación. El
push a `main` dispara su build; la rama de revisión no demuestra un despliegue.
