# React Server Components

## Server Components (Default)

```tsx
// app/page.tsx - Server Component by default
import { db } from '@/lib/db';

export default async function Page() {
  // Data fetching in Server Component
  const users = await db.user.findMany();

  return (
    <div>
      <h1>Users</h1>
      <ul>
        {users.map((user) => (
          <li key={user.id}>{user.name}</li>
        ))}
      </ul>
    </div>
  );
}
```

## Benefits of Server Components

- **Zero bundle size** - Server Components don't add JavaScript to client bundle
- **Direct backend access** - Query databases, read files, use secrets
- **Automatic code splitting** - Only Client Components add to bundle
- **Streaming** - Send UI progressively as data loads
- **No client-side waterfalls** - Fetch all data in parallel on server

## Client Components

```tsx
// components/counter.tsx
'use client'; // Required directive

import { useState } from 'react';

export function Counter() {
  const [count, setCount] = useState(0);

  return <button onClick={() => setCount(count + 1)}>Count: {count}</button>;
}
```

## When to Use Client Components

Use `'use client'` when you need:

- **Interactivity** - onClick, onChange, event handlers
- **State** - useState, useReducer
- **Browser APIs** - localStorage, window, document
- **Custom hooks** - Any hook using client-only features
- **External store subscriptions** - useSyncExternalStore for browser APIs like online status, media queries

Notably absent: `useEffect`. Most things developers reach for `useEffect` to do have better alternatives. See the "Avoiding useEffect" section below.

## Composition Pattern

```tsx
// app/page.tsx - Server Component
import { ClientWrapper } from './client-wrapper';
import { db } from '@/lib/db';

export default async function Page() {
  const data = await db.query();

  return (
    <div>
      {/* Server Component content */}
      <h1>Server Content</h1>

      {/* Pass data to Client Component */}
      <ClientWrapper initialData={data}>
        {/* Server Component as children */}
        <ServerSidebar />
      </ClientWrapper>
    </div>
  );
}

// components/client-wrapper.tsx
('use client');

export function ClientWrapper({
  children,
  initialData,
}: {
  children: React.ReactNode;
  initialData: Data;
}) {
  const [data, setData] = useState(initialData);

  return (
    <div>
      {/* Client Component UI */}
      <button onClick={() => refresh()}>Refresh</button>
      {/* Server Component children */}
      {children}
    </div>
  );
}
```

## Streaming with Suspense

```tsx
// app/page.tsx
import { Suspense } from 'react';
import { SlowComponent } from './slow-component';
import { FastComponent } from './fast-component';

export default function Page() {
  return (
    <div>
      {/* Renders immediately */}
      <FastComponent />

      {/* Shows fallback while loading */}
      <Suspense fallback={<div>Loading...</div>}>
        <SlowComponent />
      </Suspense>
    </div>
  );
}

// components/slow-component.tsx
async function getData() {
  await new Promise((resolve) => setTimeout(resolve, 3000));
  return { data: 'Loaded!' };
}

export async function SlowComponent() {
  const data = await getData();
  return <div>{data.data}</div>;
}
```

## Parallel Data Fetching

```tsx
// app/dashboard/page.tsx
async function getUser() {
  return fetch('https://api.example.com/user');
}

async function getPosts() {
  return fetch('https://api.example.com/posts');
}

export default async function Dashboard() {
  // Fetch in parallel
  const [user, posts] = await Promise.all([getUser(), getPosts()]);

  return (
    <div>
      <UserProfile user={user} />
      <PostsList posts={posts} />
    </div>
  );
}
```

## Sequential Data Fetching

```tsx
// app/artist/[id]/page.tsx
async function getArtist(id: string) {
  return fetch(`https://api.example.com/artists/${id}`);
}

async function getAlbums(artistId: string) {
  return fetch(`https://api.example.com/artists/${artistId}/albums`);
}

export default async function ArtistPage({
  params,
}: {
  params: { id: string };
}) {
  // Sequential: albums depends on artist
  const artist = await getArtist(params.id);
  const albums = await getAlbums(artist.id);

  return (
    <div>
      <h1>{artist.name}</h1>
      <Albums albums={albums} />
    </div>
  );
}
```

## Preloading Data

```tsx
// lib/data.ts
import { cache } from 'react';

export const getUser = cache(async (id: string) => {
  return db.user.findUnique({ where: { id } });
});

// components/user-profile.tsx
export async function UserProfile({ userId }: { userId: string }) {
  const user = await getUser(userId);
  return <div>{user.name}</div>;
}

// app/page.tsx
import { getUser } from '@/lib/data';
import { UserProfile } from '@/components/user-profile';

export default async function Page() {
  // Preload
  getUser('123');

  return (
    <div>
      {/* This will use cached result */}
      <UserProfile userId="123" />
    </div>
  );
}
```

## Server Component Patterns

Use Server Components primarily for reads. For mutations (create, update, delete), prefer calling a shared `lib/api/*` client that talks to an `app/api/**/route.ts` handler — this keeps mutation logic in route handlers where auth, validation, and error handling are centralized, rather than scattering it across server actions.

### Pattern: Layout with Data Fetching

```tsx
// app/dashboard/layout.tsx
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const user = await db.user.findUnique({ where: { id: session.userId } });

  return (
    <div>
      <Sidebar user={user} />
      <main>{children}</main>
    </div>
  );
}
```

### Pattern: Conditional Client Components

```tsx
// app/page.tsx
import { ClientComponent } from './client-component';

export default async function Page() {
  const data = await fetchData();

  // Only render Client Component when needed
  if (data.requiresInteractivity) {
    return <ClientComponent data={data} />;
  }

  return <div>{data.content}</div>;
}
```

### Pattern: Server Component with Client Island

```tsx
// app/blog/[slug]/page.tsx
import { LikeButton } from './like-button';

export default async function BlogPost({
  params,
}: {
  params: { slug: string };
}) {
  const post = await getPost(params.slug);

  return (
    <article>
      {/* Server-rendered content */}
      <h1>{post.title}</h1>
      <div dangerouslySetInnerHTML={{ __html: post.content }} />

      {/* Client island for interactivity */}
      <LikeButton postId={post.id} initialLikes={post.likes} />
    </article>
  );
}
```

## Context in Server/Client Components

```tsx
// app/providers.tsx
'use client';

import { ThemeProvider } from 'next-themes';

export function Providers({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

// app/layout.tsx
import { Providers } from './providers';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

## Third-Party Components

```tsx
// components/carousel-wrapper.tsx
'use client';

import { Carousel } from 'third-party-carousel';

export function CarouselWrapper({ items }: { items: Item[] }) {
  return <Carousel items={items} />;
}

// app/page.tsx
import { CarouselWrapper } from '@/components/carousel-wrapper';

export default async function Page() {
  const items = await fetchItems();
  return <CarouselWrapper items={items} />;
}
```

## Edge Runtime

```tsx
// app/api/route.ts
export const runtime = 'edge';

export async function GET() {
  return new Response('Hello from Edge!');
}

// app/page.tsx
export const runtime = 'edge';

export default async function Page() {
  return <div>Edge-rendered page</div>;
}
```

## Quick Reference

| Capability     | Server Component   | Client Component       |
| -------------- | ------------------ | ---------------------- |
| Data fetching  | ✅ Yes             | ⚠️ Use SWR/React Query |
| Backend access | ✅ Yes (DB, files) | ❌ No                  |
| Event handlers | ❌ No              | ✅ Yes                 |
| State/Effects  | ❌ No              | ✅ Yes                 |
| Browser APIs   | ❌ No              | ✅ Yes                 |
| Bundle size    | 0 KB               | Adds to bundle         |
| Streaming      | ✅ Yes             | ❌ No                  |

## Avoiding useEffect

Most uses of `useEffect` in React applications are unnecessary and introduce bugs — extra render passes, stale state flashes, race conditions, and hard-to-trace data flow. Before reaching for `useEffect`, check if one of these alternatives fits.

### Derive values during render instead of syncing with Effects

If something can be calculated from existing props or state, don't store it in state and sync it with an Effect. Just compute it.

```tsx
// BAD: redundant state + Effect that causes an extra render
const [fullName, setFullName] = useState('');
useEffect(() => {
  setFullName(firstName + ' ' + lastName);
}, [firstName, lastName]);

// GOOD: derive during render
const fullName = firstName + ' ' + lastName;
```

For expensive computations, wrap in `useMemo` instead of caching in state via an Effect:

```tsx
// GOOD: only recomputes when dependencies change
const filteredItems = useMemo(
  () => items.filter((item) => item.category === activeCategory),
  [items, activeCategory],
);
```

### Reset state with `key` instead of Effects

When you need to reset component state because a prop changed (e.g., switching between profiles, conversations), use React's `key` prop to force a remount instead of an Effect that clears state after a stale render.

```tsx
// BAD: renders with stale comment, then clears it
useEffect(() => {
  setComment('');
}, [userId]);

// GOOD: React recreates the component when key changes
<Profile userId={userId} key={userId} />;
```

### Put event-specific logic in event handlers, not Effects

If something should happen in response to a user action (click, submit, drag), it belongs in the event handler — not in an Effect that watches a state variable the handler sets. Effects don't know _what_ the user did, only that state changed.

```tsx
// BAD: notification fires on page load if product was already in cart
useEffect(() => {
  if (product.isInCart) {
    showNotification(`Added ${product.name} to cart!`);
  }
}, [product]);

// GOOD: notification fires only when user clicks
function handleBuyClick() {
  addToCart(product);
  showNotification(`Added ${product.name} to cart!`);
}
```

This applies to POST requests, analytics events tied to actions, and any side effect that should only happen because of a specific user interaction. The rule of thumb: if the code should run because the user _did something_, put it in the event handler. If it should run because the component _appeared on screen_, an Effect is appropriate.

### Avoid Effect chains

Multiple Effects that set state to trigger other Effects create cascading render passes and are fragile to maintain. Instead, calculate the next state in the event handler that starts the chain.

```tsx
// BAD: card → goldCardCount → round → isGameOver, each an Effect
useEffect(() => {
  if (card?.gold) setGoldCardCount((c) => c + 1);
}, [card]);
useEffect(() => {
  if (goldCardCount > 3) {
    setRound((r) => r + 1);
    setGoldCardCount(0);
  }
}, [goldCardCount]);
useEffect(() => {
  if (round > 5) setIsGameOver(true);
}, [round]);

// GOOD: all state transitions in the event handler
function handlePlaceCard(nextCard) {
  setCard(nextCard);
  if (nextCard.gold) {
    if (goldCardCount < 3) {
      setGoldCardCount(goldCardCount + 1);
    } else {
      setGoldCardCount(0);
      setRound(round + 1);
    }
  }
}
const isGameOver = round > 5; // derived, not state
```

### Notify parent components in event handlers, not Effects

When a child needs to notify its parent of a state change, do it in the same event handler that caused the change — not in an Effect that watches the state. This lets React batch both updates into one render pass.

```tsx
// BAD: delayed, causes extra render cycle
useEffect(() => {
  onChange(isOn);
}, [isOn, onChange]);

// GOOD: parent notified in same event
function handleClick() {
  const nextIsOn = !isOn;
  setIsOn(nextIsOn);
  onChange(nextIsOn);
}
```

Even better, consider making the component fully controlled (parent owns the state, child just calls `onChange`).

### Use `useSyncExternalStore` for external subscriptions

For subscribing to browser APIs or external stores (online status, media queries, third-party state managers), use `useSyncExternalStore` instead of manual `useEffect` + `addEventListener` patterns. It handles server rendering and avoids tearing.

```tsx
// BAD: manual subscription management
const [isOnline, setIsOnline] = useState(true);
useEffect(() => {
  const update = () => setIsOnline(navigator.onLine);
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  return () => {
    window.removeEventListener('online', update);
    window.removeEventListener('offline', update);
  };
}, []);

// GOOD: purpose-built hook
function useOnlineStatus() {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('online', cb);
      window.addEventListener('offline', cb);
      return () => {
        window.removeEventListener('online', cb);
        window.removeEventListener('offline', cb);
      };
    },
    () => navigator.onLine,
    () => true, // server snapshot
  );
}
```

### When useEffect IS appropriate

- **Synchronizing with external systems** — WebSocket connections, third-party widget libraries, non-React DOM manipulation
- **Fetching data on mount** — but always include a cleanup function to ignore stale responses, and prefer framework-level data fetching (server components, route loaders) when available
- **Analytics on display** — logging that a component appeared (not that a user did something)
- **One-time app initialization** — with a module-level guard to prevent double-running in Strict Mode

### Quick reference

| You want to...                   | Instead of useEffect, use...                  |
| -------------------------------- | --------------------------------------------- |
| Compute a value from state/props | Derive during render, or `useMemo`            |
| Reset state when a prop changes  | `key` prop on the component                   |
| React to a user action           | Event handler                                 |
| Chain state updates              | Calculate all next state in the event handler |
| Notify parent of state change    | Call parent callback in event handler         |
| Subscribe to external store      | `useSyncExternalStore`                        |
| Fetch data                       | Server Component, or useEffect with cleanup   |

## Best Practices

1. **Default to Server Components** - Only use 'use client' when needed
2. **Move Client Components down** - Push them to leaves of component tree
3. **Pass data down** - Fetch in Server Components, pass to Client Components
4. **Use composition** - Nest Server Components inside Client Components via children
5. **Cache expensive operations** - Use React cache() for deduplication
6. **Avoid useEffect for derived state** - Compute during render or use useMemo
7. **Keep side effects in event handlers** - Only use Effects for synchronization with external systems
