# Web Skill Composition - Frontend

React + TypeScript + Vite with ESLint (type-aware) and Prettier for code quality.

## Setup

```bash
cd frontend
npm install
```

## Available Scripts

- `npm run dev` - Start dev server (HMR enabled)
- `npm run build` - TypeScript check + Vite build
- `npm run preview` - Preview production build
- `npm run typecheck` - Run TypeScript type checking
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Auto-fix ESLint issues
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check if code is formatted

## Development Workflow

1. **Type checking**: Runs on build; check with `npm run typecheck`
2. **Linting**: Type-aware ESLint catches async/promise bugs, unused vars, hook deps
3. **Formatting**: Auto-formats on save (requires Prettier extension) or `npm run format`

### Quick checks before commit

```bash
npm run typecheck
npm run lint
npm run format
```

## Configuration

- **ESLint**: [eslint.config.js](eslint.config.js)
  - Type-aware linting for `.ts/.tsx` files
  - React Hooks validation
  - Import auto-sorting
  - Disables type-checking for `.js` files
- **Prettier**: [.prettierrc](.prettierrc)
  - Single quotes, trailing commas, 100-char width
- **TypeScript**: [tsconfig.json](tsconfig.json)
  - Strict mode, bundler module resolution for Vite

## Notes

- `.prettierrc` and `eslint.config.js` should be committed (shared across team)
- `.tsbuildinfo` is in `.gitignore` (build artifact)
- VS Code: Install [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) extension for format-on-save
