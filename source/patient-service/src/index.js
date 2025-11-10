// source/patient-service/src/index.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

import { connectDB } from './db.js';
import patientRouter from './routes/patient.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();

// CORS identico
app.use(cors({
  origin: ['http://localhost:9000', 'http://localhost:9001', 'http://localhost:9002'],
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));

app.use(express.json());

// (facoltativo) stessa static /files, come nel doctor-service
const UPLOAD_DIR = path.resolve('uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use('/files', express.static(UPLOAD_DIR));

// Routes
app.use('/', patientRouter);

// Health-check (stile uguale)
app.get('/health', async (_req, res) => {
  try {
    const db = await connectDB();
    const cols = await db.listCollections().toArray();
    res.json({ status: 'OK', collections: cols.map(c => c.name) });
  } catch (err) {
    res.status(500).json({ status: 'ERROR', message: err.message });
  }
});

// Home
app.get('/', (_req, res) => {
  res.send('Patient service running');
});

async function start() {
  try {
    await connectDB();
    console.log('✅ Connected to MongoDB Atlas');

    const port = process.env.PORT || 4002; // porta del patient-service
    app.listen(port, () => {
      console.log(`🚀 Patient service listening on http://localhost:${port}`);
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

start();
