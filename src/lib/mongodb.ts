import { MongoClient } from "mongodb";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import type { DatasetProfile, FieldMapping } from "./types";

declare global {
  // eslint-disable-next-line no-var
  var relayMapMongoClient: Promise<MongoClient> | undefined;
}

const databaseName = process.env.MONGODB_DB || "relaymap";

export async function getMongoClient() {
  const uri = process.env.MONGODB_URI;
  if (!uri) return null;

  if (!global.relayMapMongoClient) {
    const client = new MongoClient(uri, {
      maxPoolSize: 8,
      minPoolSize: 0,
      maxIdleTimeMS: 30_000,
    });
    global.relayMapMongoClient = client.connect();
  }
  return global.relayMapMongoClient;
}

export async function getMongoCheckpointer() {
  const client = await getMongoClient();
  return client ? new MongoDBSaver({ client, dbName: databaseName }) : undefined;
}

export async function saveOnboardingRun(input: {
  threadId: string;
  action: "propose" | "finalize";
  profile: DatasetProfile;
  mappings: FieldMapping[];
  warnings: string[];
  qualityScore: number;
  mode: "demo" | "live";
  sql?: string;
}) {
  const client = await getMongoClient();
  if (!client) return false;

  await client
    .db(databaseName)
    .collection("onboarding_runs")
    .updateOne(
      { threadId: input.threadId },
      {
        $set: {
          ...input,
          profile: {
            fileName: input.profile.fileName,
            rowCount: input.profile.rowCount,
            columns: input.profile.columns,
          },
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true },
    );
  return true;
}
