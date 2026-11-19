# Contribuir a Depto

## Desarrollo local

Usa Node.js 24 y pnpm 11. Wrangler simula D1 y R2 en tu equipo, sin una cuenta de Cloudflare.

```bash
pnpm install --frozen-lockfile
cp .dev.vars.example .dev.vars
pnpm auth:secret
```

Guarda la línea `AUTH_SECRET=...` generada en `.env.local` para Next.js. Copia la misma línea en
`.dev.vars`, reemplazando la línea vacía, para el entorno local de Workers. Puedes dejar
`RESEND_API_KEY` vacío para omitir el envío de correos.

```bash
pnpm db:migrate:local
pnpm dev
```

Abre `http://localhost:3000/setup` para crear la cuenta `root`. Crea cuentas `user` desde
**Ajustes → Administrar usuarios** para probar los flujos de gastos. Para probar la compilación en un
entorno local de Workers, usa `pnpm preview`.

## Comprobaciones

Antes de abrir un pull request, ejecuta `pnpm format:check`, `pnpm lint` y `pnpm typecheck`.
Elige las pruebas que cubren el comportamiento que cambiaste.

| Comando                   | Qué comprueba                                        |
| ------------------------- | ---------------------------------------------------- |
| `pnpm test`               | Lógica y componentes con Vitest                      |
| `pnpm test:integration`   | Integraciones con D1 y R2 mediante Miniflare         |
| `pnpm test:e2e`           | Flujos de navegador en escritorio y móvil            |
| `pnpm test:e2e:bootstrap` | Configuración inicial y creación de la cuenta `root` |
| `pnpm build`              | Compilación de producción de Next.js                 |
| `pnpm cf:build`           | Compilación para Cloudflare Workers                  |

Para las pruebas de navegador, instala Chromium con `pnpm exec playwright install chromium` y
detén el servidor local. Las pruebas E2E borran el estado de D1 y R2 en `.wrangler/state`. Usa un
checkout de pruebas si necesitas conservar tus datos de desarrollo.

## Enviar cambios

1. Abre un issue para proponer un cambio grande o reportar un error. Para un error, incluye los pasos
   para reproducirlo y el resultado esperado.
2. Trabaja en una rama desde `main` y mantén el cambio enfocado. Conserva los textos de la interfaz
   en español y usa datos ficticios para las pruebas. Mantén credenciales y datos del hogar fuera de
   los commits.
3. Abre un pull request hacia `main`. Explica qué cambia, por qué y cómo lo verificaste. Si cambias la
   interfaz, incluye capturas cuando ayuden a revisar el cambio. Si cambias el esquema, agrega una
   migración numerada en `migrations/` y comprueba que se puede aplicar a una base existente.

Consulta el [plan de MCP](specs/002-mcp-expense-integration/plan.md) y el
[contrato de Telegram](docs/telegram-conversation-rpc.md) si vas a trabajar en esas integraciones.
