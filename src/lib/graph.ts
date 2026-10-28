import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { z } from "zod";
import { buildTransformationSql, inferHeuristicMappings, validateMappings } from "./mapping";
import { TARGET_SCHEMA } from "./schema";
import type { DatasetProfile, FieldMapping, ProviderConfig } from "./types";
import type { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";

const mappingSchema = z.object({
  mappings: z.array(
    z.object({
      sourceField: z.string().nullable(),
      targetField: z.string(),
      transformation: z.enum(["identity", "string", "number", "date", "uppercase", "lowercase"]),
      confidence: z.number().min(0).max(1),
      rationale: z.string(),
    }),
  ),
});

const GraphState = Annotation.Root({
  action: Annotation<"propose" | "finalize">,
  profile: Annotation<DatasetProfile>,
  mappings: Annotation<FieldMapping[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  warnings: Annotation<string[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  qualityScore: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),
  sql: Annotation<string | undefined>,
  mode: Annotation<"demo" | "live">,
});

function createModel(config: ProviderConfig) {
  if (config.provider === "demo" || !config.apiKey) return null;
  const baseURL =
    config.provider === "groq"
      ? "https://api.groq.com/openai/v1"
      : "https://api.openai.com/v1";
  const fallbackModel = config.provider === "groq" ? "openai/gpt-oss-20b" : "gpt-4.1-mini";

  return {
    apiKey: config.apiKey,
    model: config.model?.trim() || fallbackModel,
    baseURL,
  };
}

async function requestStructuredMappings(
  model: NonNullable<ReturnType<typeof createModel>>,
  sourceSummary: Array<Record<string, unknown>>,
) {
  const response = await fetch(`${model.baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${model.apiKey}`,
    },
    body: JSON.stringify({
      model: model.model,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "You map customer datasets into a canonical ecommerce schema. Return only JSON with a mappings array. Map each target exactly once. Never invent a source field. Use null when evidence is insufficient. Each mapping needs sourceField, targetField, transformation, confidence from 0 to 1, and a concise rationale. Allowed transformations: identity, string, number, date, uppercase, lowercase.",
        },
        {
          role: "user",
          content: JSON.stringify({ sourceColumns: sourceSummary, targetSchema: TARGET_SCHEMA }),
        },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!response.ok) {
    throw new Error(`Model provider returned ${response.status}. Check the API key and model name.`);
  }
  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("The model did not return a structured mapping.");
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The model response did not contain valid JSON.");
  return mappingSchema.parse(JSON.parse(content.slice(start, end + 1)));
}

export async function runOnboardingGraph(input: {
  action: "propose" | "finalize";
  profile: DatasetProfile;
  mappings?: FieldMapping[];
  provider: ProviderConfig;
  threadId: string;
  checkpointer?: MongoDBSaver;
}) {
  const model = createModel(input.provider);

  const proposeMappings = async (state: typeof GraphState.State) => {
    if (!model) {
      return { mappings: inferHeuristicMappings(state.profile), mode: "demo" as const };
    }

    const sourceSummary = state.profile.columns.map((column) => ({
      name: column.name,
      inferredType: column.inferredType,
      nullPercentage: column.nullPercentage,
      samples: column.samples.slice(0, 3),
    }));

    const response = await requestStructuredMappings(model, sourceSummary);

    const availableTargets = new Set(TARGET_SCHEMA.map((field) => field.name));
    const availableSources = new Set(state.profile.columns.map((column) => column.name));
    const cleanMappings = response.mappings
      .filter((mapping) => availableTargets.has(mapping.targetField))
      .map((mapping) => ({
        ...mapping,
        sourceField:
          mapping.sourceField && availableSources.has(mapping.sourceField)
            ? mapping.sourceField
            : null,
        confidence: Number(mapping.confidence.toFixed(2)),
      })) as FieldMapping[];

    for (const target of TARGET_SCHEMA) {
      if (!cleanMappings.some((mapping) => mapping.targetField === target.name)) {
        cleanMappings.push({
          sourceField: null,
          targetField: target.name,
          transformation: target.type === "number" ? "number" : target.type === "date" ? "date" : "string",
          confidence: 0,
          rationale: "The model did not find a reliable source field.",
        });
      }
    }

    return { mappings: cleanMappings, mode: "live" as const };
  };

  const validate = async (state: typeof GraphState.State) => {
    const result = validateMappings(state.profile, state.mappings);
    return result;
  };

  const generateSql = async (state: typeof GraphState.State) => ({
    sql: buildTransformationSql(state.mappings),
  });

  const workflow = new StateGraph(GraphState)
    .addNode("propose_mappings", proposeMappings)
    .addNode("validate_mappings", validate)
    .addNode("generate_sql", generateSql)
    .addConditionalEdges(START, (state) =>
      state.action === "finalize" ? "generate_sql" : "propose_mappings",
    )
    .addEdge("propose_mappings", "validate_mappings")
    .addEdge("generate_sql", "validate_mappings")
    .addEdge("validate_mappings", END);

  const graph = workflow.compile(
    input.checkpointer ? { checkpointer: input.checkpointer } : undefined,
  );
  return graph.invoke(
    {
      action: input.action,
      profile: input.profile,
      mappings: input.mappings || [],
      mode: model ? "live" : "demo",
    },
    { configurable: { thread_id: input.threadId } },
  );
}
