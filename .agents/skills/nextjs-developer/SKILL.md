---
name: nextjs-developer
description: 'Use when building Next.js 16+ applications with App Router, server components, or server actions. Invoke to configure route handlers, implement middleware, set up API routes, add streaming SSR, write generateMetadata for SEO, scaffold loading.tsx/error.tsx boundaries, or deploy to Vercel. Triggers on: Next.js, Next.js 16, App Router, RSC, use server, Server Components, Server Actions, React Server Components, generateMetadata, loading.tsx, Next.js, Next.js performance.'
license: MIT
metadata:
  author: https://github.com/AlvaroParker
  version: '3.0.0'
  domain: frontend
  triggers: Next.js, Next.js 16, App Router, Server Components, Server Actions, React Server Components, Next.js, Next.js performance
  role: specialist
  scope: implementation
  output-format: code
  related-skills: typescript-pro
---

# Next.js Developer

Senior Next.js developer with expertise in Next.js 16+ App Router, server components, and full-stack deployment with focus on performance and SEO excellence.

## Next.js 16 Notes

- This is not an older Next.js codebase with familiar assumptions — APIs, conventions, and file structure may differ from earlier versions.
- Before changing Next.js-specific code, read the relevant guide in `node_modules/next/dist/docs/`.
- Heed deprecation notices and prefer current APIs over compatibility-era patterns.

## Core Workflow

1. **Architecture planning** — Define app structure, routes, layouts, rendering strategy
2. **Implement routing** — Create App Router structure with layouts, templates, loading/error states
3. **Data layer** — Set up server components, data fetching, caching, revalidation
4. **Optimize** — Images, fonts, bundles, streaming, edge runtime
5. **Deploy** — Production build, environment setup, monitoring
   - Validate: run `next build` locally, confirm zero type errors, check `NEXT_PUBLIC_*` and server-only env vars are set, run Lighthouse/PageSpeed to confirm Core Web Vitals > 90

## Reference Guide

Load detailed guidance based on context:

| Topic               | Reference                           | Load When                                                                             |
| ------------------- | ----------------------------------- | ------------------------------------------------------------------------------------- |
| App Router          | `references/app-router.md`          | File-based routing, layouts, templates, route groups                                  |
| Server Components   | `references/server-components.md`   | RSC patterns, streaming, client boundaries, useEffect anti-patterns                   |
| Data Fetching       | `references/data-fetching.md`       | fetch, caching, ISR, on-demand revalidation                                           |
| API Implementations | `references/api-implementations.md` | route handlers, `lib/` structure, `safeDbCall`, `ApiError`, `ts-results`, API clients |

## Constraints

### MUST DO (Next.js-specific)

- Use App Router (`app/` directory), never Pages Router (`pages/`)
- Keep components as Server Components by default; add `'use client'` only at the leaf boundary where interactivity is required
- Use native `fetch` with explicit `cache` / `next.revalidate` options — do not rely on implicit caching
- Use `generateMetadata` (or the static `metadata` export) for all SEO — never hardcode `<title>` or `<meta>` tags in JSX
- Optimize every image with `next/image`; never use a plain `<img>` tag for content images
- Use static image imports (`import logo from './logo.png'`) when the image path is known at build time — this gives automatic width/height inference, better optimization, and avoids layout shift. Only use string `src` paths for dynamic or user-provided images.
- Add `loading.tsx` and `error.tsx` at every route segment that performs async data fetching

### Project Organization

- Organize shared logic under `lib/` with subdirectories: `api/`, `const/`, `db/`, `types/`, `util/`
- Prefer `interface` over `type` for object shapes — interfaces give better error messages and are extensible
- Define types alongside Zod schemas using `interface Foo extends z.infer<typeof FooSchema> {}`
- Use `ts-results` (`Result`, `Ok`, `Err`) for error handling instead of try/catch in route handlers and DB calls
- Wrap Prisma calls in a `safeDbCall` function that returns `Result<T, DbError>` (see `references/api-implementations.md`)
- Declare explicit return types on route handlers: `Promise<NextResponse<ApiError> | NextResponse<SuccessType>>`
- Share the `ApiError` interface between server route handlers and client-side API calls
- Mark `lib/db/` files with `import 'server-only'` to prevent accidental client bundling

### MUST NOT DO

- Convert components to Client Components just to access data — fetch server-side first
- Skip `loading.tsx`/`error.tsx` boundaries on async route segments
- Deploy without running `next build` to confirm zero errors
- Use bare try/catch in route handlers — prefer functions that return `Result` values
- Inline Prisma queries directly in route handlers — keep them in `lib/db/*` behind `safeDbCall`

## Code Examples

### Server Component with data fetching and caching

```tsx
// app/products/page.tsx
import { Suspense } from 'react';

async function ProductList() {
  // Revalidate every 60 seconds (ISR)
  const res = await fetch('https://api.example.com/products', {
    next: { revalidate: 60 },
  });
  if (!res.ok) throw new Error('Failed to fetch products');
  const products: Product[] = await res.json();

  return (
    <ul>
      {products.map((p) => (
        <li key={p.id}>{p.name}</li>
      ))}
    </ul>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <ProductList />
    </Suspense>
  );
}
```

### Server Action with form handling and revalidation

```tsx
// app/products/actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { createProduct } from '@/lib/db/products';

export async function createProductAction(formData: FormData) {
  const name = formData.get('name') as string;
  const result = await createProduct({ name });
  if (result.err) {
    throw new Error('Failed to create product');
  }
  revalidatePath('/products');
}

// app/products/new/page.tsx
import { createProductAction } from '../actions';

export default function NewProductPage() {
  return (
    <form action={createProductAction}>
      <input name="name" placeholder="Product name" required />
      <button type="submit">Create</button>
    </form>
  );
}
```

### generateMetadata for dynamic SEO

```tsx
// app/products/[id]/page.tsx
import type { Metadata } from 'next';

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const product = await fetchProduct(params.id);
  return {
    title: product.name,
    description: product.description,
    openGraph: { title: product.name, images: [product.imageUrl] },
  };
}
```

## Output Templates

When implementing Next.js features, provide:

1. App structure (route organization)
2. `lib/` structure: types in `lib/types/`, DB functions in `lib/db/`, API clients in `lib/api/`
3. Layout/page components with proper data fetching
4. Route handlers with explicit return types and `Result`-based error handling
5. Configuration (`next.config.js`, TypeScript)

## Knowledge Reference

Next.js 16+, App Router, React Server Components, Server Actions, Streaming SSR, Partial Prerendering, next/image, next/font, Metadata API, Route Handlers, Middleware, Edge Runtime, Turbopack.
