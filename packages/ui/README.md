# @swiss/ui

Shared design-system package for Swiss apps.

## What lives here

- `src/styles.css`: Tailwind v4 theme tokens + shared utility/component classes.
- `src/components/*`: Reusable React primitives that encode design rules from `.ai/DESIGN.md`.

## Usage in an app

1. Add dependency:

```json
{
  "dependencies": {
    "@swiss/ui": "workspace:*"
  }
}
```

2. Import shared CSS after Tailwind import in `app/globals.css`:

```css
@import "tailwindcss";
@import "@swiss/ui/styles.css";
```

3. Ensure Next transpiles workspace package in `next.config.ts`:

```ts
transpilePackages: ["@swiss/ui"]
```

4. Use components:

```tsx
import { Button, Card, SecurityChip } from "@swiss/ui";
```
