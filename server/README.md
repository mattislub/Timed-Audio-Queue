# Timed Audio Queue API Server

This Express server exposes the REST endpoints used by the React client to read and write sound metadata stored in MySQL.

## Configuration
Create a `.env` file (or export environment variables) with your database settings:

```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=613Ml!2025
DB_NAME=timed_audio_queue
PORT=3001
```

The defaults match the credentials you provided. The server also writes uploaded files to an `uploads/` folder in the project root and serves them from `/uploads/*`.

## Running locally
Install dependencies and start the API server:

```bash
npm install
npm run server
```

The API will listen on `http://localhost:3001/api` by default.
