import express from 'express'
import { getMessages } from '../controllers/messageController.js'
import { requireAuth } from '../middleware/authMiddleware.js'

const router = express.Router()

router.get('/messages/:chatId', requireAuth, getMessages)

export default router
