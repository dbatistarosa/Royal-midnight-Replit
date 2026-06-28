import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

// Merges vite.config.ts so tests resolve the same "@"/"@assets" aliases as the
// app itself. No DOM-rendering tests exist yet, so the default "node" test
// environment is used — switch to "jsdom" (and add it as a devDependency)
// when the first component test is added. passWithNoTests keeps CI green
// until that first frontend test file exists.
export default mergeConfig(viteConfig, defineConfig({ test: { passWithNoTests: true } }));
