const express = require('express');
const store = require('../db');
const { runChat } = require('../services/chatAgent');
const { badRequest } = require('../http');

const router = express.Router();

router.get('/', async (req, res) => {
  res.json({ messages: await store.listChat(60) });
});

router.post('/', async (req, res) => {
  const message = req.body && req.body.message;
  if (typeof message !== 'string' || !message.trim()) throw badRequest('message is required');
  if (message.length > 4000) throw badRequest('message is too long (max 4000 chars)');

  const userCreatedAt = new Date().toISOString();
  // If the agent fails before changing anything, runChat throws (502) and
  // nothing is stored, so the user can simply resend.
  const result = await runChat(message.trim());
  const userMsg = await store.addChatMessage({ role: 'user', text: message.trim(), createdAt: userCreatedAt });
  const assistantMsg = await store.addChatMessage({ role: 'assistant', text: result.text, actions: result.actions });
  res.json({ messages: [userMsg, assistantMsg], changed: result.changed });
});

router.delete('/', async (req, res) => {
  await store.clearChat();
  res.json({ ok: true });
});

module.exports = router;
