# RelayMap

RelayMap is an agentic customer-data onboarding platform built as a public portfolio project. It profiles a customer CSV in the browser, proposes semantic mappings into a canonical commerce schema, requires human approval, and produces a validated DuckDB transformation contract.

## Why this project exists

Enterprise implementation teams routinely spend days understanding customer exports, resolving ambiguous fields, writing transformations, and checking data quality. RelayMap makes that workflow explicit and reviewable instead of hiding it behind a generic chat interface.

## Architecture

```text
CSV in the browser
      |
      v
DuckDB-Wasm profiling
      |
      v
Next.js API on Vercel
      |
      v
LangGraph mapping + validation workflow
      |                       |
      v                       v
MongoDB Atlas          OpenAI-compatible model
checkpoints/audit       or transparent demo engine
```

Raw CSV files are not uploaded by the application. The API receives a compact schema profile and a few bounded sample values, with common email and phone patterns redacted server-side.

## Features

- Browser-local CSV profiling with DuckDB-Wasm
- LangGraph workflow for proposal, validation and finalization
- Human-editable schema mappings
- Deterministic DuckDB SQL generation after approval
- MongoDB Atlas persistence and LangGraph checkpointing
- Stateless fallback when `MONGODB_URI` is not configured
- Demo engine requiring no API key
- Optional bring-your-own OpenAI or Groq key for live mapping
- Exportable onboarding report
- Responsive product UI and GitHub Actions verification

## Run locally

Requirements: Node.js 20.11 or later.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000` and select **Load sample retailer**.

MongoDB is optional. Without it, the product displays **Stateless mode** and the complete onboarding flow still works.

## MongoDB Atlas setup

1. Create a free MongoDB Atlas cluster.
2. Create a database user with access only to the RelayMap database.
3. Configure network access for the Vercel deployment.
4. Add `MONGODB_URI` and `MONGODB_DB=relaymap` to Vercel environment variables.
5. Redeploy the application.

RelayMap uses MongoDB for:

- `onboarding_runs`: project metadata, mappings, validation results and audit history
- LangGraph checkpoint collections created by `MongoDBSaver`

It deliberately does not store raw customer CSV files.

## Deploy to Vercel

1. Push this directory to a public GitHub repository.
2. Import that repository into Vercel.
3. Add the optional MongoDB environment variables.
4. Deploy using the default Next.js settings.

The application uses a Node.js Vercel Function for `/api/onboarding`. Live AI mode requires visitors to supply their own API key for the current session; the key is not persisted by RelayMap.

## Verification

```bash
npm test
npm run build
```

The unit tests cover deterministic schema matching, required-field validation and SQL generation. The public CI workflow runs tests and a production build for every pull request.

## Portfolio discussion points

- Why raw files are processed in-browser
- How serverless execution changes persistence design
- Why AI proposes mappings while deterministic code validates them
- How human approval separates suggestions from consequential actions
- How checkpoint state and audit records are stored without persisting secrets
- How the demo engine makes the public deployment usable without owner-funded inference

## Current scope

RelayMap intentionally supports CSV input and one canonical ecommerce schema. A production version would add authenticated workspaces, connector ingestion, industry-specific contracts, background jobs, field-level access controls, and continuous schema-drift monitoring.
