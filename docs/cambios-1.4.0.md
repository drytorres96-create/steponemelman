# Versión 1.4.0 — estudio por tiempo, aplicación y ayuda breve

Código 1.4.0; corpus privado 1.0.5. Fecha: 11 de septiembre de 2026.

## Ayuda de IA opcional

Después de una respuesta que necesita revisión, «Explícame esta respuesta con IA» solicita una explicación breve del concepto y del error. Cloudflare Workers AI ejecuta el modelo; la clave de OpenAI no se utiliza. La respuesta incluye un fragmento literal validado del material. La IA puede equivocarse: no modifica notas, dominio, planificación ni contenido publicado.

El servidor verifica la sesión y membresía con Supabase en cada consulta y reconstruye la pregunta desde el corpus autorizado. No acepta referencias médicas suministradas por el navegador. Las entradas con aclaración editorial remiten a sus referencias verificadas en lugar de generar sobre una fuente discrepante.

Se limita a 20 respuestas nuevas por usuario y 30 globales al día UTC. La caché dura siete días; las consultas iguales no consumen otra generación. Las reservas se contabilizan antes de llamar al modelo, incluidas las llamadas fallidas, sin reintentos ni proveedor de pago alternativo. El límite gratuito de Cloudflare puede agotarse antes si la cuenta comparte uso con otras aplicaciones. La aplicación de estudio sigue disponible.

La configuración presupone Workers Free, confirmado por el propietario. Si se cambia de plan, hay que revisar los límites: estas cuotas de aplicación no equivalen a un límite monetario del proveedor. Referencias: [Workers AI](https://developers.cloudflare.com/workers-ai/platform/pricing/), [Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing/).

## Sesiones de 10, 20 o 30 minutos

Inicio permite elegir tiempo o cantidad de conceptos. El presupuesto estima la carga con la mediana de sesiones completas recientes, usando dos minutos por concepto mientras no hay suficientes muestras.

El tiempo incluye enseñanza, preguntas, explicación y consulta de fuentes mientras la pestaña está visible. Una pestaña visible sin actividad sigue contando. Al ocultarla o pausar, el reloj se detiene. Al alcanzar el presupuesto se termina la pregunta actual y luego se elige pausar o continuar sin límite. Los errores se añaden a la cola antes de ofrecer la pausa.

La reanudación conserva cola, variantes, ayudas, errores y tiempo. Entre dispositivos se conserva el mayor tiempo conocido, sin sumar dos copias de una misma sesión. Trabajar simultáneamente en dos ventanas no suma sus tiempos; si cambia la cola activa, la ventana anterior invita a reabrir el punto más reciente.

## Piloto de aplicación

30 conceptos: 15 de fisiología cardiovascular y 15 de farmacología endocrina. Cada concepto añade dos variantes: discriminación y aplicación en un caso nuevo. Se mantienen los identificadores, fuentes originales e historial de los conceptos.

Los casos se habilitan tras trabajar el concepto base y se priorizan los todavía no vistos. La aplicación se mide por el primer intento de cada variante nueva, sin ayuda. Acertar un reintento no acredita una nueva aplicación. Esta medida se muestra separada del dominio vigente y no predice resultados NBME.

Se corrigieron dos redacciones: los determinantes del taponamiento y la distinción entre betabloqueo y conversión T4→T3 del propranolol. «Ver la fuente» muestra la aclaración y referencias. Las variantes también muestran sus referencias. La revisión fue asistida por IA con comprobación documental; no se presenta como validación humana de todo el corpus.

## Mapa y próximos pasos

Progreso incluye una matriz sistema × disciplina con etiquetas primarias y secundarias. Cada casilla abre una selección concreta de conceptos nuevos, vencidos, errores recientes, dominio o aplicación. Las cantidades de casillas se solapan y no deben sumarse.

Tres próximos pasos semanales priorizan errores y repasos y después material nuevo. Explican el motivo y permiten empezar la sesión. «Sin material» significa falta de contenido publicado, no falta de conocimientos.

## Cobertura y verificación

El corpus conserva 2.079 conceptos aprobados, 191 apartados y 34 módulos; el procesamiento sigue en 21 de 50 lotes. Esta entrega añade variantes, no completa los PDF pendientes.

Se comprueban aislamiento de acceso, cuotas concurrentes, citas literales, reanudación bajo StrictMode, pausas con errores, importación y combinación de estados, selección de variantes y correspondencia del mapa. La validación privada compara todos los activos con el índice. La compilación de producción y el empaquetado de Wrangler se verifican antes de publicar. Las pruebas usan datos sintéticos y no alteran cuentas ni progreso real. La generación real dentro de una sesión autenticada requiere una comprobación del usuario; la publicación del Worker por sí sola no la demuestra.
