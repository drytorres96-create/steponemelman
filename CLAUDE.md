# Acuerdo de trabajo — StepOneMelman

Instrucciones permanentes para cualquier sesión de Claude Code en este repositorio.
El propietario es Yoel Consuegra Torres, que estudia para el USMLE Step 1 el
**lunes 21 de diciembre de 2026**. La plataforma es su herramienta de estudio
diaria: una publicación rota le cuesta días de preparación, no solo un rollback.

Conversación en español, directa y sin relleno. Si hay un riesgo real, se dice
una vez en una línea y se sigue.

## Quién decide qué

**Fusionar a `main` es trabajo de Claude.** Decidido por Yoel el 12-sep-2026,
cambiando su instrucción anterior. No hay que pedirle permiso para fusionar ni
esperar su visto bueno en cada cambio: si las puertas pasan, se fusiona y se le
informa de que la tarea quedó completa.

Fusionar solo cuando se cumplan las cuatro condiciones:

1. Las tres puertas de publicación pasan en local (abajo).
2. El CI «Verificar aplicación» está en verde sobre el HEAD actual del PR.
3. No hay conflicto con `main` — `mergeable_state: clean`.
4. El cambio es lo que Yoel pidió, sin ampliaciones por cuenta propia.

Si alguna falla, no se fusiona: se arregla o se le dice qué bloquea.

**Yoel decide el producto.** Se le pregunta antes de actuar cuando una tarea
admite dos caminos que cambian *cómo estudia*: el horizonte del examen, los
criterios de dominio, qué cuenta como fallo, cuánto repaso entra en un día,
qué se registra como intento. Adivinar ahí sale más caro que interrumpirle.
Lo técnico —cómo estructurar el código, qué probar, cómo nombrar— no se
consulta.

**Interrupciones.** Solo para avisar de que una tarea se completó, para una
decisión de producto como las de arriba, o para un bloqueo real. Nada de
narrar avances intermedios.

## Puertas de publicación

En este orden, y hay que enseñar la salida real de cada una:

```bash
npm ci
npm test      # deben pasar todas; las 2 omitidas son esperadas
npm run build # sin errores de TypeScript
```

Node 22, dependencias fijadas por el archivo de bloqueo. Las 2 pruebas
omitidas ya existen y son correctas: una necesita `CORPUS_CHECK_DIR`. El aviso
de tamaño de chunk (>500 kB) de Vite es informativo, no un error.

Nunca saltar, desactivar ni poner en cuarentena una prueba para llegar al
verde.

## Flujo por tarea

1. Rama propia desde `main` actualizado, nombre descriptivo.
2. Cambios acotados a lo pedido.
3. Las tres puertas.
4. Empujar y abrir PR en borrador contra `main`, describiendo qué cambió y
   confirmando pruebas y build.
5. Suscribirse a la actividad del PR y llevarlo a verde.
6. Fusionar cuando se cumplan las cuatro condiciones de arriba.
7. Avisar a Yoel: tarea completa, qué cambió, y qué mirar en la aplicación
   para comprobarlo.

Publicar es empujar a `main`: Cloudflare compila y despliega solo. Por eso una
fusión es una publicación en producción, no un paso administrativo.

## Reglas que no se tocan

- **Ni claves `service_role`, ni claves secretas, ni contraseñas** en el
  código. `project.config.json` lleva la clave *publishable*, destinada al
  cliente; el acceso depende de la sesión y de las políticas RLS.
- **Ni PDF, ni fragmentos médicos, ni exportaciones del corpus** en el
  repositorio ni en `public/`. El material privado vive en Supabase.
- **No añadir la regla global `/* /index.html 200` en `_redirects`**: provocó
  un error de bucle al desplegar este Worker. `wrangler.jsonc` ya sirve `dist`
  como aplicación de una sola página mediante `assets.not_found_handling`.
- **No reescribir historia** en una rama que no creó esta sesión.

## Comprobar un despliegue

En Cloudflare, **Workers & Pages → steponemelman → Deployments → Builds**: el
intento más reciente debe corresponder al **commit nuevo**. Reintentar una
compilación antigua recompila el código anterior y el despliegue queda viejo
aunque salga en verde; la columna del commit es la que manda, no el estado.

Después, que el sitio cargue sus recursos y que **Cuenta y ajustes → Ajustes y
respaldo** muestre la versión esperada.

Aviso para sesiones remotas: la política de red del contenedor puede denegar
`workers.dev` con un 403 del proxy al abrir el túnel. Eso es la jaula, no el
sitio. En ese caso la comprobación del navegador la hace Yoel; hay que
pedírsela con la URL concreta y decirle qué debe ver.

## Contexto del código

Aplicación React 18 + Vite 6 + TypeScript. Worker de Cloudflare en
`src/server/worker.ts`. Supabase `jijkzvhpxmxzgfwiqxvc` guarda el material
privado y el progreso.

`docs/` conserva las notas de cambios por versión y el plan de calidad.
`database/README.md` describe el contrato de base de datos: revisiones,
conflictos y generaciones de restablecimiento.

No publicar corpus nuevo sin comprobar antes el conjunto privado de activos:

```bash
CORPUS_CHECK_DIR=/ruta/al/corpus npm test -- src/__tests__/corpus-publicacion.test.ts
```
