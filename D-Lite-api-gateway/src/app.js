import express from 'express'
import cors from 'cors'
import env from './config/env.js'
import { requestLogger } from './middleware/logger.js'
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'
import { createServiceProxy } from './proxies/serviceProxies.js'

const app = express()

app.use(
  cors({
    origin: env.corsOrigin,
  })
)
app.use(requestLogger)

app.get('/', (_req, res) => {
  res.json({
    success: true,
    message: 'D-Lite API Gateway is running',
    services: {
      auth: '/auth',
      chat: '/chat',
      call: '/call',
      media: '/media',
    },
  })
})

app.get('/health', (_req, res) => {
  res.json({
    success: true,
    service: 'api-gateway',
    status: 'ok',
  })
})

app.use('/auth', createServiceProxy(env.authServiceUrl, 'auth'))
app.use('/chat', createServiceProxy(env.chatServiceUrl, 'chat'))
app.use('/call', createServiceProxy(env.callServiceUrl, 'call'))
app.use('/media', createServiceProxy(env.mediaServiceUrl, 'media'))

// Only parse JSON for routes handled by the gateway itself.
// Proxied routes must receive the original request stream.
app.use(express.json())

app.use(notFoundHandler)
app.use(errorHandler)

export default app
