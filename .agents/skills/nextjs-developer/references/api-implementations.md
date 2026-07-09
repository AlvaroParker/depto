# API Implementations

## Project Structure

Organize shared logic under a `lib/` directory at the project root:

```
lib/
├── api/        # Client-side API calls (browser → route handlers)
├── const/      # Shared constants (roles, config values, limits)
├── db/         # Server-only database access (Prisma wrappers)
├── types/      # Zod schemas and TypeScript interfaces (z.infer<typeof ...>)
└── util/       # Pure utility functions (formatting, parsing, validation)
```

- `lib/db/` files should import `'server-only'` to prevent accidental client bundling
- `lib/types/` holds Zod objects and derived interfaces — prefer `interface` over `type` for object shapes
- `lib/api/` holds fetch-based client functions that return `ApiResult<T>` via a shared client
- `lib/util/` holds small, reusable helpers (capitalize, date formatting, etc.)

## Error Handling Philosophy

Prefer `Result` values (from the `ts-results` library) over try/catch blocks in route handlers. This keeps error paths explicit and composable — each function call returns either `Ok(value)` or `Err(error)`, and the route handler maps those into HTTP responses.

### Shared ApiError Interface

Define a project-level error shape that both server and client code use:

```ts
// lib/types/api.types.ts
export interface ApiError {
  message: string;
  errors?: Record<string, string[] | undefined>;
}
```

This interface is the return type for error responses from route handlers and the error branch of client-side `ApiResult<T>`.

### Database Error Wrapper (safeDbCall)

Wrap Prisma calls in a `safeDbCall` function that catches exceptions and returns typed `Result` values. This avoids scattered try/catch in DB functions and gives route handlers a consistent interface.

```ts
// lib/db/safe-db-call.ts
import 'server-only';

import { Prisma } from '@prisma/client';
import { type Result, Ok, Err } from 'ts-results';

export interface PrismaDbError {
  isPrisma: true;
  error: Prisma.PrismaClientKnownRequestError;
}

export interface UnknownDbError {
  isPrisma: false;
  error: unknown;
}

export type DbError = PrismaDbError | UnknownDbError;

export function dbErrorFromUnknown(error: unknown): DbError {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return { isPrisma: true, error };
  }
  return { isPrisma: false, error };
}

export async function safeDbCall<T>(
  fn: () => Promise<T>,
): Promise<Result<T, DbError>> {
  try {
    return Ok(await fn());
  } catch (error) {
    return Err(dbErrorFromUnknown(error));
  }
}
```

If the project uses a generated Prisma client from a custom output path, adjust the import accordingly (e.g. `from '@/app/generated/prisma/client'`).

## DB Wrapper Functions

Keep database access in `lib/db/*.ts` and return typed `Result` values so route handlers can translate them into HTTP responses without try/catch.

```ts
// lib/db/products.ts
import 'server-only';

import type { Result } from 'ts-results';
import { prisma } from '@/lib/prisma';
import type {
  ProductSummary,
  CreateProductRequest,
} from '@/lib/types/product.types';
import { type DbError, safeDbCall } from '@/lib/db/safe-db-call';

const PRODUCT_SELECT = {
  id: true,
  name: true,
  price: true,
  createdAt: true,
} as const;

function mapProductSummary(product: {
  id: number;
  name: string;
  price: number;
  createdAt: Date;
}): ProductSummary {
  return {
    id: product.id,
    name: product.name,
    price: product.price,
    createdAt: product.createdAt.toISOString(),
  };
}

export async function findProductsByCategory(
  categoryId: number,
): Promise<Result<ProductSummary[], DbError>> {
  return safeDbCall(async () => {
    const products = await prisma.product.findMany({
      where: { categoryId },
      orderBy: { createdAt: 'desc' },
      select: PRODUCT_SELECT,
    });
    return products.map(mapProductSummary);
  });
}

export async function createProduct(
  categoryId: number,
  data: CreateProductRequest,
): Promise<Result<ProductSummary, DbError>> {
  return safeDbCall(async () => {
    const product = await prisma.product.create({
      data: {
        categoryId,
        name: data.name,
        price: data.price,
      },
      select: PRODUCT_SELECT,
    });
    return mapProductSummary(product);
  });
}
```

When the route needs to verify a related entity before writing, import another DB function rather than querying Prisma directly in the handler.

## Route Handler Pattern

Route handlers live in `app/api/**/route.ts` and handle HTTP concerns: auth, query/body parsing, status codes, and response shaping. Database logic stays in `lib/db/*`.

Always declare explicit return types on route handlers so TypeScript catches missing error paths:

```ts
// app/api/v1/products/route.ts
import { auth } from '@/lib/auth';
import { findProductsByCategory, createProduct } from '@/lib/db/products';
import type { ApiError } from '@/lib/types/api.types';
import type {
  CreateProductResponse,
  GetProductsResponse,
} from '@/lib/types/product.types';
import { NextResponse } from 'next/server';
import * as z from 'zod';

const CreateProductBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  price: z.number().positive(),
});

export const GET = auth(async function GET(request): Promise<
  NextResponse<ApiError> | NextResponse<GetProductsResponse>
> {
  const searchParams = new URL(request.url).searchParams;
  const categoryId = Number(searchParams.get('categoryId'));

  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    return NextResponse.json(
      { message: 'categoryId must be a positive integer' },
      { status: 400 },
    );
  }

  const result = await findProductsByCategory(categoryId);
  if (result.err) {
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 },
    );
  }

  return NextResponse.json<GetProductsResponse>({
    products: result.val,
  });
});

export const POST = auth(async function POST(request): Promise<
  NextResponse<ApiError> | NextResponse<CreateProductResponse>
> {
  const body = await request.json().catch(() => null);
  const parsed = CreateProductBodySchema.safeParse(body);

  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.');
      fieldErrors[key] = fieldErrors[key] ?? [];
      fieldErrors[key].push(issue.message);
    }
    return NextResponse.json(
      { message: 'Validation failed', errors: fieldErrors },
      { status: 400 },
    );
  }

  const searchParams = new URL(request.url).searchParams;
  const categoryId = Number(searchParams.get('categoryId'));

  const result = await createProduct(categoryId, parsed.data);
  if (result.err) {
    if (result.val.isPrisma && result.val.error.code === 'P2002') {
      return NextResponse.json(
        { message: 'A product with that name already exists' },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 },
    );
  }

  return NextResponse.json<CreateProductResponse>(
    { product: result.val },
    { status: 201 },
  );
});
```

Key points:

- Map `Result` errors from DB helpers into HTTP responses in the route handler
- Use Zod for body validation with field-level error extraction into the `ApiError` shape
- Check `isPrisma` and Prisma error codes to return meaningful HTTP status codes (e.g. P2002 → 409 conflict)

## Shared API Client

Create a client module in `lib/api/client.ts` that normalizes fetch responses into `ApiResult<T>`, sharing the `ApiError` interface with server-side code. This keeps error handling consistent across the stack.

````ts
// lib/api/client.ts
import { Err, Ok } from 'ts-results';
import type { Result } from 'ts-results';
import type { ApiError as SharedApiError } from '@/lib/types/api.types';

const BaseErrorValues = {
  InvalidPayload: 'Response payload is not valid JSON',
  NotFound: 'Resource not found',
  MissingToken: 'Token is required',
  HTTPError: 'Request failed with HTTP error',
  RequestError: 'There was an error with the request',
  UnexpectedError: 'An unexpected error occurred',
  Unauthorized: 'Unauthorized error',
} as const;

export type BaseError = (typeof BaseErrorValues)[keyof typeof BaseErrorValues];

export const BaseError = {
  ...BaseErrorValues,
  fromHttpStatus: (status: number): BaseError => {
    switch (status) {
      case 400:
        return BaseError.InvalidPayload;
      case 401:
        return BaseError.Unauthorized;
      case 404:
        return BaseError.NotFound;
      default:
        return BaseError.HTTPError;
    }
  },
} as const;

export type ApiError = SharedApiError;
export type ApiResult<T> = Result<T, ApiError>;

export const apiFetch = async (
  path: string,
  init?: RequestInit,
): Promise<Response> => {
  return fetch(path, init);
};

const parseJsonSafely = async (response: Response): Promise<unknown> => {
  const contentType = response.headers.get('content-type');
  if (!contentType?.includes('application/json')) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const hasMessage = (payload: unknown): payload is { message: string } => {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    typeof (payload as { message?: unknown }).message === 'string'
  );
};

/**
 * Normalizes API responses into `ApiResult<T>` with shared HTTP/network
 * error handling. Use `{ returnBody: true }` to parse the JSON response,
 * or `{ returnBody: false }` for fire-and-forget mutations.
 *
 * @example
 * ```ts
 * export const getProducts = async (
 *   categoryId: number,
 *   signal?: AbortSignal,
 * ): Promise<ApiResult<GetProductsResponse>> => {
 *   return handleErrorResponse<GetProductsResponse>(
 *     apiFetch(`/api/v1/products?categoryId=${categoryId}`, {
 *       method: 'GET',
 *       credentials: 'include',
 *       signal,
 *     }),
 *     { returnBody: true },
 *   );
 * };
 * ```
 */
export async function handleErrorResponse<T>(
  promise: Promise<Response>,
  handleOptions: { returnBody: true },
): Promise<ApiResult<T>>;
export async function handleErrorResponse(
  promise: Promise<Response>,
  handleOptions: { returnBody: false },
): Promise<ApiResult<true>>;
export async function handleErrorResponse<T>(
  promise: Promise<Response>,
  handleOptions: { returnBody?: boolean } = { returnBody: true },
): Promise<ApiResult<T | true>> {
  try {
    const response = await promise;

    if (response.ok) {
      if (!handleOptions.returnBody) return Ok(true);

      const payload = await parseJsonSafely(response);
      if (payload === null) {
        return Err({ message: BaseError.InvalidPayload });
      }
      return Ok(payload as T);
    }

    const errorPayload = await parseJsonSafely(response);
    return Err({
      message: hasMessage(errorPayload)
        ? errorPayload.message
        : BaseError.fromHttpStatus(response.status),
    });
  } catch (error) {
    if (error instanceof TypeError) {
      return Err({ message: BaseError.RequestError });
    }
    return Err({ message: BaseError.UnexpectedError });
  }
}
````

### Per-Resource API Client Example

```ts
// lib/api/products.ts
import {
  apiFetch,
  handleErrorResponse,
  type ApiResult,
} from '@/lib/api/client';
import type {
  CreateProductRequest,
  CreateProductResponse,
  GetProductsResponse,
} from '@/lib/types/product.types';

export async function getProducts(
  categoryId: number,
  signal?: AbortSignal,
): Promise<ApiResult<GetProductsResponse>> {
  return handleErrorResponse<GetProductsResponse>(
    apiFetch(`/api/v1/products?categoryId=${categoryId}`, {
      method: 'GET',
      credentials: 'include',
      signal,
    }),
    { returnBody: true },
  );
}

export async function createProduct(
  categoryId: number,
  data: CreateProductRequest,
): Promise<ApiResult<CreateProductResponse>> {
  return handleErrorResponse<CreateProductResponse>(
    apiFetch(`/api/v1/products?categoryId=${categoryId}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
    { returnBody: true },
  );
}
```

## Type Definitions

Define Zod schemas alongside their inferred interfaces in `lib/types/`:

```ts
// lib/types/product.types.ts
import * as z from 'zod';

export const ProductSummarySchema = z.object({
  id: z.number(),
  name: z.string(),
  price: z.number(),
  createdAt: z.string(),
});

export interface ProductSummary extends z.infer<typeof ProductSummarySchema> {}

export const CreateProductRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  price: z.number().positive(),
});

export interface CreateProductRequest extends z.infer<
  typeof CreateProductRequestSchema
> {}

export interface GetProductsResponse {
  products: ProductSummary[];
}

export interface CreateProductResponse {
  product: ProductSummary;
}
```

Prefer `interface extends z.infer<typeof Schema>` over bare `type = z.infer<typeof Schema>` — interfaces give better error messages and are more extensible.

## Implementation Summary

- Keep Prisma access in `lib/db/*` behind `safeDbCall`, never inline in route handlers
- Route handlers map `Result` errors into HTTP responses with the shared `ApiError` shape
- Client-side calls go through `lib/api/client.ts` and return `ApiResult<T>`
- Both server and client share the same `ApiError` interface from `lib/types/api.types.ts`
- Use `interface` over `type` for object shapes
- Validate request bodies with Zod and extract field-level errors into `ApiError.errors`
