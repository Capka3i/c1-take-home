import express from 'express';
import { loginByName } from '../services/users.ts';

export const usersRouter = express.Router();

usersRouter.post('/login', async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name is required' });

  res.json(await loginByName(name));
});
