# Persistencia privada

`schema.sql` es el esquema declarativo inicial. Se ejecuta una vez en el proyecto Supabase vacío. No contiene corpus, progreso, usuarios reales ni claves secretas. No se creó un nombre de migración manualmente: cuando se use la CLI, generar el historial con sus comandos de migración.

Las tablas tienen RLS y permisos explícitos. `app_members` permite a cada usuario consultar su propia membresía. Sólo administración concede membresías y carga `corpus_assets`. Los miembros pueden leer el corpus y acceder únicamente a su fila de `study_state`. El cliente no puede eliminar filas; restablecer el progreso cambia la generación.

La aplicación debe escribir mediante `sync_study_state` y `reset_study_state`. Ambas funciones son `SECURITY INVOKER`, derivan el usuario de `auth.uid()` y no aceptan identificadores ajenos. Las concesiones `INSERT`/`UPDATE` son necesarias para que una función invoker pueda escribir. Un usuario que escriba directamente su propia fila puede alterar su propio estado y saltarse el protocolo de revisiones; RLS sigue aislando todos los demás usuarios.

## Contrato de sincronización

`sync_study_state(p_state jsonb, p_expected_revision bigint, p_generation uuid)` y `reset_study_state(p_expected_revision bigint, p_generation uuid, p_state jsonb)` devuelven:

```ts
type SyncReply = {
  ok: boolean
  kind: 'saved' | 'conflict' | 'reset' | 'missing'
  row: null | {
    user_id: string
    state: EstadoApp
    revision: number
    generation: string
    updated_at: string
  }
}
```

| Respuesta | Acción del cliente |
|---|---|
| `saved` | Guardar fila, revisión y generación recibidas. Conservar aparte los cambios locales posteriores al envío. |
| `conflict` | Fusionar historial local y remoto; reintentar con revisión y generación recibidas. |
| `reset` | La generación cambió: adoptar el estado remoto y descartar el historial local anterior. Nunca fusionarlo automáticamente. |
| `missing` | Una fila previamente conocida desapareció administrativamente: detener la subida y mostrar la incidencia. No recrearla con historial viejo. |

El primer guardado usa revisión `0` y generación `null`. Una fila existente siempre responde `conflict` a ese bootstrap; el cliente debe leerla antes de guardar. Una generación no nula distinta de la actual produce `reset`, aunque la revisión también difiera. El restablecimiento exige revisión y generación vigentes y crea una nueva generación aleatoria. No se debe reintentar automáticamente un restablecimiento en conflicto: podría borrar trabajo nuevo en otro dispositivo.

Guardar `state`, `revision` y `generation` juntos, bajo una clave local específica del UUID autenticado. El reinicio debe hacerse conectado; no poner un borrado pendiente en una cola offline. Las RPC bloquean por usuario dentro de la transacción y bloquean su fila. La primera inserción se protege también mediante la clave primaria y `ON CONFLICT`. El protocolo está diseñado para el aislamiento `READ COMMITTED` usado normalmente por PostgREST; si se cambia el aislamiento y se reciben errores de serialización, reintentar toda la lectura y escritura.

La base valida la estructura superior de `EstadoApp`, versión `1`, tamaño máximo de 16 MiB y revisiones dentro del rango entero seguro de JavaScript. El cliente valida el contenido profundo antes de leer o importar progreso. La cuenta del Dashboard de Supabase y las cuentas Auth de esta aplicación son identidades distintas: entrar al Dashboard no inscribe automáticamente un usuario en `app_members`.

## Verificación

`verify.sql` prueba membresía, aislamiento entre usuarios, acceso anónimo, permisos, conflictos de revisión, cambio de generación, forma y tamaño del estado. Crea fixtures dentro de una transacción que termina con `ROLLBACK`; no envía mensajes. Un fallo detiene la transacción y debe acompañarse de `ROLLBACK`. El archivo incluye al final el procedimiento de dos sesiones para verificar concurrencia real; los conflictos secuenciales por sí solos no prueban carreras simultáneas.

Documentación consultada:

- [RLS de Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Funciones de base de datos](https://supabase.com/docs/guides/database/functions)
- [Cambio de permisos de exposición de tablas, abril de 2026](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)
