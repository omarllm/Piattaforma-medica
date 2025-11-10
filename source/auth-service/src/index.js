// src/index.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';  
import { connectDB } from './db.js';    // la tua funzione di connessione a MongoDB
import authRouter from './routes/auth.js';

dotenv.config();

const app = express();

app.use(cors({
  origin: ['http://localhost:9000','http://localhost:9001', 'http://localhost:9002'],
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));

// per leggere JSON nel body delle richieste
app.use(express.json());

app.use('/', authRouter);

// Health-check per verificare la connessione al DB
app.get('/health', async (req, res) => {
  try {
    const db = await connectDB();
    // lista delle collezioni per confermare l’accesso
    const cols = await db.listCollections().toArray();
    return res.json({ status: 'OK', collections: cols.map(c => c.name) });
  } catch (err) {
    return res.status(500).json({ status: 'ERROR', message: err.message });
  }
});

// tua endpoint “home” attuale
app.get('/', (req, res) => {
  res.send('Welcome to a terrible Docker tutorial');
});

async function start() {
  try {
    // 1) Connessione a MongoDB Atlas
    await connectDB();
    console.log('✅ Connected to MongoDB Atlas');

    // 2) Avvia Express solo dopo che il DB è pronto
    const port = process.env.PORT || 4000;
    app.listen(port, () => {
      console.log(`🚀 Server listening on http://localhost:${port}`);
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

start();
