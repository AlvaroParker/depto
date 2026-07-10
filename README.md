# La cuenta de la casa

Aplicación privada y móvil para que Alvaro, Camila y Trinidad registren gastos compartidos, dividan cada monto exactamente, adjunten comprobantes y lleven los reembolsos al día.

## Stack

- Next.js 16 App Router, React 19, TypeScript y Tailwind CSS 4
- Auth.js v5 Credentials con sesiones JWT
- RBAC con roles `root`, `admin` y `user`
- Cloudflare D1 para usuarios, gastos, partes y estados
- Cloudflare R2 privado para JPG, PNG, WebP y PDF de hasta 10 MB
- OpenNext para ejecutar Next.js en Cloudflare Workers
- Vitest + Miniflare y Playwright

Wrangler/Miniflare simula D1 y R2 localmente y persiste su estado en `.wrangler/state`; no se necesita Docker.

## Requisitos

- Node.js 20 o posterior
- pnpm 11 (`corepack enable` si no está disponible)
- Una cuenta de Cloudflare solamente para preview/deploy remoto

## Inicio local

```bash
pnpm install
cp .dev.vars.example .dev.vars
pnpm auth:secret
```

Copia el valor generado en `AUTH_SECRET` dentro de `.env` o `.dev.vars`. Luego crea la base local:

```bash
pnpm db:migrate:local
pnpm dev
```

Abre `http://localhost:3000`. En una base nueva, la aplicación redirige a `/setup` para crear el único usuario `root`. Después, root puede crear administradores y usuarios desde **Ajustes → Administrar usuarios**. `pnpm db:reset:local` elimina solamente el estado simulado local y vuelve a aplicar migraciones.

`pnpm db:seed:local` sigue disponible como ayuda de desarrollo: crea a Alvaro, Camila y Trinidad como usuarios regulares usando las variables `SEED_PASSWORD_*`. El root siempre se crea mediante el bootstrap; solamente el suite E2E promueve su fixture desechable de Alvaro a root.

## Comandos

| Comando                   | Propósito                                                 |
| ------------------------- | --------------------------------------------------------- |
| `pnpm dev`                | Desarrollo Next.js con bindings locales                   |
| `pnpm db:migrate:local`   | Aplica migraciones D1 locales                             |
| `pnpm db:seed:local`      | Crea/actualiza usuarios desde variables de entorno        |
| `pnpm test`               | Pruebas unitarias                                         |
| `pnpm test:integration`   | D1/R2 realistas mediante Miniflare                        |
| `pnpm test:e2e`           | Journeys de escritorio y móvil; usa una base local limpia |
| `pnpm test:e2e:bootstrap` | Journey aislado de primera instalación y creación de root |
| `pnpm format:check`       | Verifica Prettier                                         |
| `pnpm lint`               | Ejecuta ESLint                                            |
| `pnpm typecheck`          | Verifica TypeScript estricto                              |
| `pnpm build`              | Build de producción Next.js                               |
| `pnpm cf:build`           | Build OpenNext para Cloudflare Workers                    |
| `pnpm preview`            | Build OpenNext y preview en Workers local                 |

El suite E2E genera claves efímeras en memoria, reinicia `.wrangler/state` y siembra usuarios automáticamente. En Arch Linux, Chromium puede requerir las bibliotecas gráficas/accesibilidad estándar del sistema.

## Recursos remotos y despliegue

1. Crea una base D1 y un bucket R2 privados en Cloudflare.
2. Reemplaza solamente para tu entorno los identificadores de ejemplo en `wrangler.jsonc`; no confirmes identificadores de producción.
3. Configura `AUTH_SECRET` con `wrangler secret put AUTH_SECRET`.
4. Ejecuta `pnpm db:migrate:remote`.
5. Valida con `pnpm preview` y despliega con `pnpm deploy`.
6. Abre el despliegue inmediatamente y completa `/setup` para crear el usuario root.

## Roles y administración

- `root`: existe exactamente uno, no se puede eliminar, desactivar ni degradar.
- `admin`: puede crear y eliminar otros administradores y usuarios regulares, y actualizar el
  nombre visible, usuario y contraseña de las cuentas con rol `user`.
- `user`: usa los flujos de gastos, comprobantes y reembolsos, sin administrar accesos.

Cada cuenta tiene un solo rol jerárquico. Combinar roles no agrega permisos y haría ambiguas las garantías del único root. “Eliminar” una cuenta desactiva su acceso y conserva sus referencias históricas para auditoría.

El bucket no tiene URL pública. Todos los comprobantes se leen a través de una ruta autenticada asociada a un gasto activo. Las eliminaciones de gastos son lógicas y conservan el objeto para auditoría.

## Correctitud financiera

Los montos se almacenan como enteros CLP. Cada gasto crea tres partes dentro de un `D1.batch()`: base `floor(monto / 3)` y los pesos restantes se asignan en orden Alvaro, Camila, Trinidad. Por ejemplo, $10.000 queda en $3.334, $3.333 y $3.333. Cambiar monto o pagador reinicia estados pagados solamente después de confirmación explícita.

La especificación, modelo, contrato OpenAPI y plan ejecutable están en [`specs/001-shared-expense-tracker`](specs/001-shared-expense-tracker/).
