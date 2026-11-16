# KAREN KEERANCHIRA
Goa, India · karenkeeranchira@gmail.com · github.com/06karen · linkedin.com/in/karen-keeranchira-788264426

## SUMMARY
I am an aspiring Software Engineer with a strong interest in software development, problem-solving, and emerging technologies, and I enjoy building practical applications that solve real-world problems. Through coursework and personal projects, I have gained hands-on experience with Python, Java, C++, JavaScript, and TypeScript, along with React, Next.js, PostgreSQL, and Supabase. I have also built AI/ML applications, data-processing pipelines, and backend integrations, including retrieval-augmented generation (RAG) systems. I am eager to apply my skills in a professional environment, learn from experienced developers, and contribute to meaningful projects.

## EDUCATION
**Bachelor of Engineering (B.E.) in Computer Engineering**, Don Bosco College of Engineering, Fatorda, Goa | 2024 – 2028 (expected)
CGPA: 9.10 (First Year) · 8.98 (Second Year)
Relevant coursework: Database Management Systems, Design & Analysis of Algorithms, Theory of Computation, Discrete Mathematics / Graph Theory, [add more]

## TECHNICAL SKILLS
**Languages:** TypeScript, JavaScript, Python, Java, C++, SQL (PostgreSQL, PL/pgSQL), HTML/CSS
**Frontend:** React 18/19, Next.js 15 (App Router), Vite, Tailwind CSS, Framer Motion, Radix UI, responsive UI design
**Backend & Data:** Supabase (Postgres, Edge Functions on Deno, Storage, pg_cron), REST APIs, Server-Sent Events streaming, Zod
**Databases:** PostgreSQL, pgvector, full-text search (tsvector), Row Level Security, triggers, RPC functions, schema normalization (3NF/BCNF)
**AI/ML:** RAG (chunking, embeddings, hybrid retrieval, reranking, query rewriting), OpenRouter LLM APIs, OCR with vision models, LLM evaluation (Recall@k, MRR), SFT dataset construction, MinHash deduplication
**Testing & Tools:** Git/GitHub, GitHub Actions CI, pgTAP, Playwright, Vitest, pytest, Deno test, Clerk auth, pnpm

## PROJECTS
**Fineprint: RAG Document Intelligence for Legal Contracts** | React, TypeScript, Supabase, pgvector, Deno, OpenRouter | [github link]
*Two-person team; 44 of 59 commits*
- Built a PDF question-answering system that gives clause-level citations, with a staged ingest pipeline: PDF text extraction, line reconstruction, quality scoring, and a vision-model OCR fallback for scanned pages.
- Implemented clause-aware chunking with legal heading and proviso detection. On a 45-question golden set over 15 contracts, Recall@8 rose from 0.47 (fixed-size chunks) to 1.00 and MRR from 0.32 to 0.89.
- Added cross-encoder reranking (MRR 0.89 → 0.96) and follow-up query rewriting (MRR 0.69 → 0.87 on 13 multi-turn questions), validated through ablation runs in an evaluation harness.
- Developed a streaming chat interface, multi-document conversations, risk-report generation with JSON parsing, contract comparison, web verification of clauses, and a chunk/retrieval inspector.
- Hardened security with Clerk JWT + Supabase Row Level Security, server-side API keys, and model routing with fallbacks for rate limits.

**WanderBase: Collaborative AI Travel Itinerary Builder (DBMS Project)** | Next.js 15, TypeScript, PostgreSQL, Supabase | [github link]
*Two-person team; author of all repository commits*
- Designed a 16-table normalized PostgreSQL schema that enforces business rules in the database: GiST exclusion constraints prevent overlapping activities, and deferred triggers keep expense splits balanced.
- Wrote 54 Row Level Security policies for per-trip roles (owner/editor/viewer), verified by 92 pgTAP assertions and Playwright end-to-end tests.
- Built AI itinerary generation in Edge Functions that is grounded in a curated places knowledge base, with a foreign-key guarantee that the model cannot store invented places. The knowledge base is filled by an ingestion pipeline from OpenStreetMap, Wikivoyage, and REST Countries.
- Set up GitHub Actions CI that replays every migration from empty, runs pgTAP tests, and fails the build on any drift in generated TypeScript types.

**Nexus: Game Launcher UI (1st Place, Frontend Hackathon)** | React 19, Vite, Tailwind CSS, Framer Motion | github.com/06karen/Nexus
- Built a desktop-style game launcher with 10+ views (store, library, trending, achievements, friends, downloads, notifications, settings, login) across about 8,700 lines of React components.
- Implemented a store with cart, wishlist and game-detail modals, plus client-side search, category filters and sorting with React hooks (useState/useMemo). Saved user settings to localStorage and animated page transitions with Framer Motion.

**GOA-LLM: Grounded Instruction Dataset for Fine-Tuning a Small LLM** | Python, Hugging Face Datasets, datasketch, pytest | [github link]
*Two-person team; 32 of 40 commits*
- Built a multi-stage data pipeline (crawl → clean → chunk → generate → dedupe → split) over Wikipedia, Wikivoyage, and government sources, producing 13,061 candidate instruction-answer pairs.
- Added source-grounding verification, MinHash near-duplicate detection, leak probes against a held-out benchmark, and an automated 16-check quality gate. Curated a 1,865-example train/valid/eval split with zero cross-split duplicates.

**BizWa: AI WhatsApp Business Assistant (24-hour hackathon)** | Next.js, Supabase, pgvector, Clerk, OpenRouter | [github link]
- Co-built an AI assistant that answers FAQs, qualifies leads, and books appointments, with hybrid retrieval (pgvector + BM25 + reciprocal rank fusion) and an owner dashboard for conversations, leads, and analytics.

**Bisect: Search Algorithm Visualizer (DAA)** | Python, JavaScript | [github link]
- Implemented binary search, prefix autocomplete in O(log n + k), and order-preserving insert/delete, with a benchmark that compares against linear search and a web UI that visualizes each probe.

## CERTIFICATIONS
**Responsible & Safe AI Systems**, NPTEL | [Year] · [Score % / Elite / Silver, if applicable]

## ACHIEVEMENTS & ACTIVITIES
- **1st Place**, [Hackathon Name], frontend development hackathon, [Organiser], [Month Year]: built Nexus
- Participated in a 24-hour hackathon (BizWa, Problem Statement 02: WhatsApp Business Assistant) · [Result, if any]
- [Other activities, clubs, or roles]
