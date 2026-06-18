import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const { default: app } = await import(resolve(__dirname, "../artifacts/api-server/dist/app.mjs"));

export default app;
