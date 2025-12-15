import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadsDir = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const logsDir = path.join(__dirname, '..', 'logs');
fs.mkdirSync(logsDir, { recursive: true });
const sessionLogPath = path.join(logsDir, 'session.log');

const upload = multer({ dest: uploadsDir });

function sanitizeFileName(fileName) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function getRequestProtocol(req) {
  const forwardedProto = req.headers['x-forwarded-proto'];

  if (typeof forwardedProto === 'string' && forwardedProto.length > 0) {
    return forwardedProto.split(',')[0].trim();
  }

  return req.protocol;
}

function buildPublicUrl(req, fileName) {
  const protocol = getRequestProtocol(req) || 'https';
  return `${protocol}://${req.get('host')}/uploads/${fileName}`;
}

async function saveBase64File(req, fileName, base64Content) {
  const safeName = `${Date.now()}-${sanitizeFileName(fileName)}`;
  const filePath = path.join(uploadsDir, safeName);
  const [, base64Data = base64Content] = base64Content.split(',');
  const buffer = Buffer.from(base64Data, 'base64');

  await fs.promises.writeFile(filePath, buffer);

  return { filePath, publicUrl: buildPublicUrl(req, safeName) };
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'timed_audio_queue',
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,
});

console.log('DB ENV CONFIG:', {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  hasPassword: !!process.env.DB_PASSWORD,
  dbName: process.env.DB_NAME,
});

const app = express();
const port = process.env.PORT || 3701;
app.set('trust proxy', true);

function getClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];

  if (Array.isArray(forwardedFor) && forwardedFor.length) {
    return forwardedFor[0];
  }

  if (typeof forwardedFor === 'string' && forwardedFor.trim().length > 0) {
    return forwardedFor.split(',')[0].trim();
  }

  return req.ip || req.socket?.remoteAddress || 'unknown';
}

app.use((req, res, next) => {
  const startedAt = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    const ip = getClientIp(req);
    const logLine = `${new Date().toISOString()} | ${ip} | ${req.method} ${req.originalUrl} | ${res.statusCode} | ${durationMs}ms\n`;

    fs.appendFile(sessionLogPath, logLine, (err) => {
      if (err) {
        console.error('Failed to write session log', err);
      }
    });
  });

  next();
});

function toMySqlDateTime(value) {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const pad = (num) => String(num).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

app.use(
  cors({
    origin: 'https://sr.70-60.com',
  }),
);
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true }));

async function enforcePlaybackLimit(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return next();
  }

  const requestedPath = req.originalUrl.split('?')[0];

  try {
    const [rows] = await pool.query(
      'SELECT id, plays_completed, total_plays FROM sounds WHERE file_url LIKE ? LIMIT 1',
      [`%${requestedPath}`],
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      return next();
    }

    const sound = rows[0];
    const playsCompleted = Number(sound.plays_completed) || 0;
    const totalAllowed = Number.isFinite(Number(sound.total_plays)) ? Number(sound.total_plays) : 6;

    if (playsCompleted >= totalAllowed) {
      return res.status(410).send('Playback limit reached');
    }

    const [updateResult] = await pool.query(
      'UPDATE sounds SET plays_completed = plays_completed + 1 WHERE id = ? AND plays_completed < ?',
      [sound.id, totalAllowed],
    );

    if (!updateResult?.affectedRows) {
      return res.status(410).send('Playback limit reached');
    }

    return next();
  } catch (error) {
    console.error('Failed to enforce playback limit', error);
    return res.status(500).send('Failed to serve file');
  }
}

app.use(
  '/uploads',
  enforcePlaybackLimit,
  express.static(uploadsDir, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.webm')) {
        res.type('audio/webm');
      }
    },
  }),
);

function parsePlaybackSpeeds(rawValue) {
  if (rawValue === null || rawValue === undefined) return undefined;

  if (Array.isArray(rawValue)) return rawValue;

  if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim();

    try {
      if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        return JSON.parse(trimmed);
      }
    } catch (error) {
      console.warn('Failed to parse playback_speeds JSON', error);
      return undefined;
    }

    const parts = trimmed.split(',').map((part) => Number.parseFloat(part.trim())).filter(Number.isFinite);
    return parts.length ? parts : undefined;
  }

  return undefined;
}

function mapSoundRow(row) {
  const playbackSpeeds = parsePlaybackSpeeds(row.playback_speeds);

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
    file_content,
    plays_completed = 0,
    total_plays = 6,
    is_playing = 0,
    next_play_at = new Date(),
    playback_speeds,
    duration = null,
  } = req.body;

  try {
    let resolvedFileUrl = file_url;

    if (file_content) {
      const saveResult = await saveBase64File(req, file_name || 'sound', file_content);
      resolvedFileUrl = saveResult.publicUrl;
    }

    if (!file_name || !resolvedFileUrl) {
      return res.status(400).send('file_name and file_url or file_content are required');
    }

    const nextPlayAtValue = toMySqlDateTime(next_play_at ?? new Date());
    if (!nextPlayAtValue) {
      return res.status(400).send('Invalid next_play_at timestamp');
    }

    const playbackSpeedsJson = playback_speeds ? JSON.stringify(playback_speeds) : null;
    await pool.query(
      `INSERT INTO sounds (id, file_name, file_url, plays_completed, total_plays, is_playing, next_play_at, playback_speeds, duration)
       VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?)`,
      [file_name, resolvedFileUrl, plays_completed, total_plays, is_playing ? 1 : 0, nextPlayAtValue, playbackSpeedsJson, duration],
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

  for (const [key, value] of entries) {
    if (key === 'next_play_at') {
      const formatted = toMySqlDateTime(value);
      if (!formatted) {
        return res.status(400).send('Invalid next_play_at timestamp');
      }
    }
  }

  const updates = entries.map(([key]) => `${key} = ?`).join(', ');
  const values = entries.map(([key, value]) => {
    if (keyNeedsJsonStringify(key)) {
      return JSON.stringify(value);
    }
    if (key === 'next_play_at') {
      return toMySqlDateTime(value);
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

  const safeOriginalName = sanitizeFileName(req.file.originalname);
  const finalName = `${req.file.filename}-${safeOriginalName}`;
  const publicUrl = buildPublicUrl(req, finalName);
  const targetPath = path.join(uploadsDir, finalName);

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
    const { publicUrl } = await saveBase64File(req, fileName, fileContent);
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
