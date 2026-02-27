# CLAUDE.md

## Project Overview

This is **NYC Coffee**, an AI voice cashier web app for a busy NYC coffee shop. It has three views: Customer ordering (chat/voice), Barista ticket queue, and Owner analytics dashboard.

## Key Files

- `PRD.md` — Full product requirements, menu data, pricing, business rules, edge cases, and AI system prompt. **Always refer to this as the source of truth.**

## Tech Stack

- **Framework:** Next.js (App Router) with Tailwind CSS
- **Database:** Supabase (PostgreSQL) — all order data must persist across sessions/reloads
- **LLM:** Anthropic Claude API (claude-sonnet-4-20250514) — powers the AI cashier
- **Speech-to-Text / TTS:** Browser Web Speech API
- **Hosting:** Vercel

## Architecture Rules

- All three views share the same Supabase database
- API keys go in `.env.local` (never commit to git)
- The AI cashier outputs a JSON block (wrapped in ```order``` tags) when the customer confirms their order — the frontend parses this to create the order in Supabase
- Orders flow: Customer View creates them → Barista View displays and updates status → Dashboard View aggregates for analytics

## Routes

- `/` — Customer ordering view (chat + voice)
- `/barista` — Barista ticket queue
- `/dashboard` — Owner analytics dashboard

## Important Business Rules (see PRD.md Section 6 for full list)

- Cold Brew and Frappuccino are ICED ONLY
- Max 5 extra espresso shots per drink
- "Latte with no espresso" = reject (that's just milk)
- Extra matcha only on Matcha Latte
- Default: Small, Whole Milk, Normal sweetness, Normal ice
- NYC sales tax: 8.875%
- No payment processing needed

## Code Style

- Use TypeScript
- Keep components modular — separate files for chat, receipt, ticket card, dashboard charts
- Use Supabase client library (`@supabase/supabase-js`) for all database operations
- Handle loading and error states in all views
