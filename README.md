# Fusion Battler

A phone browser game for an AI game jam. Walk around a small 3D world, battle trainers with monster cards, and fuse two cards into a new monster. In the finished game, AI writes each fused monster's name and flavor text and draws its art. Code decides stats, the fusion roll and abilities, and validates everything the AI returns.

Current state: placeholder art and world, mocked names, no AI calls.

## Run it

```
npm install
npm run dev        # game on http://localhost:5180, API on :8787 (Vite proxies /api/)
npm test           # rules tests
npm run sim        # headless balance run, "Always win" off
npm run typecheck
```

Vite listens on your network too, so you can open the game on a phone on the same Wi-Fi.

In dev builds the browser console has `__fusion.battle("vex")` to jump into a fight, plus `__fusion.state` and `__fusion.world()` for inspecting the game.

## Layout

| Folder | What lives there |
|---|---|
| `shared/` | Game rules with no rendering: cards, elements, abilities, battle engine, fusion roll, AI output schema. Used by the client, server, tests and simulator. |
| `client/` | The browser game. `world/` is the Three.js overworld, `battle/` the 2D card battle, `screens/` the deck, reward and fusion screens. |
| `server/` | Hono API. `app.ts` holds the routes, `dev.ts` runs it locally, `ai/` holds the text and image adapters. |
| `api/` | Vercel entry point that hands requests to the Hono app. |
| `scripts/` | Balance simulator, and later art pre-generation. |
| `tests/` | Vitest tests for the rules. |

## Hosting

Vercel. The Vite build is served as static files and `api/index.ts` runs as a Vercel Function. API keys (`ANTHROPIC_API_KEY`, `HIGGSFIELD_API_KEY`) live only in server environment variables; see `.env.example`.
