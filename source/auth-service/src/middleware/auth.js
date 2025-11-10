// src/middleware/auth.js
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

export function requireDoctor(req, res, next) {
  const auth = req.headers.authorization?.split(' ')[1];
  if (!auth) return res.status(401).json({ error: 'Missing token' });
  try {
    const payload = jwt.verify(auth, process.env.JWT_SECRET);
    if (payload.role !== 'doctor') return res.status(403).json({ error: 'Forbidden' });
    req.userId = payload.userId;
    console.log(req.userId)
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
}
