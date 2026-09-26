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
- Todas las versiones publicadas leen el mismo formato de progreso (`CORPUS_VERSION`
  1.0.5). Una versión no puede leer un progreso escrito con un `CORPUS_VERSION` más
  nuevo: **no volver a una versión anterior a un cambio de `CORPUS_VERSION` ni de
  `database/*.sql`**. Hasta hoy no ha habido ninguno.
- Desde 1.24.0, si una copia local no se puede leer, la aplicación la aparta sin borrarla
  y recupera el progreso de la cuenta, en vez de quedarse bloqueada.

## Protección recomendada en GitHub

Que GitHub exija el CI antes de fusionar. En **Settings → Branches → Add branch
protection rule** para `main`: *Require status checks to pass before merging* y marcar
**verificar**. Es un ajuste de la cuenta de Yoel; el código no puede activarlo.
