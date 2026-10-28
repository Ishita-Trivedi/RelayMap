export type ColumnProfile = {
  name: string;
  inferredType: string;
  nullPercentage: number;
  uniqueCount: number;
  samples: string[];
};

export type DatasetProfile = {
  fileName: string;
  rowCount: number;
  columns: ColumnProfile[];
};

export type TargetField = {
  name: string;
  type: "string" | "number" | "date";
  required: boolean;
  description: string;
  synonyms: string[];
};

export type Transformation =
  | "identity"
  | "string"
  | "number"
  | "date"
  | "uppercase"
  | "lowercase";

export type FieldMapping = {
  sourceField: string | null;
  targetField: string;
  transformation: Transformation;
  confidence: number;
  rationale: string;
};

export type ProviderConfig = {
  provider: "demo" | "openai" | "groq";
  apiKey?: string;
  model?: string;
};

export type OnboardingResult = {
  action: "propose" | "finalize";
  mappings: FieldMapping[];
  warnings: string[];
  qualityScore: number;
  sql?: string;
  mode: "demo" | "live";
  persisted: boolean;
};
