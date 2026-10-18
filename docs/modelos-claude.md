# Modelos y consumo de Claude

Reparto económico aprobado por Yoel el 17-oct-2026, vigente desde 1.39.0.
Se acepta probar Haiku en tareas médicas y revisar su calidad durante el uso.
La comprensión del pedido usa razonamiento medio por petición expresa.

| Función | Perfil | Modelo | Razonamiento | Tope de salida¹ | Plazo |
| --- | --- | --- | --- | ---: | ---: |
| Frase del dashboard | `hilo` | Haiku 5.5 | Desactivado, effort low | 500 | 12 s |
| Entender qué estudiar | `entender` | Haiku 5.5 | Adaptativo, medium | 2000 | 20 s |
| Seleccionar candidatos | `revisar` | Haiku 5.5 | Adaptativo, low | 3500 | 40 s |
| Explicaciones y chat | `chat` | Haiku 5.5 | Adaptativo, medium | 3500 | 50 s |
| Generar recuperación activa | `practica` | Haiku 5.5 | Adaptativo, medium | 6000 | 75 s |
| Corregir texto libre | `calificar` | Haiku 5.5 | Adaptativo, medium | 2000 | 10 s |
| Revisión explícita de una explicación | `revisionSonnet` | Sonnet 5.5 | Adaptativo, medium | 3500 | 50 s |

¹ Tokens máximos de razonamiento **y** respuesta juntos, no un objetivo de consumo.
Los topes de JSON dejan espacio para razonar sin cortar la salida. Una respuesta
con `stop_reason: max_tokens` no se muestra como completa ni se guarda en caché.
El esfuerzo orienta cuánto razona el modelo; no fija una cantidad exacta de tokens.

## Dónde cambiarlo

- `src/server/perfiles-claude.ts`: modelo, esfuerzo, pensamiento, tokens y plazo
  de cada función. Las fábricas de `ia-chat.ts` e `ia-sesion.ts` aplican esos perfiles.
- `src/server/claude.ts`: parámetros HTTP y contabilidad de uso de Anthropic.
  Haiku desactiva pensamiento con `disabled`; Sonnet con `between_tools`.
  Los perfiles adaptativos envían `thinking.type: adaptive` y `output_config.effort`.
- `CLAUDE_PRESUPUESTO_USD` en el Worker: tope mensual de la aplicación, actualmente
  90 USD. No se modificó. El límite de facturación de Anthropic se configura aparte
  en su Console. Los límites del chat de claude.ai no son el saldo de esta API.
- Los prompts fijan contenido y formato; no pueden seleccionar un modelo diferente.
  Ningún endpoint público acepta nombres arbitrarios de modelos.

Después de editar un perfil: probar, compilar y desplegar. La clave de caché incluye
modelo, esfuerzo, pensamiento, tokens y plazo; al cambiar el prompt también hay
que subir su versión. Un cambio de calificador exige `EVALUADOR_VERSION` y pruebas
de compatibilidad. El historial conserva su versión y no se recalifica.

## Controles de ahorro

Las respuestas deterministas se corrigen localmente sin IA. Se conserva la caché
de respuestas válidas durante siete días, la deduplicación de peticiones en curso,
el historial acotado, el presupuesto mensual y los techos por función. La reserva
previa cuenta entrada estimada y salida máxima; después se liquida el uso informado.
Un timeout conserva la reserva porque podría haberse facturado. Sólo un fallo
transitorio admite un reintento, con el mismo modelo y parámetros; los errores 400
no reintentan sin controles de razonamiento. No hay escaladas automáticas.

«Revisar con Sonnet» aparece tras una respuesta del tutor. Usa más crédito y sólo
revisa la explicación disponible, con material autorizado del servidor. El historial
puede estar recortado, y el prompt lo indica. No cambia notas, intentos ni dominio.
La siguiente pregunta habitual vuelve a Haiku; reintentar esa revisión conserva
Sonnet. Recuperación activa y calificación no aceptan esta opción.

## Tarifas de referencia y límites de la prueba

La contabilidad interna usa USD por millón de tokens: Haiku 5.5, 0,10 entrada y
0,50 salida hasta 100 000 tokens de entrada; por encima, 0,50 y 2,50. El umbral
incluye entrada normal, lecturas y escrituras de caché. Sonnet 5.5 usa 2 y 10.
Escritura de caché se estima conservadoramente a 2×; lectura a 0,1× para Haiku y
0,05× para Sonnet/Opus 5.5. La factura real corresponde a Anthropic. No se activa
prompt caching nuevo en este cambio.

Fuentes: [precios](https://platform.claude.com/docs/en/about-claude/pricing),
[esfuerzo](https://platform.claude.com/docs/en/build-with-claude/effort),
[Haiku 5.5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-haiku-5-5).

Las pruebas verifican contratos, peticiones, validación y conservación del progreso
con datos sintéticos; no certifican equivalencia clínica entre modelos ni un ahorro
mensual concreto. No se hicieron llamadas facturadas para esta implementación.
