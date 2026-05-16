require('dotenv').config();
const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { MongoClient } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;

// Access code — set via .env or environment variable
const ACCESS_CODE = process.env.ACCESS_CODE || '1234';

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || '';
let db;

async function connectDB() {
  if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI is not set! Add it to your .env file.');
    console.log('   Get a free connection string at https://www.mongodb.com/atlas');
    process.exit(1);
  }
  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db('linkvault');
    console.log('✅ Connected to MongoDB');

    // Ensure the main document exists
    const existing = await db.collection('data').findOne({ _id: 'main' });
    if (!existing) {
      await db.collection('data').insertOne({
        _id: 'main',
        collections: [],
        deletedLog: []
      });
      console.log('📦 Initialized empty database');
    }
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  }
}

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Helpers ---
async function readData() {
  const doc = await db.collection('data').findOne({ _id: 'main' });
  return doc || { collections: [], deletedLog: [] };
}

async function writeData(update) {
  await db.collection('data').updateOne(
    { _id: 'main' },
    { $set: update }
  );
}

// --- Access code middleware for all modification routes ---
function requireCode(req, res, next) {
  const code = req.headers['x-access-code'] || req.body?._accessCode;
  if (!code || code !== ACCESS_CODE) {
    return res.status(403).json({ error: 'Invalid access code' });
  }
  if (req.body?._accessCode) delete req.body._accessCode;
  next();
}

// ============================
//  API Routes
// ============================

// GET all collections (no code required — read-only)
app.get('/api/collections', async (req, res) => {
  const data = await readData();
  res.json(data.collections);
});

// GET deletion log (no code required — read-only)
app.get('/api/deleted-log', async (req, res) => {
  const data = await readData();
  res.json(data.deletedLog || []);
});

// POST a new collection (requires code)
app.post('/api/collections', requireCode, async (req, res) => {
  const { name, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Collection name is required' });

  const data = await readData();
  const newCollection = {
    id: uuidv4(),
    name,
    color: color || '#e50914',
    items: []
  };
  data.collections.push(newCollection);
  await writeData({ collections: data.collections });
  res.status(201).json(newCollection);
});

// PUT (rename / recolor) a collection (requires code)
app.put('/api/collections/:id', requireCode, async (req, res) => {
  const { id } = req.params;
  const { name, color } = req.body;
  const data = await readData();
  const col = data.collections.find(c => c.id === id);
  if (!col) return res.status(404).json({ error: 'Collection not found' });

  if (name) col.name = name;
  if (color) col.color = color;
  await writeData({ collections: data.collections });
  res.json(col);
});

// DELETE a collection (requires code + logs deletion)
app.delete('/api/collections/:id', requireCode, async (req, res) => {
  const { id } = req.params;
  const data = await readData();
  const idx = data.collections.findIndex(c => c.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Collection not found' });

  const deleted = data.collections[idx];
  data.deletedLog.push({
    id: uuidv4(),
    type: 'collection',
    deletedAt: new Date().toISOString(),
    data: deleted
  });

  data.collections.splice(idx, 1);
  await writeData({ collections: data.collections, deletedLog: data.deletedLog });
  res.json({ success: true });
});

// POST a new item to a collection (requires code)
app.post('/api/collections/:id/items', requireCode, async (req, res) => {
  const { id } = req.params;
  const { title, url, type, description, thumbnail } = req.body;
  if (!title || !url) return res.status(400).json({ error: 'Title and URL are required' });

  const data = await readData();
  const col = data.collections.find(c => c.id === id);
  if (!col) return res.status(404).json({ error: 'Collection not found' });

  const newItem = {
    id: uuidv4(),
    title,
    url,
    type: type || 'link',
    description: description || '',
    thumbnail: thumbnail || '',
    addedAt: new Date().toISOString()
  };
  col.items.push(newItem);
  await writeData({ collections: data.collections });
  res.status(201).json(newItem);
});

// PUT (edit) an item (requires code)
app.put('/api/collections/:colId/items/:itemId', requireCode, async (req, res) => {
  const { colId, itemId } = req.params;
  const { title, url, type, description, thumbnail } = req.body;
  const data = await readData();
  const col = data.collections.find(c => c.id === colId);
  if (!col) return res.status(404).json({ error: 'Collection not found' });

  const item = col.items.find(i => i.id === itemId);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  if (title) item.title = title;
  if (url) item.url = url;
  if (type) item.type = type;
  if (description !== undefined) item.description = description;
  if (thumbnail !== undefined) item.thumbnail = thumbnail;
  await writeData({ collections: data.collections });
  res.json(item);
});

// DELETE an item (requires code + logs deletion)
app.delete('/api/collections/:colId/items/:itemId', requireCode, async (req, res) => {
  const { colId, itemId } = req.params;
  const data = await readData();
  const col = data.collections.find(c => c.id === colId);
  if (!col) return res.status(404).json({ error: 'Collection not found' });

  const idx = col.items.findIndex(i => i.id === itemId);
  if (idx === -1) return res.status(404).json({ error: 'Item not found' });

  const deleted = col.items[idx];
  data.deletedLog.push({
    id: uuidv4(),
    type: 'item',
    collectionName: col.name,
    deletedAt: new Date().toISOString(),
    data: deleted
  });

  col.items.splice(idx, 1);
  await writeData({ collections: data.collections, deletedLog: data.deletedLog });
  res.json({ success: true });
});

// Move item between collections (requires code)
app.post('/api/collections/:colId/items/:itemId/move', requireCode, async (req, res) => {
  const { colId, itemId } = req.params;
  const { targetCollectionId } = req.body;
  const data = await readData();

  const srcCol = data.collections.find(c => c.id === colId);
  const dstCol = data.collections.find(c => c.id === targetCollectionId);
  if (!srcCol || !dstCol) return res.status(404).json({ error: 'Collection not found' });

  const idx = srcCol.items.findIndex(i => i.id === itemId);
  if (idx === -1) return res.status(404).json({ error: 'Item not found' });

  const [item] = srcCol.items.splice(idx, 1);
  dstCol.items.push(item);
  await writeData({ collections: data.collections });
  res.json({ success: true });
});

// Clear the deletion log (requires code)
app.delete('/api/deleted-log', requireCode, async (req, res) => {
  await writeData({ deletedLog: [] });
  res.json({ success: true });
});

// Verify access code
app.post('/api/verify-code', (req, res) => {
  const { code } = req.body;
  if (code === ACCESS_CODE) {
    res.json({ valid: true });
  } else {
    res.status(403).json({ valid: false, error: 'Invalid access code' });
  }
});

// Catch-all → serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server after DB connection
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 LinkVault running at http://localhost:${PORT}`);
    console.log(`🔐 Access code: ${ACCESS_CODE}`);
  });
});
