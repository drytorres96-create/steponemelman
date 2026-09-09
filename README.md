# StepOneMelman

Plataforma de estudio para USMLE Step 1 con sesiones, repaso espaciado y progreso asociado a una cuenta. Este repositorio contiene la aplicación React/Vite y su esquema de base de datos. Supabase guarda el corpus privado y el progreso; Cloudflare Pages puede alojar la aplicación.

El proyecto Supabase `steponemelman` ya tiene las tablas, políticas de acceso y funciones de sincronización configuradas. El despliegue en Cloudflare requiere completar los pasos siguientes; este documento no acredita una publicación en producción.

## Publicar en tu cuenta de Cloudflare

1. Abre [Cloudflare](https://dash.cloudflare.com/), entra en **Workers & Pages** y selecciona **Create application → Pages → Import from an existing Git repository**.
2. Conecta GitHub y permite el acceso al repositorio **drytorres96-create/steponemelman**. Selecciónalo para crear el proyecto Pages.
3. Configura estos valores:

| Opción | Valor |
|---|---|
| Rama de producción | `main` |
| Directorio raíz | Raíz del repositorio; dejar vacío |
| Comando de compilación | `npm run build` |
| Directorio de salida | `dist` |
| Variable de compilación | `NODE_VERSION` = `22` |

4. Pulsa **Save and Deploy**. Cuando termine correctamente, copia la dirección real que muestra Cloudflare, normalmente bajo `pages.dev`.
5. Configura esa dirección en Supabase como se indica a continuación. Los futuros cambios publicados en `main` activarán nuevas compilaciones de Pages. [Guía oficial de Vite en Pages](https://developers.cloudflare.com/pages/framework-guides/deploy-a-vite3-project/) y [configuración de Node](https://developers.cloudflare.com/pages/configuration/build-image/).

## Configurar los enlaces de acceso

Después de obtener la URL real de Cloudflare, abre el [proyecto Supabase](https://supabase.com/dashboard/project/jijkzvhpxmxzgfwiqxvc), entra en **Authentication → URL Configuration** y sustituye `TU-PROYECTO` por el dominio publicado:

| Campo | Valor de ejemplo |
|---|---|
| Site URL | `https://TU-PROYECTO.pages.dev` |
| Redirect URLs | `https://TU-PROYECTO.pages.dev/` |
| Redirect URLs, entrada adicional | `https://TU-PROYECTO.pages.dev/**` |

La regla `/**` admite rutas del mismo sitio; no autorices todos los dominios `pages.dev`. Si cambias a un dominio propio, actualiza estas entradas. La confirmación de correo y la recuperación de contraseña dependen de esta configuración. Para desarrollo local puedes añadir `http://localhost:5173/**` y, si utilizas la vista previa compilada, `http://localhost:4173/**`. [Documentación de redirecciones de Supabase](https://supabase.com/docs/guides/auth/redirect-urls).

## Crear y habilitar tu cuenta de estudio

Abre la aplicación publicada, selecciona **Crear cuenta**, usa tu correo y una contraseña propia, y confirma el correo recibido. La cuenta de estudio es independiente de la cuenta del Dashboard de Supabase.

El material está limitado a miembros autorizados. Una cuenta recién creada permanece en la pantalla de acceso pendiente hasta que el propietario la habilita. En el SQL Editor del proyecto, sustituye el correo del ejemplo y verifica primero la identidad:

```sql
select id, email, email_confirmed_at
from auth.users
where lower(email) = lower('tu-correo@example.com');
```

Después, habilita esa cuenta confirmada:

```sql
insert into public.app_members (user_id)
select id
from auth.users
where lower(email) = lower('tu-correo@example.com')
  and email_confirmed_at is not null
on conflict (user_id) do nothing
returning user_id;
```

Vuelve a la aplicación y comprueba el acceso. No hacen falta contraseñas ni claves de administración dentro del código. Los usuarios no pueden concederse membresía desde el navegador.

## Continuar desde otro dispositivo

Entra con la misma cuenta de estudio en cada dispositivo. Antes de cerrar la sesión o cambiar de equipo, espera a que aparezca **Progreso sincronizado**. Si aparece **Cambios en este dispositivo; falta sincronizar**, recupera la conexión y sincroniza antes de continuar en otro dispositivo.

Para trasladar el progreso de la plataforma anterior, abre allí **Ajustes → Exportar progreso**. En esta versión, entra en **Ajustes → Importar progreso**, selecciona el archivo JSON y espera la confirmación de sincronización. La migración entre ambas plataformas requiere esta importación; sus cuentas y bases de datos son distintas. Conserva una exportación como copia adicional.

Si se pierde internet con la aplicación abierta, puedes seguir usando el material que ya esté cargado y conservar cambios locales hasta reconectar. Esta versión no garantiza abrirse de nuevo sin internet ni descargar todo el corpus para estudiar sin conexión. Restablecer todo el progreso requiere conexión y afecta a la cuenta en todos sus dispositivos.

## Desarrollo y pruebas

Usa Node.js 22 y el archivo de dependencias incluido:

```bash
npm ci
npm run dev
```

Para compilar, ejecutar las pruebas de autenticación y sincronización, y revisar la compilación:

```bash
npm run build
npm run test:nube
npm run preview
```

`project.config.json` contiene la URL de Supabase y una clave **publishable**, destinada a aplicaciones públicas. Esa clave identifica el proyecto; el acceso a los datos depende de la sesión del usuario y de las políticas RLS. No añadas claves `service_role`, claves secretas ni contraseñas de base de datos a ese archivo o al repositorio.

El [contrato de base de datos](database/README.md) describe revisiones, conflictos y generaciones de restablecimiento. `database/schema.sql` permite reconstruir el esquema en un proyecto vacío; no debe volver a ejecutarse sobre las tablas ya instaladas. `database/verify.sql` comprueba permisos y aislamiento con datos temporales y termina con `ROLLBACK`.

## Corpus en preparación

El corpus continúa en transformación y revisión. La aplicación ofrece el contenido que ya ha sido integrado; no implica que todos los documentos originales estén terminados. Los archivos PDF, las exportaciones del corpus y el progreso personal quedan fuera de GitHub. No los agregues a `public/` ni los publiques como archivos estáticos de Cloudflare: la aplicación obtiene el material desde Supabase después de verificar la membresía.
