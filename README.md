# La cuenta de la casa

Aplicación privada y móvil para que un hogar registre gastos compartidos, elija quién participa en cada compra, divida cada monto exactamente, adjunte comprobantes y lleve los reembolsos al día.

## Stack

- Next.js 16 App Router, React 19, TypeScript y Tailwind CSS 4
- Auth.js v5 Credentials con sesiones JWT
- RBAC con roles `root`, `admin` y `user`
- Cloudflare D1 para usuarios, gastos, partes y estados
- Cloudflare R2 privado para JPG, PNG, WebP y PDF de hasta 10 MB
- Resend para avisar por correo a quienes participan en un gasto nuevo
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

Cada cuenta creada con rol `user` requiere un correo y genera automáticamente su participante. Las
cuentas `root` y `admin` administran accesos, pero no participan en gastos. Si `RESEND_API_KEY` está
vacío en desarrollo, el gasto se crea normalmente y el envío se omite.

## Comandos

| Comando                   | Propósito                                                 |
| ------------------------- | --------------------------------------------------------- |
| `pnpm run init`           | Borra D1/R2 local, migra y abre preview en `0.0.0.0:3000` |
| `pnpm dev`                | Desarrollo Next.js con bindings locales                   |
| `pnpm db:migrate:local`   | Aplica migraciones D1 locales                             |
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

El suite E2E genera claves efímeras en memoria, reinicia `.wrangler/state` y crea sus usuarios mediante la API de administración. En Arch Linux, Chromium puede requerir las bibliotecas gráficas/accesibilidad estándar del sistema.

`pnpm run init` es destructivo: elimina todo el estado local de Wrangler, incluidos D1 y R2. No
afecta recursos remotos de Cloudflare.

## Recursos remotos y despliegue

1. Crea una base D1 y un bucket R2 privados en Cloudflare.
2. Reemplaza solamente para tu entorno los identificadores de ejemplo en `wrangler.jsonc`; no confirmes identificadores de producción.
3. Verifica `depto.parker.ci` como dominio remitente en Resend.
4. Configura `AUTH_SECRET` y `RESEND_API_KEY` con `wrangler secret put NOMBRE_DEL_SECRETO`.
5. Ejecuta `pnpm db:migrate:remote`.
6. Valida con `pnpm preview` y despliega con `pnpm deploy`.
7. Abre el despliegue inmediatamente y completa `/setup` para crear el usuario root.

## Roles y administración

- `root`: existe exactamente uno, no se puede eliminar, desactivar ni degradar.
- `admin`: puede crear y eliminar otros administradores y usuarios regulares, y actualizar el
  nombre visible, usuario y contraseña de las cuentas con rol `user`.
- `user`: usa los flujos de gastos, comprobantes y reembolsos, sin administrar accesos.

Al crear un gasto, cada participante seleccionado que tenga correo recibe un mensaje individual de
`info@depto.parker.ci` con el total, pagador, fecha, su parte exacta y el enlace privado al detalle.
Una falla temporal de Resend no revierte el gasto ya guardado.

Cada cuenta tiene un solo rol jerárquico. Combinar roles no agrega permisos y haría ambiguas las garantías del único root. “Eliminar” una cuenta desactiva su acceso y conserva sus referencias históricas para auditoría.

El bucket no tiene URL pública. Los comprobantes de compra y de pago se leen únicamente por rutas
autenticadas. Cada usuario regular puede marcar y respaldar solamente su propia parte; root y admin
pueden corregir cualquier reembolso. El comprobante de pago es opcional, acepta JPG, PNG o WebP de
hasta 10 MB y puede ser visto por cualquier integrante autenticado. Volver una parte a pendiente
elimina su comprobante; la eliminación lógica del gasto lo conserva de forma inaccesible para auditoría.

## Correctitud financiera

Los montos se almacenan como enteros CLP. Cada gasto crea una parte por participante seleccionado dentro de un `D1.batch()`: base `floor(monto / cantidad)` y los pesos restantes se asignan en el orden estable de participantes. Agregar un usuario no modifica las partes de gastos anteriores. Cambiar monto, pagador o participantes reinicia estados pagados solamente después de confirmación explícita.

La especificación, modelo, contrato OpenAPI y plan ejecutable están en [`specs/001-shared-expense-tracker`](specs/001-shared-expense-tracker/).
