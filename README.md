# StepOneMelman

Plataforma de estudio para USMLE Step 1 con sesiones, repaso espaciado y progreso asociado a una cuenta. El sitio existente está en [steponemelman.yoeltorres.workers.dev](https://steponemelman.yoeltorres.workers.dev/). Este repositorio contiene la aplicación React/Vite y el contrato de base de datos; Supabase conserva el material privado y el progreso.

La versión de código **1.1.0** incorpora las mejoras descritas en [Cambios de la versión](docs/cambios-1.1.0.md). La presencia de esos cambios en el repositorio no acredita por sí sola que Cloudflare haya terminado de publicarlos: comprueba la compilación correspondiente y la versión mostrada en **Ajustes**.

## Estudiar y continuar en otro dispositivo

Entra en el sitio con tu cuenta de estudio. El inicio propone una sesión de hasta 5, 10 o 20 conceptos: primero repasos vencidos, después errores recientes pendientes y finalmente material nuevo. También puedes elegir un módulo, repasar o realizar práctica sin ayuda sobre preguntas ya estudiadas.

Cada respuesta se registra al enviarla. La autoevaluación posterior ajusta ese mismo intento. Puedes pausar y retomar la sesión; los errores no alargan la cola inicial. Las respuestas libres que el corrector no puede resolver quedan **por revisar**, sin contarse automáticamente como aciertos o fallos.

Inicia sesión con la misma cuenta en cada dispositivo y espera **Progreso sincronizado** antes de cambiar de equipo. Si aparece **Cambios en este dispositivo; falta sincronizar**, recupera la conexión y sincroniza. El material ya cargado y los cambios locales pueden seguir utilizándose con la aplicación abierta sin conexión, pero esta versión no garantiza abrirse de nuevo sin internet ni descargar todo el corpus.

**Ajustes → Exportar progreso** permite conservar una copia. Importar un JSON anterior es opcional para quien ya tenga progreso en otra versión; no es un paso necesario para empezar. Restablecer el progreso requiere conexión y afecta a la misma cuenta en todos sus dispositivos.

## Despliegue activo: Cloudflare Workers

El Worker **steponemelman** ya está conectado a este repositorio. Los cambios publicados en `main` activan su compilación y despliegue. No se requiere crear un proyecto Pages.

| Opción | Valor |
| --- | --- |
| Rama de producción | `main` |
| Directorio raíz | `/` |
| Comando de compilación | `npm run build` |
| Comando de publicación | `npx wrangler deploy` |
| Versión de Node | `22` |
| Archivos publicados | `dist`, según `wrangler.jsonc` |
| Sitio | [steponemelman.yoeltorres.workers.dev](https://steponemelman.yoeltorres.workers.dev/) |

Para comprobar una actualización, abre el Worker en Cloudflare y consulta el intento más reciente en **Deployments → Builds**. Verifica que corresponda al commit nuevo: reintentar una compilación antigua puede volver a utilizar el código anterior. Un despliegue se considera comprobado cuando termina correctamente, el sitio carga sus recursos y **Ajustes** muestra la versión esperada.

`wrangler.jsonc` sirve `dist` como aplicación de una sola página mediante `assets.not_found_handling`. No añadas la regla global `/* /index.html 200` en `_redirects`: provocó un error de bucle al desplegar este Worker. La configuración sigue la [documentación oficial de Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/). No hay una API propia en el Worker ni hacen falta claves de administración de Supabase para publicar el frontend.

## Autenticación y acceso

La configuración de enlaces y la primera cuenta de estudio ya están habilitadas en el proyecto Supabase **steponemelman**. Estos valores documentan la configuración existente y solo necesitan cambiarse si cambia el dominio:

| Campo de Authentication → URL Configuration | Valor |
| --- | --- |
| Site URL | `https://steponemelman.yoeltorres.workers.dev` |
| Redirect URLs | `https://steponemelman.yoeltorres.workers.dev/**` |

La confirmación de correo y la recuperación de contraseña dependen de estos enlaces. La regla `/**` permite rutas del mismo sitio; no autorices todos los dominios `workers.dev`. Para desarrollo local pueden añadirse los dominios de Vite que realmente se utilicen. [Redirecciones de Supabase](https://supabase.com/docs/guides/auth/redirect-urls).

Crear una cuenta en la aplicación no concede acceso automático al material. Las cuentas nuevas permanecen pendientes hasta que el propietario habilita una membresía. Para autorizar otra cuenta desde el SQL Editor, primero verifica el correo y su confirmación:

```sql
select id, email, email_confirmed_at
from auth.users
where lower(email) = lower('tu-correo@example.com');
```

Después, para esa cuenta confirmada:

```sql
insert into public.app_members (user_id)
select id
from auth.users
where lower(email) = lower('tu-correo@example.com')
  and email_confirmed_at is not null
on conflict (user_id) do nothing
returning user_id;
```

La cuenta de estudio es independiente del inicio de sesión en el panel de Supabase. El navegador no puede concederse membresía.

## Desarrollo y comprobaciones

Usa Node.js 22 y las dependencias fijadas en el archivo de bloqueo:

```bash
npm ci
npm run dev
```

Las comprobaciones de publicación son:

```bash
npm test
npm run build
npm run preview
```

`npm run test:nube` ejecuta el subconjunto de autenticación y sincronización. Las pruebas de integración utilizan datos sintéticos y servicios simulados; no sustituyen una prueba con la cuenta real en dos dispositivos.

`project.config.json` contiene la URL de Supabase y su clave **publishable**, destinada al cliente. El acceso al material depende de la sesión y de las políticas RLS. No añadas claves `service_role`, claves secretas ni contraseñas de base de datos al código.

El [contrato de base de datos](database/README.md) describe revisiones, conflictos y generaciones de restablecimiento. `database/schema.sql` permite reconstruir el esquema en un proyecto vacío; no debe ejecutarse de nuevo sobre las tablas instaladas. `database/verify.sql` comprueba permisos y aislamiento con datos temporales y termina con `ROLLBACK`.

## Contenido y alcance

La revisión de esta etapa deja **1.937 conceptos publicados**, **83 apartados para revisión**, **18 de 50 lotes transformados** y **32 pendientes**. Se apartaron nueve conceptos adicionales; esto no equivale a una revisión clínica completa del corpus. El [plan de calidad](docs/plan-calidad-2026-09-10.md) distingue organización implementada de cobertura oficial, filtrado médico, imágenes, variantes e inglés pendientes.

Las métricas de dominio describen la evidencia registrada dentro de la plataforma. No estiman la probabilidad de aprobar Step 1, y la práctica sin ayuda no es una evaluación NBME. La revisión clínica humana sigue pendiente.

Los PDF, fragmentos médicos, exportaciones del corpus y progreso personal quedan fuera del repositorio público. No los añadas a `public/` ni a los archivos estáticos de Cloudflare: la aplicación obtiene el material desde Supabase tras verificar la membresía.
