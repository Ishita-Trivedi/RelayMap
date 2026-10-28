import { TARGET_SCHEMA } from "./schema";
import type {
  DatasetProfile,
  FieldMapping,
  TargetField,
  Transformation,
} from "./types";

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function tokenScore(source: string, target: TargetField) {
  const normalizedSource = normalize(source);
  const candidates = [target.name, ...target.synonyms].map(normalize);

  if (candidates.includes(normalizedSource)) return 0.97;

  const sourceTokens = new Set(normalizedSource.split(" ").filter(Boolean));
  let best = 0;
  for (const candidate of candidates) {
    const candidateTokens = candidate.split(" ").filter(Boolean);
    const overlap = candidateTokens.filter((token) => sourceTokens.has(token)).length;
    const score = overlap / Math.max(candidateTokens.length, sourceTokens.size, 1);
    best = Math.max(best, score);
  }
  return best * 0.88;
}

function sampleScore(samples: string[], target: TargetField) {
  const populated = samples.filter(Boolean);
  if (!populated.length) return 0;

  if (target.name === "email") {
    return populated.every((sample) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sample)) ? 0.92 : 0;
  }

  if (target.type === "number") {
    return populated.every((sample) => Number.isFinite(Number(sample.replace(/,/g, "")))) ? 0.7 : 0;
  }

  if (target.type === "date") {
    return populated.every((sample) => !Number.isNaN(Date.parse(sample))) ? 0.72 : 0;
  }

  return 0;
}

function transformationFor(target: TargetField): Transformation {
  if (target.name === "currency" || target.name === "order_status") return "uppercase";
  if (target.type === "number") return "number";
  if (target.type === "date") return "date";
  return "string";
}

export function inferHeuristicMappings(profile: DatasetProfile): FieldMapping[] {
  const claimedSources = new Set<string>();

  return TARGET_SCHEMA.map((target) => {
    const ranked = profile.columns
      .filter((column) => !claimedSources.has(column.name))
      .map((column) => {
        const nameScore = tokenScore(column.name, target);
        const valuesScore = sampleScore(column.samples, target);
        return {
          source: column.name,
          confidence: Math.min(0.99, Math.max(nameScore, valuesScore) + (nameScore > 0.45 ? 0.08 : 0)),
          nameScore,
          valuesScore,
        };
      })
      .sort((a, b) => b.confidence - a.confidence);

    const best = ranked[0];
    const accepted = best && best.confidence >= 0.5;
    if (accepted) claimedSources.add(best.source);

    return {
      sourceField: accepted ? best.source : null,
      targetField: target.name,
      transformation: transformationFor(target),
      confidence: accepted ? Number(best.confidence.toFixed(2)) : 0,
      rationale: accepted
        ? best.nameScore >= best.valuesScore
          ? `Column name is semantically close to ${target.name}.`
          : `Sample values match the expected ${target.type} pattern.`
        : "No sufficiently reliable source field was found.",
    };
  });
}

export function validateMappings(profile: DatasetProfile, mappings: FieldMapping[]) {
  const sourceNames = new Set(profile.columns.map((column) => column.name));
  const warnings: string[] = [];
  const selectedSources = new Set<string>();

  for (const target of TARGET_SCHEMA) {
    const mapping = mappings.find((item) => item.targetField === target.name);
    if (!mapping?.sourceField) {
      if (target.required) warnings.push(`Required field ${target.name} is not mapped.`);
      continue;
    }

    if (!sourceNames.has(mapping.sourceField)) {
      warnings.push(`${mapping.sourceField} does not exist in the uploaded dataset.`);
    }
    if (selectedSources.has(mapping.sourceField)) {
      warnings.push(`${mapping.sourceField} is mapped to more than one target field.`);
    }
    selectedSources.add(mapping.sourceField);
    if (mapping.confidence < 0.7) {
      warnings.push(`Review the low-confidence mapping for ${target.name}.`);
    }
  }

  const required = TARGET_SCHEMA.filter((field) => field.required);
  const mappedRequired = required.filter((target) =>
    mappings.some((mapping) => mapping.targetField === target.name && mapping.sourceField),
  ).length;
  const lowConfidence = mappings.filter(
    (mapping) => mapping.sourceField && mapping.confidence < 0.7,
  ).length;
  const baseScore = required.length ? (mappedRequired / required.length) * 100 : 100;
  const qualityScore = Math.max(0, Math.round(baseScore - lowConfidence * 4 - warnings.length * 2));

  return { warnings: [...new Set(warnings)], qualityScore };
}

function quoteIdentifier(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function expressionFor(mapping: FieldMapping) {
  if (!mapping.sourceField) return "NULL";
  const source = quoteIdentifier(mapping.sourceField);
  switch (mapping.transformation) {
    case "number":
      return `TRY_CAST(REPLACE(CAST(${source} AS VARCHAR), ',', '') AS DOUBLE)`;
    case "date":
      return `TRY_CAST(${source} AS DATE)`;
    case "uppercase":
      return `UPPER(TRIM(CAST(${source} AS VARCHAR)))`;
    case "lowercase":
      return `LOWER(TRIM(CAST(${source} AS VARCHAR)))`;
    case "string":
      return `TRIM(CAST(${source} AS VARCHAR))`;
    default:
      return source;
  }
}

export function buildTransformationSql(mappings: FieldMapping[]) {
  const selectList = TARGET_SCHEMA.map((target) => {
    const mapping = mappings.find((item) => item.targetField === target.name);
    return `  ${mapping ? expressionFor(mapping) : "NULL"} AS ${quoteIdentifier(target.name)}`;
  }).join(",\n");

  return `-- Generated by RelayMap after human approval\nSELECT\n${selectList}\nFROM read_csv_auto('{{SOURCE_FILE}}', header = true);`;
}
