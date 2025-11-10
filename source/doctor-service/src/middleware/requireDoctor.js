import jwt from 'jsonwebtoken';

export function requireDoctor(req, res, next) {
  try {
    const h = req.headers['authorization'] || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing token' });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.role !== 'doctor') return res.status(403).json({ error: 'Forbidden' });
    req.userId = payload.sub || payload.userId;  
    req.userRole = payload.role;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
