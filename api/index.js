import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appPath = resolve(__dirname, "../artifacts/api-server/dist/app.mjs");
const { default: app } = await import(appPath);

export default app;
