# Dataset — Compactación de conversaciones (Mark)

Este zip contiene **14 conversaciones reales scrubbed** entre usuarios y **Mark** (el agente de marketing de HeyMark) más una suite de **bad summaries** etiquetados por failure mode. El objetivo del ejercicio es construir un compactador que reduzca cada conversación a una representación compacta sin perder contexto crítico para que Mark pueda continuar la sesión sin alucinar.

---

## 1. Qué hay en el zip

| Archivo | Líneas | Tamaño aprox | Propósito |
|---|---|---|---|
| `conversations.jsonl` | 14 | ~2.2 MB | Conversaciones reales scrubbed, una por línea |
| `bad_summaries.jsonl` | 17 | ~9 KB | Ejemplos curados de summaries que exhiben los 7 failure modes documentados |
| `schema.md` | — | — | Este documento |

> Las 14 conversaciones cubren 7 perfiles distintos (2 cada uno): `short-direct`, `onboarding`, `video-heavy`, `carousel-iteration`, `analytics-deep`, `mixed-tools`, `long-tail`. La elección apuesta por **calidad sobre cantidad**: cada conversación es un caso evaluativo distinto del set, no una muestra repetida del mismo patrón.

---

## 2. `conversations.jsonl` — formato

Cada línea es un JSON object con los siguientes campos top-level:

```ts
{
  id: string,                  // ej. "carousel-iteration-01"
  profile: ProfileName,        // uno de los 7 perfiles
  system_prompt: string,       // ~5K tokens — versión condensada del prompt real de Mark
  messages: ModelMessage[],    // historial completo, formato AI SDK v6
  anchors: {
    critical_facts: string[],  // 6-8 hechos que un summary aceptable debe preservar
    asset_ids: string[],       // IDs de assets generados (videos, creatives)
  },
  context_summary: string,     // referencia ground-truth — qué importa retener
}
```

`ProfileName` es uno de:

```
"short-direct" | "onboarding" | "video-heavy" | "carousel-iteration"
| "analytics-deep" | "mixed-tools" | "long-tail"
```

### Volumen del dataset

| Profile | Convs | Total turns (sum) | Total tokens (sum) |
|---|---|---|---|
| short-direct | 2 | 24 | ~3,500 |
| onboarding | 2 | 40 | ~43,000 |
| video-heavy | 2 | 82 | ~40,000 |
| carousel-iteration | 2 | 76 | ~170,000 |
| analytics-deep | 2 | 71 | ~79,000 |
| mixed-tools | 2 | 96 | ~79,000 |
| long-tail | 2 | 152 | ~129,000 |
| **Total** | **14** | **541** | **~544,000** |

> Algunos perfiles (carousel-iteration-02, long-tail) llegan a 100+ turnos y 75K+ tokens — buen estrés-test para el compactador.

---

## 3. Shape AI SDK v6 de `messages`

Los mensajes siguen el formato de **Vercel AI SDK v6 ModelMessage**.

### User message — content es string plano

```json
{
  "role": "user",
  "content": "Hola Mark! Quiero generar un Reel para mi estudio."
}
```

### Assistant message — content es array de parts

Cada part tiene un `type` discriminador:

#### Text part

```json
{ "type": "text", "text": "Perfecto, déjame analizar tu cuenta primero." }
```

#### Tool part — `type: "tool-{name}"`

Los tool calls van **inline en el content del assistant message** (no como mensaje separado):

```json
{
  "type": "tool-query_posts",
  "toolCallId": "toolu_014u5yRvR878ehDBzcpwoy1r",
  "state": "output-available",
  "input": { "query": "SELECT brand_id FROM canvases WHERE id = 'cnv_v1v2c3s4'" },
  "output": {
    "data": [{ "brand_id": "brd_v1v2b3s4" }],
    "success": true,
    "rowCount": 1
  }
}
```

**Tool placeholders** — para outputs muy largos (resultados de `web_search`, dumps de `analyze_competitor`), el dataset usa placeholders representativos. Si encuentras esto en algún `output`:

```json
{ "_placeholder": true, "toolName": "web_search", "reason": "output truncated for dataset size" }
```

trátalo como output válido pero opaco — el agente original lo procesó completo en su momento.

---

## 4. `system_prompt` embebido

Cada conversación trae **su propio system prompt** completo (~5K tokens). Es una versión condensada del prompt real de Mark en producción, e incluye:

- **Identidad y rol** de Mark (~600 tokens).
- **Compact summaries** de los skills disponibles (~2.5K tokens). Mark tiene ~12 skills (analisis, brand-kit, creative, generation, etc.) — cada compact summary es 5-8 líneas con reglas críticas.
- **Catálogo de los 10 tools representativos** (~600 tokens). Tabla compacta `{name, purpose, output_shape, typical_tokens}`.
- **Memory blocks del usuario ficticio** (~500 tokens): `profile`, `strategy`, `learnings` poblados con la información del cliente fake correspondiente a esa conversación.
- **Canvas state** (~200 tokens): widgets activos, doc activo.

El system prompt **debe contar como input al compactador**: forma parte del contexto que el agente tendría al retomar la sesión. Si lo descartas, estás compactando algo distinto al problema real.

---

## 5. `anchors` y `context_summary`

Ambos campos son **ground-truth para auto-evaluación opcional** del candidato. NO son inputs del compactador — son referencias para validar que el output preserva lo que importa.

### `anchors.critical_facts`

Lista de 6-8 strings que describen los hechos no-negociables de la sesión: identidad del cliente, decisiones tomadas, IDs activos, números acordados, próximos pasos. Un summary aceptable los preserva **literal o semánticamente**. Ejemplo:

```json
"critical_facts": [
  "Cliente: Joaquín Faverio / Atelier Fava — estudio de arquitectura boutique en Buenos Aires.",
  "Plan de Reel: 3 escenas cinematográficas (HOOK + DEV + CTA) en formato 9:16. Modelo: Veo 3.1.",
  "CTA final: 'Cada proyecto empieza con una conversación' — sin ofertas comerciales.",
  ...
]
```

### `anchors.asset_ids`

IDs de assets generados durante la conversación (creativeIds, videoIds, scriptIds). Deben aparecer **literalmente** en el summary (o en `preserved_messages`) si el agente debe poder retomar el trabajo sobre ellos. Ejemplo:

```json
"asset_ids": ["uuid_102438b6", "uuid_f0916681", "uuid_ffdf5923", "4ae19807"]
```

### `context_summary`

Narrativa ground-truth en 2-3 párrafos describiendo qué importa retener para la próxima sesión. Sirve como referencia humana — comparar el output del compactador contra este texto da una intuición rápida de qué tan bien está funcionando. Ejemplo:

> "Sesión de onboarding completo de Diego Almeida (Nodalex Studio, CDMX), abogado corporativo arrancando su cuenta @nodalex.studio (23 seguidores, 7 posts) con foco en derecho + tecnología (IA, ciberseguridad, contratos digitales). [...] Para el compactador: el corazón del perfil onboarding es retener industria, los 4 pilares, el script uuid_c97eb263 y el ángulo del trending topic — todos anchors que aparecen distribuidos en los primeros 16 turnos y que un naive truncation por tail perdería."

---

## 6. Output esperado del compactador

El output esperado sigue el shape de la **[Anthropic Compaction API](https://docs.anthropic.com/en/docs/build-with-claude/context-management)**:

```ts
{
  summary: string,                  // texto narrativo + estructurado
  preserved_messages: ModelMessage[] // últimos N mensajes preservados literales
}
```

**Pueden apartarse de este shape si lo justifican** — si la propuesta es que el output sea solo `summary` (sin preserved messages) o que el summary sea un structured object, está bien siempre que la decisión esté argumentada y la implementación la respete consistentemente.

---

## 7. Failure modes — `bad_summaries.jsonl`

`bad_summaries.jsonl` documenta **17 ejemplos curados** de summaries malos, distribuidos en 7 failure modes. Cada línea:

```ts
{
  id: string,                  // bad_001 .. bad_017
  conversation_id: string,     // ID de una conversación de conversations.jsonl
  failure_mode: FailureMode,   // uno de los 7
  bad_summary: string,         // el output malo (artesanal)
  why_bad: string              // explicación del patrón a evitar
}
```

### Los 7 failure modes

| Mode | Patrón | Origen típico |
|---|---|---|
| `self-refusal` | El modelo clasifica la instrucción de compactar como prompt injection y se niega. | Modelos sobre-cautos con tags `<system>`, IDs, o lenguaje confidencial en el input. |
| `agent-reply-leakage` | El summary suena como una respuesta del asistente al usuario (segunda persona, preguntas abiertas). | Falta de role separation entre el agente compactando y la conversación a resumir. |
| `gap-acknowledgment` | El summary admite "no tengo info suficiente" cuando la conversación sí la tenía. | Modelos defensivos que prefieren abdicar a extraer. |
| `trivial` | Summary genérico tipo "el usuario y Mark hablaron de marketing". Anchor recall ~0%. | Prompt débil sin instrucciones de qué preservar. |
| `anchor-loss` | Summary plausible y bien escrito pero omite los `critical_facts` (IDs, nombres, números). | Modelo prioriza fluidez narrativa sobre fidelidad factual. |
| `hallucination` | Summary inserta IDs, decisiones, o métricas que NUNCA ocurrieron en la conversación. | Mezcla peligrosa: suena plausible porque entremezcla verdad e invención. |
| `recursive-degradation` | Summary del summary — pérdida progresiva de detalle al compactar el output del compactador. | Crítico para sistemas de memoria que iteran sobre summaries. |

> Recomendado usar estos 17 como **suite de tests negativos**: tu compactador no debería producir ningún output que matchee estos patrones. Detectar y rechazar es tan importante como generar bien.

---

## 8. Catálogo de los 10 tools representativos

El dataset contiene tool calls de **10 tools representativos** (Mark en producción tiene ~169). Estos 10 cubren la diversidad de patrones de output que importan al compactar:

| Tool | Categoría | Output shape | Tokens típicos |
|---|---|---|---|
| `web_search` | search | `{ results: [{title, url, highlights, publishedDate}] }` | 6,000-8,000 |
| `query_posts` | query | `[{post_id, platform, caption, like_count, ...}]` | 200-8,000 |
| `analyze_post` | vision | `{ post_id, tags, transcript, ai_description, ocr_text }` | 800-1,500 |
| `search_memory` | memory | `{ facts: [{date, text}] }` | 200-500 |
| `present_creatives` | generation | `{ creativeId, slides: [{slot_id, content}], previewUrl }` | 1,000-2,000 |
| `generate_video` | generation | `{ videoId, url, status, duration_seconds, recipe_used }` | 300-500 |
| `get_performance_comparison` | analytics | `{ kpis: {er, reach, ...}, deltas: {er_delta_pct, ...} }` | 1,000-2,000 |
| `analyze_competitor` | competitor | `{ handle, followers, engagement_rate, top_posts: [...] }` | 2,000-4,000 |
| `schedule_publication` | action | `{ ok: true, publication_id, scheduled_for }` | ~50 |
| `update_creative` | action | `{ ok: true, creative_id, updated_at }` | ~50 |

> **Tool aliases**: en algunas conversaciones aparecen `execute_sql` (alias de `query_posts`), `discover_accounts` y `analyze_accounts` (aliases de `analyze_competitor`). Se mantuvieron como están en los outputs reales para no falsear el ruido natural del sistema.

---

## 9. Constraints

- **Stack**: Node.js + TypeScript. SDKs: Vercel AI SDK + Anthropic provider. Modelos sugeridos: Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) para baseline barato, Sonnet 4.6 (`claude-sonnet-4-6`) para soluciones más sofisticadas.
- **Sistema autocontenido**: nada de DBs externas. Si necesitas estado entre runs, usa filesystem.
- **Determinismo**: tu compactador debe poder correr múltiples veces sobre la misma conversación y producir resultados estables (`temperature: 0` o seed fijo).
- **Cost budget orientativo**: una solución razonable corre las 14 conversaciones por menos de **$0.50 USD** end-to-end.

---

## 10. Lecturas recomendadas (opcional)

Para auto-investigación durante las 4-6h del ejercicio:

- **Anthropic Context Management API** — https://docs.anthropic.com/en/docs/build-with-claude/context-management
- **Cognition findings sobre recursive summaries** — "Don't Build Multi-Agents" (cognition.ai blog) tiene buena discusión sobre el trade-off de recursive compaction.
- **MemGPT** (Packer et al., 2023) — paper sobre memory hierarchy para LLMs.
- **Mem0** — implementación open-source de memory layer; el README discute trade-offs de diferentes estrategias de compaction.

> No es requisito leer ninguno de estos. Son útiles si te bloqueás buscando un punto de partida razonable.

---

**¿Dudas del enunciado?** El ejercicio premia decisiones explícitas y bien argumentadas más que perfección técnica. Si tomás un atajo, deciálo en el README de tu entrega y por qué.
