import express from 'express';
import { connectDB } from '../db.js';
import { ObjectId } from 'mongodb';
import { requireDoctor } from '../middleware/auth.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';


const router = express.Router();

// Register
router.post('/register', async (req, res) => {
  const { email, password, role, name, age } = req.body;
  try {
    const db = await connectDB();
    const users = db.collection('users');

    const hash = await bcrypt.hash(password, 10);

    const result = await users.insertOne({ email, password: hash, role, name, age });
    const token = jwt.sign(
      { userId: result.insertedId.toHexString(), role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );
    res.json({ token });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Email already in use' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const db = await connectDB();
    const users = db.collection('users');

    const user = await users.findOne({ email });
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    const token = jwt.sign(
      { userId: user._id.toHexString(), role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({ token, role: user.role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Missing token' });

    const token = authHeader.split(' ')[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const db = await connectDB();
    const users = db.collection('users');
    const user = await users.findOne({ _id: new ObjectId(payload.userId) });

    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({
      email: user.email,
      role: user.role,
      name: user.name,
      age: user.age
    });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});


export default router;
