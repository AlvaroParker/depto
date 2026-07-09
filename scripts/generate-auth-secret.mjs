import { randomBytes } from "node:crypto";

process.stdout.write(`AUTH_SECRET=${randomBytes(32).toString("base64url")}\n`);
