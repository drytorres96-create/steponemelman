# Volver atrás una publicación

Qué hacer si una versión publicada rompe el estudio. Publicar es fusionar a `main`:
Cloudflare compila y despliega solo, así que una fusión mala llega a producción en
minutos. Volver atrás tarda uno.

## 1. Volver a la versión anterior (un minuto)

En Cloudflare:

1. **Workers & Pages → steponemelman → Deployments**.
2. En la versión anterior a la rota, el menú de los tres puntos → **Rollback**.

La versión elegida pasa a atender todo el tráfico en el acto. Cloudflare guarda las 100
versiones más recientes.

Comprobación: recargar el sitio y mirar en **Cuenta y ajustes → Ajustes y respaldo** que
la versión sea la esperada.

## 2. Dejar `main` igual que producción

El rollback no toca GitHub: la próxima fusión a `main` vuelve a desplegar lo que haya en
`main`. Antes de seguir, una de dos:

- **Revertir** la fusión rota con un PR (`git revert -m 1 <commit de la fusión>`), con
  las tres puertas y el CI en verde como cualquier cambio.
- **Arreglar hacia delante** con un PR que corrija el fallo.

## El progreso no corre peligro

- El progreso vive en Supabase (`study_state`, `nbme_state`) y en cada navegador. Ninguna
  versión de la aplicación lo guarda en el Worker, así que volver atrás no lo toca.
- **No volver a una versión anterior a un cambio de `CORPUS_VERSION` ni de
  `database/*.sql`.** Una versión no puede leer un progreso escrito con un
  `CORPUS_VERSION` más nuevo, ni usar tablas que aún no existían.
  - `CORPUS_VERSION` sigue en 1.0.5 desde la primera versión.
  - El último cambio de `database/*.sql` fue el 11 de septiembre (el banco NBME):
    cualquier versión posterior sirve.
- Desde 1.24.0, si una copia local no se puede leer, la aplicación la aparta sin borrarla
  y recupera el progreso de la cuenta, en vez de quedarse bloqueada.

## Publicar sólo con las pruebas en verde

Hoy Cloudflare despliega todo lo que llega a `main`, pase o no el CI. Dos ajustes lo
cierran. Son de la cuenta de Yoel: el código no puede activarlos.

- **GitHub** — que no se pueda fusionar con el CI en rojo. En **Settings → Branches →
  Add branch protection rule** para `main`: *Require status checks to pass before
  merging* y marcar **verificar** y **navegador**.
- **Cloudflare** — que la compilación de producción corra las pruebas antes de desplegar.
  En **Workers & Pages → steponemelman → Settings → Build → Build command**:
  `npm test && npm run build`. Si una prueba falla, la compilación falla y la versión
  anterior sigue publicada. Añade menos de un minuto a cada despliegue.

Workers Builds no lee el paso `build` de `wrangler.jsonc`, así que tiene que ser en el
panel.
