# La cuenta de la casa

Depto es una aplicación privada para llevar los gastos compartidos de un hogar en pesos chilenos
(CLP).

- **Web**. Registra gastos, elige quién participa en cada uno, divide el monto, adjunta comprobantes
  y lleva el estado de los reembolsos.
- **MCP**. Conecta un asistente compatible mediante OAuth para gestionar gastos y pagos propios,
  consultar tu saldo y comparar gastos entre períodos.
- **Telegram**. Conecta un bot privado para registrar gastos con comprobantes opcionales y consultar
  deudas y saldos desde el chat.

## Despliegue en Cloudflare

Necesitas una cuenta de Cloudflare con Workers, D1 y R2 habilitados, Node.js 24 y pnpm 11. Workers
ejecuta la aplicación Next.js mediante OpenNext, D1 guarda los datos del hogar y un bucket privado de
R2 guarda los comprobantes. Resend es opcional y envía avisos por correo cuando se registra un gasto.

### 1. Crea los recursos

Clona el repositorio y ejecuta estos comandos desde su raíz. Si ya tienes la base o el bucket, puedes
usar los recursos existentes de tu instalación.

```bash
pnpm install --frozen-lockfile
pnpm exec wrangler login
pnpm exec wrangler d1 create expenses-db --update-config=false
pnpm exec wrangler r2 bucket create expenses-receipts --update-config=false
```

### 2. Configura el Worker

Edita [`wrangler.jsonc`](wrangler.jsonc) para tu cuenta.

- **D1**. Sustituye `database_id` por el ID que devolvió Wrangler. Conserva `DB` como nombre del
  binding y `migrations` como directorio de migraciones. Usa `expenses-db` como nombre de la base
  para ejecutar los comandos de este README tal como están escritos.
- **R2**. Usa el nombre de tu bucket en `bucket_name` y conserva el binding `RECEIPTS`. Mantén el
  bucket privado. Puedes eliminar `preview_bucket_name` si no utilizas un bucket de pruebas separado.
- **URL pública**. Reemplaza el dominio en `routes` por un subdominio de una zona de tu cuenta. Para
  usar `workers.dev`, elimina `routes`, activa `workers_dev` y habilita tu subdominio `workers.dev`
  en Cloudflare. Pon la URL base HTTPS, sin barra final, en `vars.APP_BASE_URL`.
- **Nombre del Worker**. Si cambias `name`, cambia también `service` en `WORKER_SELF_REFERENCE` para
  que ambos coincidan.
- **Correo**. Si usas Resend, verifica tu dominio remitente y configura `vars.RESEND_FROM_EMAIL`. Si
  prescindes del correo, elimina `RESEND_API_KEY` de `secrets.required`.

### 3. Aplica las migraciones y publica

Ejecuta `pnpm auth:secret` y guarda la línea `AUTH_SECRET=...` que genera en un archivo `.env.deploy`
en la raíz del repositorio. Si usas Resend, añade una segunda línea `RESEND_API_KEY=...`. Mantén ese
archivo fuera de Git.

```bash
pnpm db:migrate:remote
pnpm deploy --secrets-file=.env.deploy
```

En una instalación nueva, abre `/setup` en tu URL pública apenas termine el despliegue y crea la
cuenta `root`. Desde **Ajustes → Administrar usuarios**, crea una cuenta `user` por integrante, con
su correo. Usa esas cuentas para gestionar los gastos desde la web.

En despliegues posteriores, vuelve a aplicar las migraciones con `pnpm db:migrate:remote` antes de
ejecutar `pnpm deploy`. El Worker conserva los secretos ya configurados.

## Activar las integraciones

- **MCP**. Añade `https://tu-dominio/mcp` en un cliente compatible con Streamable HTTP y OAuth.
  Inicia sesión con una cuenta `user` y concede los permisos solicitados. Puedes revocarlos en
  **Ajustes → Aplicaciones conectadas**. [Guía de MCP](specs/002-mcp-expense-integration/quickstart.md)
- **Telegram**. Despliega la aplicación primero. Configura un Worker separado para tu bot con un
  binding de servicio que apunte al Worker de Depto y al entrypoint `TelegramExpenses`. Cada usuario
  que quiera usar el bot debe guardar su propio ID numérico en **Ajustes → Telegram**.
  [Contrato de integración](docs/telegram-conversation-rpc.md)

## Contribuciones y licencia

Consulta la [guía de contribución](CONTRIBUTING.md) para ejecutar y probar el proyecto en local.
Depto se distribuye bajo la [licencia MIT](LICENSE).
