import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { cors } from 'hono/cors'
import rpc from './rpc'

const app = new Hono()

// Enable CORS for development
app.use('/*', cors())

// Mount RPC routes
app.route('/api', rpc)

// Serve static files from the built React app
app.use('/*', serveStatic({ root: './dist' }))

// Fallback to index.html for client-side routing
app.get('*', serveStatic({ path: './dist/index.html' }))

export default {
  port: 3001,
  fetch: app.fetch,
}
