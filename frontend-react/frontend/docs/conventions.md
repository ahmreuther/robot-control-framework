# Frontend Conventions

## Naming
- Use `PascalCase` for React component files (example: `WebSocketReceiver.tsx`).
- Use `camelCase` for hooks/utilities (example: `useMethodCall.ts`).
- Avoid underscores in file names.
- Prefer `AddressSpace` spelling consistently (not `Adressspace`).

## Folders
- Keep domain code under `src/features/<feature-name>`.
- Keep cross-cutting state in `src/contexts`.
- Keep reusable app shell wiring in `src/app`.
- Keep websocket parsing/dispatching in `src/features/socket`.

## Imports
- Prefer feature barrel exports (`index.ts`) when importing across folders.
- Keep relative imports short; avoid deep `../../..` chains when a barrel is available.
- Avoid importing from deprecated compatibility folders.

## Migration Notes
- `src/components/Adressspace` is a temporary compatibility layer for viewport-only imports.
- New code must import from `src/features/address-space`.
