"use client";

import {
  Activity,
  ArrowRight,
  Braces,
  Check,
  CheckCircle2,
  Code2,
  Database,
  Download,
  FileSpreadsheet,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  WandSparkles,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { profileCsv } from "@/lib/duckdb";
import { DEMO_CSV, TARGET_SCHEMA } from "@/lib/schema";
import type {
  DatasetProfile,
  FieldMapping,
  OnboardingResult,
  ProviderConfig,
  Transformation,
} from "@/lib/types";

type Stage = "idle" | "profiling" | "mapping" | "review" | "finalizing" | "ready" | "error";

const transformations: Transformation[] = [
  "identity",
  "string",
  "number",
  "date",
  "uppercase",
  "lowercase",
];

function confidenceLabel(confidence: number) {
  if (confidence >= 0.85) return "High";
  if (confidence >= 0.65) return "Review";
  return "Low";
}

function modeCopy(stage: Stage) {
  if (stage === "profiling") return "Profiling locally";
  if (stage === "mapping") return "Agent mapping";
  if (stage === "finalizing") return "Generating contract";
  if (stage === "ready") return "Ready to export";
  if (stage === "error") return "Needs attention";
  return "Ready";
}

export function OnboardingWorkspace() {
  const [stage, setStage] = useState<Stage>("idle");
  const [profile, setProfile] = useState<DatasetProfile | null>(null);
  const [result, setResult] = useState<OnboardingResult | null>(null);
  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [provider, setProvider] = useState<ProviderConfig["provider"]>("demo");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [error, setError] = useState("");
  const [events, setEvents] = useState<string[]>(["Workspace initialized"]);
  const [isDragging, setIsDragging] = useState(false);
  const threadId = useRef(crypto.randomUUID());

  const providerConfig = useMemo<ProviderConfig>(
    () => ({ provider, apiKey: apiKey || undefined, model: model || undefined }),
    [provider, apiKey, model],
  );

  const appendEvent = (message: string) =>
    setEvents((current) => [...current.slice(-4), message]);

  async function callAgent(
    action: "propose" | "finalize",
    currentProfile: DatasetProfile,
    currentMappings?: FieldMapping[],
  ) {
    const response = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        threadId: threadId.current,
        profile: currentProfile,
        mappings: currentMappings,
        provider: providerConfig,
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "The onboarding agent could not complete the request.");
    return payload as OnboardingResult;
  }

  async function processFile(file: File) {
    if (provider !== "demo" && !apiKey.trim()) {
      setError("Enter your provider API key, or switch to Demo engine.");
      setStage("error");
      return;
    }

    setError("");
    setResult(null);
    setMappings([]);
    threadId.current = crypto.randomUUID();
    setStage("profiling");
    appendEvent(`Reading ${file.name} in the browser`);

    try {
      const nextProfile = await profileCsv(file);
      setProfile(nextProfile);
      appendEvent(`Profiled ${nextProfile.rowCount.toLocaleString()} rows across ${nextProfile.columns.length} columns`);
      setStage("mapping");
      const proposal = await callAgent("propose", nextProfile);
      setResult(proposal);
      setMappings(proposal.mappings);
      appendEvent(`${proposal.mode === "live" ? "AI" : "Demo"} agent proposed ${proposal.mappings.filter((item) => item.sourceField).length} mappings`);
      setStage("review");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unable to process this dataset.";
      setError(message);
      appendEvent("Onboarding run stopped safely");
      setStage("error");
    }
  }

  async function finalizeMappings() {
    if (!profile) return;
    setError("");
    setStage("finalizing");
    appendEvent("Human approval received; generating transformation contract");
    try {
      const finalized = await callAgent("finalize", profile, mappings);
      setResult(finalized);
      setMappings(finalized.mappings);
      appendEvent(`Validation completed with a ${finalized.qualityScore}% readiness score`);
      setStage("ready");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unable to finalize mappings.";
      setError(message);
      setStage("error");
    }
  }

  function updateMapping(targetField: string, patch: Partial<FieldMapping>) {
    setMappings((current) =>
      current.map((mapping) =>
        mapping.targetField === targetField
          ? { ...mapping, ...patch, confidence: patch.sourceField === null ? 0 : mapping.confidence }
          : mapping,
      ),
    );
    if (stage === "ready") setStage("review");
  }

  function loadSample() {
    const file = new File([DEMO_CSV], "northstar_orders.csv", { type: "text/csv" });
    void processFile(file);
  }

  function downloadReport() {
    if (!profile || !result) return;
    const document = JSON.stringify(
      {
        generatedBy: "RelayMap",
        threadId: threadId.current,
        dataset: { fileName: profile.fileName, rows: profile.rowCount },
        mappings,
        warnings: result.warnings,
        qualityScore: result.qualityScore,
        transformationSql: result.sql,
      },
      null,
      2,
    );
    const url = URL.createObjectURL(new Blob([document], { type: "application/json" }));
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = "relaymap-onboarding-report.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const githubUrl = process.env.NEXT_PUBLIC_GITHUB_URL || "#architecture";
  const mappedCount = mappings.filter((mapping) => mapping.sourceField).length;

  return (
    <main>
      <nav className="topbar" aria-label="Primary navigation">
        <a className="brand" href="#top" aria-label="RelayMap home">
          <span className="brand-mark"><Braces size={18} /></span>
          <span>RelayMap</span>
        </a>
        <div className="nav-links">
          <a href="#workspace">Workspace</a>
          <a href="#architecture">Architecture</a>
          <a className="github-link" href={githubUrl} target={githubUrl.startsWith("http") ? "_blank" : undefined}>
            <Code2 size={16} /> Source
          </a>
        </div>
      </nav>

      <section className="hero" id="top">
        <div className="eyebrow"><Sparkles size={14} /> Agentic customer data onboarding</div>
        <h1>Turn unfamiliar customer data into a validated contract.</h1>
        <p>
          Profile a customer export locally, let an agent propose semantic mappings, then approve an executable transformation plan.
        </p>
        <div className="hero-proof">
          <span><ShieldCheck size={16} /> Raw files stay in the browser</span>
          <span><Database size={16} /> MongoDB-backed agent state</span>
          <span><Activity size={16} /> Human approval before SQL</span>
        </div>
      </section>

      <section className="workspace-shell" id="workspace">
        <header className="workspace-header">
          <div>
            <span className="section-kicker">Onboarding workspace</span>
            <h2>Northstar commerce schema</h2>
          </div>
          <div className={`runtime-status ${stage}`}>
            <span className="status-dot" /> {modeCopy(stage)}
          </div>
        </header>

        <div className="stepper" aria-label="Onboarding stages">
          {[
            ["01", "Profile", ["profiling", "mapping", "review", "finalizing", "ready"].includes(stage)],
            ["02", "Map", ["mapping", "review", "finalizing", "ready"].includes(stage)],
            ["03", "Approve", ["finalizing", "ready"].includes(stage)],
          ].map(([number, label, active]) => (
            <div className={`step ${active ? "active" : ""}`} key={String(number)}>
              <span>{String(number)}</span><strong>{String(label)}</strong>
            </div>
          ))}
        </div>

        <div className="workspace-grid">
          <aside className="control-panel">
            <div className="panel-heading">
              <div className="icon-box"><WandSparkles size={18} /></div>
              <div><strong>Agent configuration</strong><span>No secrets are stored</span></div>
            </div>

            <label className="field-label" htmlFor="engine">Inference mode</label>
            <select id="engine" value={provider} onChange={(event) => setProvider(event.target.value as ProviderConfig["provider"])}>
              <option value="demo">Demo engine — no key</option>
              <option value="openai">OpenAI — your key</option>
              <option value="groq">Groq — your key</option>
            </select>

            {provider !== "demo" && (
              <div className="live-fields">
                <label className="field-label" htmlFor="apiKey">Session-only API key</label>
                <input id="apiKey" type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="sk-..." />
                <label className="field-label" htmlFor="model">Model override <span>optional</span></label>
                <input id="model" value={model} onChange={(event) => setModel(event.target.value)} placeholder={provider === "groq" ? "openai/gpt-oss-20b" : "gpt-4.1-mini"} />
              </div>
            )}

            <div
              className={`drop-zone ${isDragging ? "dragging" : ""}`}
              onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragging(false);
                const file = event.dataTransfer.files[0];
                if (file) void processFile(file);
              }}
            >
              <UploadCloud size={24} />
              <strong>Drop a customer CSV</strong>
              <span>Up to 5 MB · processed locally</span>
              <label className="upload-button" htmlFor="csv-upload">Choose file</label>
              <input id="csv-upload" hidden type="file" accept=".csv,text/csv" onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void processFile(file);
              }} />
            </div>

            <button className="sample-button" type="button" onClick={loadSample} disabled={["profiling", "mapping", "finalizing"].includes(stage)}>
              <FileSpreadsheet size={16} /> Load sample retailer
            </button>

            <div className="event-log">
              <div className="event-title"><Activity size={15} /> Agent activity</div>
              {events.map((event, index) => (
                <div className="event-row" key={`${event}-${index}`}><span /><p>{event}</p></div>
              ))}
            </div>
          </aside>

          <div className="main-panel">
            {!profile && (
              <div className="empty-state">
                <div className="empty-visual">
                  <div className="data-node">cust_no</div><ArrowRight size={22} />
                  <div className="agent-node"><Sparkles size={22} /></div><ArrowRight size={22} />
                  <div className="data-node canonical">customer_id</div>
                </div>
                <span className="section-kicker">Start with evidence</span>
                <h3>Bring a messy customer export.</h3>
                <p>RelayMap profiles it with DuckDB, proposes mappings, and waits for your approval before generating SQL.</p>
                <button className="primary-button" type="button" onClick={loadSample}>Try the sample dataset <ArrowRight size={16} /></button>
              </div>
            )}

            {profile && (
              <>
                <div className="dataset-strip">
                  <div className="file-summary">
                    <div className="file-icon"><FileSpreadsheet size={19} /></div>
                    <div><strong>{profile.fileName}</strong><span>Customer source · CSV</span></div>
                  </div>
                  <div className="dataset-metrics">
                    <div><strong>{profile.rowCount.toLocaleString()}</strong><span>Rows</span></div>
                    <div><strong>{profile.columns.length}</strong><span>Columns</span></div>
                    <div><strong>{mappedCount}/{TARGET_SCHEMA.length}</strong><span>Mapped</span></div>
                  </div>
                </div>

                {(["profiling", "mapping"] as Stage[]).includes(stage) && (
                  <div className="working-state">
                    <RefreshCw className="spin" size={28} />
                    <h3>{stage === "profiling" ? "Profiling the dataset" : "Reasoning over schema evidence"}</h3>
                    <p>{stage === "profiling" ? "DuckDB is inferring types and data-quality signals locally." : "LangGraph is ranking semantic matches and validating required fields."}</p>
                  </div>
                )}

                {mappings.length > 0 && !(["profiling", "mapping"] as Stage[]).includes(stage) && (
                  <div className="mapping-workspace">
                    <div className="mapping-title-row">
                      <div><span className="section-kicker">Proposed mapping</span><h3>Review the agent’s decisions</h3></div>
                      <span className={`persistence-badge ${result?.persisted ? "connected" : ""}`}>
                        <Database size={14} /> {result?.persisted ? "Atlas connected" : "Stateless mode"}
                      </span>
                    </div>

                    <div className="mapping-table">
                      <div className="mapping-header"><span>Source evidence</span><span>Canonical field</span><span>Transform</span><span>Confidence</span></div>
                      {mappings.map((mapping) => {
                        const target = TARGET_SCHEMA.find((field) => field.name === mapping.targetField);
                        return (
                          <div className="mapping-row" key={mapping.targetField}>
                            <div>
                              <select value={mapping.sourceField || ""} onChange={(event) => updateMapping(mapping.targetField, { sourceField: event.target.value || null, confidence: event.target.value ? mapping.confidence || 0.75 : 0 })}>
                                <option value="">Unmapped</option>
                                {profile.columns.map((column) => <option value={column.name} key={column.name}>{column.name}</option>)}
                              </select>
                              <small>{mapping.rationale}</small>
                            </div>
                            <div className="target-cell"><strong>{mapping.targetField}</strong><span>{target?.required ? "Required" : "Optional"} · {target?.type}</span></div>
                            <div>
                              <select value={mapping.transformation} onChange={(event) => updateMapping(mapping.targetField, { transformation: event.target.value as Transformation })}>
                                {transformations.map((item) => <option value={item} key={item}>{item}</option>)}
                              </select>
                            </div>
                            <div className="confidence-cell">
                              <strong>{Math.round(mapping.confidence * 100)}%</strong><span>{confidenceLabel(mapping.confidence)}</span>
                              <div className="confidence-track"><i style={{ width: `${Math.round(mapping.confidence * 100)}%` }} /></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {error && <div className="error-banner">{error}</div>}

                    <div className="approval-bar">
                      <div><LockKeyhole size={18} /><p><strong>Human approval gate</strong><span>No transformation is generated until you approve these mappings.</span></p></div>
                      <button className="primary-button" type="button" onClick={finalizeMappings} disabled={stage === "finalizing"}>
                        {stage === "finalizing" ? <RefreshCw className="spin" size={16} /> : <Check size={16} />}
                        Approve & generate SQL
                      </button>
                    </div>

                    {result?.sql && stage === "ready" && (
                      <div className="result-grid">
                        <div className="quality-card">
                          <div className="score-ring" style={{ "--score": `${result.qualityScore * 3.6}deg` } as React.CSSProperties}>
                            <div><strong>{result.qualityScore}</strong><span>/100</span></div>
                          </div>
                          <div><span className="section-kicker">Readiness score</span><h4>{result.warnings.length ? "Ready with review items" : "Contract ready"}</h4><p>{result.warnings.length ? `${result.warnings.length} validation item${result.warnings.length === 1 ? "" : "s"} remain.` : "All required fields are mapped."}</p></div>
                          <ul>{result.warnings.slice(0, 3).map((warning) => <li key={warning}>{warning}</li>)}</ul>
                        </div>
                        <div className="sql-card">
                          <div className="sql-header"><span><Braces size={15} /> transformation.sql</span><button type="button" onClick={() => navigator.clipboard.writeText(result.sql || "")}>Copy</button></div>
                          <pre>{result.sql}</pre>
                        </div>
                      </div>
                    )}

                    {stage === "ready" && (
                      <div className="export-row">
                        <div><CheckCircle2 size={20} /><p><strong>Onboarding contract generated</strong><span>Export the evidence, mappings, checks and transformation SQL.</span></p></div>
                        <button className="secondary-button" type="button" onClick={downloadReport}><Download size={16} /> Export report</button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      <section className="architecture" id="architecture">
        <div className="architecture-intro">
          <span className="section-kicker">Built for the portfolio, shaped like a product</span>
          <h2>Serverless where it should be. Stateful where it matters.</h2>
          <p>Raw customer files are profiled in-browser. The backend receives compact schema evidence, while MongoDB stores workflow state and audit history.</p>
        </div>
        <div className="architecture-flow">
          {[
            ["01", "Browser", "DuckDB-Wasm profiles the CSV without uploading raw rows."],
            ["02", "Vercel API", "FastAPI-compatible serverless execution hosts the workflow boundary."],
            ["03", "LangGraph", "Mapping, validation and approval stages stay explicit and inspectable."],
            ["04", "MongoDB", "Checkpoints, decisions and audit events survive serverless invocations."],
          ].map(([number, title, copy], index) => (
            <div className="architecture-card" key={title}>
              <span>{number}</span><h3>{title}</h3><p>{copy}</p>{index < 3 && <ArrowRight className="flow-arrow" size={18} />}
            </div>
          ))}
        </div>
        <div className="footer-line">
          <div className="brand"><span className="brand-mark"><Braces size={18} /></span><span>RelayMap</span></div>
          <p>LangGraph · DuckDB · MongoDB Atlas · Next.js</p>
        </div>
      </section>
    </main>
  );
}
