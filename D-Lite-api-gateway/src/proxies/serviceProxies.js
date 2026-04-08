import { createProxyMiddleware } from 'http-proxy-middleware'

const buildProxyOptions = (target, serviceName) => ({
  target,
  changeOrigin: true,
  ws: true,

  // Strip the gateway prefix so each service receives routes from its own root.
  pathRewrite: (path) => path.replace(new RegExp(`^/${serviceName}`), ''),

  // The gateway uses `express.json()`, so the incoming request stream is already
  // consumed by the time it reaches this proxy. For methods that typically
  // include a body, we must re-send the parsed body to the upstream service.
  onProxyReq: (proxyReq, req) => {
    const method = String(req.method || '').toUpperCase()
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return

    const body = req.body
    if (!body) return

    const isPlainObject = typeof body === 'object' && body !== null && !Buffer.isBuffer(body)
    const bodyData = Buffer.isBuffer(body) ? body : isPlainObject ? Buffer.from(JSON.stringify(body)) : Buffer.from(String(body))

    if (bodyData.length === 0) return

    proxyReq.setHeader('Content-Length', bodyData.length)
    if (!proxyReq.getHeader('Content-Type')) {
      proxyReq.setHeader('Content-Type', 'application/json')
    }
    proxyReq.write(bodyData)
  },

  onError: (err, _req, res) => {
    console.error(`${serviceName} proxy error:`, err.message)

    if (!res.headersSent) {
      res.status(502).json({
        success: false,
        message: `${serviceName} service is unavailable`,
      })
    }
  },
})

export const createServiceProxy = (target, serviceName) =>
  createProxyMiddleware(buildProxyOptions(target, serviceName))
