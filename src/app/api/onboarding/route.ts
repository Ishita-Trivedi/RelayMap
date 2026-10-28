import { NextResponse } from "next/server";
import { z } from "zod";
import { runOnboardingGraph } from "@/lib/graph";
import { getMongoCheckpointer, saveOnboardingRun } from "@/lib/mongodb";

export const runtime = "nodejs";
export const maxDuration = 60;

const columnSchema = z.object({
  name: z.string().min(1).max(128),
  inferredType: z.string().max(128),
  nullPercentage: z.number().min(0).max(100),
  uniqueCount: z.number().int().nonnegative(),
  samples: z.array(z.string().max(256)).max(5),
});

const mappingSchema = z.object({
  sourceField: z.string().max(128).nullable(),
  targetField: z.string().max(128),
  transformation: z.enum(["identity", "string", "number", "date", "uppercase", "lowercase"]),
  confidence: z.number().min(0).max(1),
  rationale: z.string().max(500),
});

const requestSchema = z.object({
  action: z.enum(["propose", "finalize"]),
  threadId: z.string().uuid(),
  profile: z.object({
    fileName: z.string().min(1).max(200),
    rowCount: z.number().int().nonnegative().max(250_000),
    columns: z.array(columnSchema).min(1).max(150),
  }),
  mappings: z.array(mappingSchema).max(150).optional(),
  provider: z.object({
    provider: z.enum(["demo", "openai", "groq"]),
    apiKey: z.string().max(500).optional(),
    model: z.string().max(150).optional(),
  }),
});

function redactSample(value: string) {
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "<email>";
  if (/^\+?[\d\s()-]{8,}$/.test(value)) return "<phone>";
  return value.slice(0, 96);
}

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json());
    if (body.provider.provider !== "demo" && !body.provider.apiKey) {
      return NextResponse.json({ error: "An API key is required for live model mode." }, { status: 400 });
    }

    const safeProfile = {
      ...body.profile,
      columns: body.profile.columns.map((column) => ({
        ...column,
        samples: column.samples.map(redactSample),
      })),
    };

    const checkpointer = await getMongoCheckpointer();
    const result = await runOnboardingGraph({
      action: body.action,
      profile: safeProfile,
      mappings: body.mappings,
      provider: body.provider,
      threadId: body.threadId,
      checkpointer,
    });

    const persisted = await saveOnboardingRun({
      threadId: body.threadId,
      action: body.action,
      profile: safeProfile,
      mappings: result.mappings,
      warnings: result.warnings,
      qualityScore: result.qualityScore,
      mode: result.mode,
      sql: result.sql,
    });

    return NextResponse.json({
      action: body.action,
      mappings: result.mappings,
      warnings: result.warnings,
      qualityScore: result.qualityScore,
      sql: result.sql,
      mode: result.mode,
      persisted,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected onboarding failure.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
