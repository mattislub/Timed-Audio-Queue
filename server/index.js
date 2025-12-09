import express from 'express';
import mysql from 'mysql2/promise';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadsDir = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({ dest: uploadsDir });

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'timed_audio_queue',
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,
});

const app = express();
const port = process.env.PORT || 3001;

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(uploadsDir));

function mapSoundRow(row) {
  let playbackSpeeds;
  try {
    playbackSpeeds = row.playback_speeds ? JSON.parse(row.playback_speeds) : undefined;
  } catch (error) {
    console.warn('Failed to parse playback_speeds JSON', error);
  }

  return {
    ...row,
    playback_speeds: playbackSpeeds,
    is_playing: Boolean(row.is_playing),
  };
}

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (error) {
    console.error('Health check failed', error);
    res.status(500).json({ error: 'Database unavailable' });
  }
});

app.get('/api/sounds', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM sounds ORDER BY created_at DESC');
    res.json(rows.map(mapSoundRow));
  } catch (error) {
    console.error('Failed to fetch sounds', error);
    res.status(500).send('Failed to load sounds');
  }
});

app.post('/api/sounds', async (req, res) => {
  const {
    file_name,
    file_url,
    plays_completed = 0,
    total_plays = 6,
    is_playing = 0,
    next_play_at = new Date(),
    playback_speeds,
    duration = null,
  } = req.body;

  if (!file_name || !file_url) {
    return res.status(400).send('file_name and file_url are required');
  }

  try {
    const playbackSpeedsJson = playback_speeds ? JSON.stringify(playback_speeds) : null;
    await pool.query(
      `INSERT INTO sounds (id, file_name, file_url, plays_completed, total_plays, is_playing, next_play_at, playback_speeds, duration)
       VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?)`,
      [file_name, file_url, plays_completed, total_plays, is_playing ? 1 : 0, next_play_at, playbackSpeedsJson, duration],
    );
    res.status(201).send('Created');
  } catch (error) {
    console.error('Failed to create sound', error);
    res.status(500).send('Failed to create sound');
  }
});

app.patch('/api/sounds/:id', async (req, res) => {
  const { id } = req.params;
  const allowedFields = ['file_name', 'file_url', 'plays_completed', 'total_plays', 'is_playing', 'next_play_at', 'playback_speeds', 'duration'];
  const entries = Object.entries(req.body).filter(([key, value]) => allowedFields.includes(key) && value !== undefined);

  if (!entries.length) {
    return res.status(400).send('No valid fields provided for update');
  }

  const updates = entries.map(([key]) => `${key} = ?`).join(', ');
  const values = entries.map(([key, value]) => {
    if (keyNeedsJsonStringify(key)) {
      return JSON.stringify(value);
    }
    if (keyNeedsBooleanNormalization(key)) {
      return value ? 1 : 0;
    }
    return value;
  });

  function keyNeedsJsonStringify(key) {
    return key === 'playback_speeds';
  }

  function keyNeedsBooleanNormalization(key) {
    return key === 'is_playing';
  }

  try {
    await pool.query(`UPDATE sounds SET ${updates} WHERE id = ?`, [...values, id]);
    res.send('Updated');
  } catch (error) {
    console.error('Failed to update sound', error);
    res.status(500).send('Failed to update sound');
  }
});

app.delete('/api/sounds/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM sounds WHERE id = ?', [req.params.id]);
    res.send('Deleted');
  } catch (error) {
    console.error('Failed to delete sound', error);
    res.status(500).send('Failed to delete sound');
  }
});

app.post('/api/sounds/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('file is required');
  }

  const publicUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}-${req.file.originalname}`;
  const targetPath = path.join(uploadsDir, `${req.file.filename}-${req.file.originalname}`);
  fs.rename(req.file.path, targetPath, (err) => {
    if (err) {
      console.error('Failed to move uploaded file', err);
      return res.status(500).send('Failed to store file');
    }
    return res.status(201).json({ publicUrl });
  });
});

app.post('/api/sounds/upload/base64', async (req, res) => {
  const { fileName, fileContent, duration } = req.body;

  if (!fileName || !fileContent) {
    return res.status(400).send('fileName and fileContent are required');
  }

  try {
    const buffer = Buffer.from(fileContent, 'base64');
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = path.join(uploadsDir, safeName);
    await fs.promises.writeFile(filePath, buffer);
    const publicUrl = `${req.protocol}://${req.get('host')}/uploads/${safeName}`;
    res.status(201).json({ publicUrl, duration });
  } catch (error) {
    console.error('Failed to save base64 file', error);
    res.status(500).send('Failed to save file');
  }
});

app.get('/api/sound-shares', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM sound_shares ORDER BY created_at DESC');
    res.json(rows);
  } catch (error) {
    console.error('Failed to fetch sound shares', error);
    res.status(500).send('Failed to load sound shares');
  }
});

app.post('/api/sound-shares', async (req, res) => {
  const { sound_id, user_email } = req.body;
  if (!sound_id || !user_email) {
    return res.status(400).send('sound_id and user_email are required');
  }

  try {
    await pool.query(
      `INSERT INTO sound_shares (id, sound_id, user_email)
       VALUES (UUID(), ?, ?)`,
      [sound_id, user_email],
    );
    res.status(201).send('Created');
  } catch (error) {
    console.error('Failed to create sound share', error);
    res.status(500).send('Failed to create sound share');
  }
});

app.delete('/api/sound-shares/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM sound_shares WHERE id = ?', [req.params.id]);
    res.send('Deleted');
  } catch (error) {
    console.error('Failed to delete sound share', error);
    res.status(500).send('Failed to delete sound share');
  }
});

app.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`);
});
