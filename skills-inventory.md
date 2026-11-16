# Technical Skills Inventory: Karen Keeranchira

This inventory is built from local clones of your GitHub repositories, audited on 2026-11-08. Each entry gives a proficiency level and the evidence behind it.

**Levels**
- **P (Practical implementation):** code you committed in a working project
- **A (Academic/coursework):** course or assignment work
- **B (Basic familiarity):** small or tutorial-level use, or only in a teammate's part of a project

## Programming languages
| Skill | Level | Evidence |
|---|---|---|
| TypeScript | P | Fineprint (React frontend and Deno Edge Functions), WanderBase (Next.js app, scripts, contracts) |
| JavaScript | P | Nexus (React/Vite), Isahkhel (WebXR), Bisect web UI |
| Python | P | GOA-LLM pipeline (about 60 scripts, pytest), NutriMind data pipeline, Bisect |
| SQL / PL/pgSQL | P | Migrations, triggers, RPCs, and RLS in Fineprint and WanderBase |
| HTML / CSS | P | All web projects |
| C++ | A | Small coursework programs (Visual Studio projects) |
| C# | B | Unity projects, mostly third-party SDKs and tutorial content |

## Frontend
| Skill | Level | Evidence |
|---|---|---|
| React 18/19 | P | Fineprint, WanderBase, Nexus |
| Next.js 15 (App Router, middleware) | P | WanderBase, BizWa |
| Vite | P | Fineprint, Nexus |
| Tailwind CSS v4 | P | Fineprint, WanderBase, Nexus |
| Radix UI / shadcn-style components, CVA | P | Fineprint |
| Framer Motion / Motion | P | Fineprint, WanderBase |
| dnd-kit (drag and drop) | P | WanderBase planner |
| Streaming UI (SSE consumer hook) | P | Fineprint `useAskStream.ts` |
| A-Frame / WebXR | B–P | Isahkhel VR basketball (single 49 KB HTML file, Quest 3 controls) |

## Backend
| Skill | Level | Evidence |
|---|---|---|
| Supabase Edge Functions (Deno) | P | Fineprint (ask, ingest, compare, draft, embed-worker), WanderBase (ai-plan, kb-ingest) |
| REST API design, request validation (Zod) | P | WanderBase contracts with contract tests |
| Background workers and scheduling (pg_cron) | P | Fineprint embed-worker migration |
| Python HTTP server | P | Bisect `server.py` |
| FastAPI / LangGraph | **B (exclude)** | Present in NutriMind `apps/api`, but committed by your teammate |

## Databases
| Skill | Level | Evidence |
|---|---|---|
| PostgreSQL schema design, 3NF/BCNF normalization | P + A | WanderBase (16 tables, normalization diagrams), Fineprint (9 tables) |
| Row Level Security | P | 54 policies in WanderBase; Fineprint RLS and security-hardening migrations |
| Triggers, constraints (GiST EXCLUDE, deferred), RPCs | P | WanderBase |
| pgvector and full-text search | P | Fineprint `match_chunks`, BizWa |
| Database testing (pgTAP) | P | WanderBase: 92 assertions |
| Supabase Storage | P | Fineprint PDF upload flow |

## AI and machine learning
| Skill | Level | Evidence |
|---|---|---|
| RAG pipeline engineering | P | Fineprint: ingest, chunking, embeddings, hybrid retrieval, reranking, citations, refusal |
| Embeddings (gte-small, 384-dim) | P | Fineprint embedding stage and backfill tooling |
| Reranking (cross-encoder endpoint) | P | Fineprint `rerank.ts` |
| Query rewriting for multi-turn retrieval | P | Fineprint (latest commit) |
| Retrieval evaluation (golden sets, Recall@k, MRR, ablations) | P | Fineprint `_eval/` with 25 result runs |
| LLM API integration and model routing (OpenRouter) | P | Fineprint, WanderBase, BizWa |
| OCR with vision LLMs | P | Fineprint `ocr.ts` |
| Prompt engineering and structured JSON output | P | Fineprint risk report, drafting, comparison |
| SFT dataset construction (grounded generation, provenance, dedup, splits) | P | GOA-LLM |
| Near-duplicate detection (MinHash, Jaccard) | P | GOA-LLM `datasketch` |
| Hugging Face `datasets` / `transformers` | B–P | GOA-LLM data tooling and chat-template tests |
| Fine-tuning (Unsloth, QLoRA, PEFT) | **Not yet** | Planned in `requirements-gpu.txt`, but no training run exists yet |
| Quantization / llama.cpp / GGUF | **Not yet** | Planned only |

## Cloud and deployment
| Skill | Level | Evidence |
|---|---|---|
| Supabase hosted projects (migrations, secrets, advisors) | P | WanderBase `db:*` scripts, Fineprint |
| GitHub Actions CI | P | WanderBase `ci.yml` |
| Vercel / AWS / Docker | **None found** | Don't list these yet |

## Cybersecurity
| Skill | Level | Evidence |
|---|---|---|
| Authentication (Clerk, JWT forwarding to Supabase) | P | Fineprint, WanderBase, BizWa |
| Authorization via RLS, multi-tenant isolation testing | P | Both Supabase projects |
| Secret handling (keys server-side only) | P | Fineprint architecture |
| Security review and remediation | P | Fineprint `vulnerabilities-report/` and hardening migrations |

## Developer tools
Git and GitHub (P), pnpm and npm (P), ESLint (P), Playwright (P), Vitest (P), pytest (P), Deno test (P), Supabase CLI (P), VS Code, Visual Studio, PyCharm (P), Unity (B), Postman (B, installed only).

## Software engineering concepts
| Concept | Level | Evidence |
|---|---|---|
| Algorithm analysis (Big-O, Master Method) | A + P | Bisect DAA project |
| Graph algorithms (MST, Hamiltonian/Eulerian, coloring, isomorphism) | A | PycharmProjects coursework scripts |
| Automata and formal languages (NFA, PDA, Mealy machines, Turing machines, CFG) | A | PycharmProjects coursework scripts |
| Automated testing strategy (unit, contract, database, end-to-end) | P | WanderBase |
| Data pipelines and ETL | P | GOA-LLM, NutriMind |
| Modular architecture and documentation | P | All major repos |

## APIs and integrations
OpenRouter (P), Clerk (P), Supabase JS client (P), OpenStreetMap / Nominatim, Wikivoyage, REST Countries (P, WanderBase knowledge-base ingest), Wikipedia/MediaWiki crawling (P, GOA-LLM), USDA / Open Food Facts / Food.com datasets (P, NutriMind cleaning), Resend (B, BizWa, ownership unclear).
