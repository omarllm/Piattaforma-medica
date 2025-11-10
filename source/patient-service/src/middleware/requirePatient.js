import jwt from 'jsonwebtoken';

export function requirePatient(req, res, next) {
  try {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing token' });

    const p = jwt.verify(token, process.env.JWT_SECRET);
    if (p.role !== 'patient') return res.status(403).json({ error: 'Forbidden' });

    req.userId   = p.sub || p.userId;
    req.userRole = p.role; // utile per /me
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
