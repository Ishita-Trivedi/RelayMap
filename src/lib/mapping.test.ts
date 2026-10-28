import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTransformationSql, inferHeuristicMappings, validateMappings } from "./mapping";
import type { DatasetProfile } from "./types";

const profile: DatasetProfile = {
  fileName: "customer.csv",
  rowCount: 3,
  columns: [
    { name: "cust_no", inferredType: "VARCHAR", nullPercentage: 0, uniqueCount: 3, samples: ["C-1", "C-2"] },
    { name: "buyer_name", inferredType: "VARCHAR", nullPercentage: 0, uniqueCount: 3, samples: ["Asha", "Maya"] },
    { name: "txn_id", inferredType: "VARCHAR", nullPercentage: 0, uniqueCount: 3, samples: ["T-1", "T-2"] },
    { name: "txn_amt", inferredType: "DOUBLE", nullPercentage: 0, uniqueCount: 3, samples: ["120.50", "90"] },
    { name: "txn_day", inferredType: "DATE", nullPercentage: 0, uniqueCount: 3, samples: ["2026-10-20"] },
  ],
};

describe("schema mapping", () => {
  it("maps recognizable customer fields into the canonical contract", () => {
    const mappings = inferHeuristicMappings(profile);
    assert.equal(mappings.find((item) => item.targetField === "customer_id")?.sourceField, "cust_no");
    assert.equal(mappings.find((item) => item.targetField === "order_total")?.sourceField, "txn_amt");
    assert.equal(mappings.find((item) => item.targetField === "order_date")?.sourceField, "txn_day");
  });

  it("flags required target fields that remain unmapped", () => {
    const mappings = inferHeuristicMappings(profile).map((mapping) =>
      mapping.targetField === "order_id" ? { ...mapping, sourceField: null, confidence: 0 } : mapping,
    );
    const validation = validateMappings(profile, mappings);
    assert.ok(validation.warnings.includes("Required field order_id is not mapped."));
    assert.ok(validation.qualityScore < 100);
  });

  it("generates deterministic DuckDB SQL after approval", () => {
    const sql = buildTransformationSql(inferHeuristicMappings(profile));
    assert.ok(sql.includes("read_csv_auto('{{SOURCE_FILE}}'"));
    assert.ok(sql.includes('AS "customer_id"'));
    assert.ok(sql.includes("TRY_CAST"));
  });
});
