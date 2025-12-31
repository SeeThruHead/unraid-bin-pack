import { Hono } from "hono";
import { cors } from "hono/cors";
import { mockDisks, mockPatterns, mockPlanResult } from "./mock-data";

const app = new Hono();

app.use("/*", cors());

const api = new Hono()
  .get("/disks", (c) => c.json(mockDisks))
  .get("/scan-patterns", (c) => c.json(mockPatterns))
  .post("/plan", async (c) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return c.json(mockPlanResult);
  })
  .post("/apply", async (c) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return c.json({ success: true });
  })
  .get("/show", (c) => c.json({ script: mockPlanResult.script }));

app.route("/api", api);

const port = 3001;

console.warn(`🎭 Mock server running at http://localhost:${port}`);
console.warn(`   API endpoints available at http://localhost:${port}/api`);
console.warn(`   Run 'bun run web:dev' in another terminal for the UI`);

export default {
  port,
  fetch: app.fetch
};
