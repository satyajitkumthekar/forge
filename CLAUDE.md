# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Forge is a nutrition tracking app built with React Native + Expo (SDK 54), deployed primarily as a web PWA on Vercel. Backend is Supabase (Postgres, Auth, Edge Functions). AI features use OpenAI GPT-4o via server-side Supabase Edge Functions only.

## Commands

```bash
npm start          # Start Expo dev server
npm run web        # Start web dev server
npm run ios        # Start iOS dev server
npm run android    # Start Android dev server
npm run build      # Production web export (npx expo export --platform web)
```

No test framework is configured.

```bash
npm run lint       # biome lint (errors only)
npm run format     # biome format --write (auto-format all files)
npm run check      # biome check --write (lint + format + organize imports)
npm run typecheck  # tsc --noEmit (type-check without emitting)
```

## Architecture

### Routing

File-based routing via Expo Router. `app/_layout.tsx` handles auth protection:
- Unauthenticated → `/sign-in`
- Authenticated, no access → `/waitlist`
- Authenticated with access → `/(tabs)`

Admin users (account_type `'admin'`) get an extra Admin tab.

### Strict Abstraction Layer

Components must NEVER call Supabase or OpenAI directly. All calls go through `lib/`:

- **`lib/database.ts`** — All DB operations via `db.food.*`, `db.settings.*`, `db.rateLimit.*`, `db.access.*`, `db.feedback.*`, `db.analytics.*`, `db.admin.*`
- **`lib/api.ts`** — All external API calls via `api.analyzeFood()`, `api.askCoach()`, `api.analyzeMealCoaching()`
- **`lib/enhanced-cache.ts`** — Two-layer cache (L1 in-memory Map + L2 MMKV/localStorage), stale-while-revalidate pattern
- **`types/index.ts`** — Single source of truth for all TypeScript interfaces

### Platform-Specific Files

Metro resolves `.web.ts` over `.ts` for web builds:
- `lib/supabase.ts` (AsyncStorage) vs `lib/supabase.web.ts` (localStorage)
- `lib/cache.ts` (MMKV) vs `lib/cache.web.ts` (localStorage)

### Edge Functions (Deno)

Located in `supabase/functions/<name>/index.ts`. Each function must:
- Validate JWT auth header
- Check rate limits server-side via RPC
- Handle CORS preflight (`OPTIONS`)
- Never expose the OpenAI API key to the client

### Offline Support

`utils/offline-queue.ts` queues operations when offline, replays on reconnect.

## Conventions

- **TypeScript strict mode** with `@/` path alias for absolute imports (never relative)
- **Styling**: Tailwind CSS classes for web components (`className`), Gluestack UI for native-first components. Design constants live in `lib/design-tokens.ts`
- **Dates**: Stored/compared as UTC `YYYY-MM-DD` strings. Week starts Monday. 3 AM local-time cutoff for "smart" current-day detection
- **Naming**: `PascalCase.tsx` for components, `kebab-case.ts` for utilities. Singleton objects lowercase (`db`, `api`, `cache`)
- **Components**: Default exports for screens/components, named exports for utilities/hooks
- **DB access**: All Supabase RPC functions via `.rpc('function_name', { args })`. Admin RPCs prefixed `admin_*`
- **Environment variables**: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (client), `OPENAI_API_KEY` (edge functions only)
