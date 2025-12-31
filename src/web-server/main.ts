import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { cors } from "hono/cors";
import rpc from "./rpc";

const app = new Hono();

app.use("/*", cors());

app.route("/api", rpc);

app.use("/*", serveStatic({ root: "./dist" }));

app.get("*", serveStatic({ path: "./dist/index.html" }));

export default {
  port: 3001,
  fetch: app.fetch
};
