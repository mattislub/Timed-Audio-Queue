# Audio Queue - Recording and Playback Application

This project includes two complete implementations for recording, managing, and sharing audio:

## 1. PWA (Progressive Web App) - Web Version

A fully-featured web application that works on desktop and mobile browsers, with offline support.

### Features
- Record audio directly in the browser
- Play back recordings with custom speeds
- Share recordings with other users
- Works offline (cached after first load)
- Installable as an app on iOS and Android
- Responsive design for all devices

### Getting Started

```bash
npm install
npm run dev
```

Create a `.env` file with `VITE_API_BASE_URL` pointing to your deployed API (for example `https://api.example.com/api`). Recorded
audio is uploaded to the server via this endpoint so that files are persisted remotely rather than only in local browser memory.

Visit `http://localhost:5173` and add to home screen to install as PWA.

### Building for Production

```bash
npm run build
```

The build output will be in the `dist/` folder.

### PWA Features
- **Manifest**: Configured in `public/manifest.json`
- **Service Worker**: Registered in `index.html` and served from `public/sw.js`
- **Offline Support**: Caches assets on first load for offline access
- **Icons**: Place icons in `public/icons/` directory
  - icon-192x192.png
  - icon-512x512.png
  - icon-maskable-192x192.png
  - icon-maskable-512x512.png

## 2. React Native Expo App - Mobile Version

A native mobile application for iOS and Android with full audio recording capabilities.

### Prerequisites
- Node.js 18+
- iOS: Xcode (for iOS development)
- Android: Android Studio (for Android development)
- Expo CLI: `npm install -g expo-cli`

### Getting Started

```bash
cd mobile
npm install
npm start
```

Then:
- Press `i` for iOS simulator
- Press `a` for Android emulator
- Scan QR code with Expo Go app on physical device

### Features
- Native audio recording with system audio codecs
- Local file management
- Direct upload to your API/MySQL backend
- Play back recordings
- Delete recordings
- Beautiful native UI

### Environment Variables

Both the PWA and the mobile app now talk to your own REST API that sits in front of a MySQL database.

- **Web (.env)**
  - `VITE_API_BASE_URL` – Base URL of your API (e.g. `https://api.example.com/api`)
- **Mobile (mobile/.env)**
  - `EXPO_PUBLIC_API_BASE_URL` – Same API base URL for the Expo client

### Building for Distribution

**iOS:**
```bash
cd mobile
eas build --platform ios
```

**Android:**
```bash
cd mobile
eas build --platform android
```

## Database Setup (MySQL)

Provision a MySQL database on your server and back it with a small REST API. The frontend assumes the API exposes endpoints such as:
- `GET /api/sounds` / `POST /api/sounds` / `PATCH /api/sounds/:id` / `DELETE /api/sounds/:id`
- `POST /api/sounds/upload` for multipart audio uploads and `POST /api/sounds/upload/base64` for base64 payloads
- `GET /api/sound-shares` / `POST /api/sound-shares` / `DELETE /api/sound-shares/:id`

`POST /api/sounds` also accepts a `file_content` base64 payload alongside `file_name` and will write the decoded audio into the
server's `/uploads` directory, storing only the public URL in MySQL rather than the encoded audio blob.

Suggested MySQL tables:
- `sounds` – `id` (UUID/PK), `file_name`, `file_url`, `plays_completed`, `total_plays`, `is_playing`, `next_play_at`, `created_at`, optional `playback_speeds` JSON/text, optional `duration`
- `sound_shares` – `id` (UUID/PK), `sound_id` (FK), `user_email`, `created_at`

Point `VITE_API_BASE_URL`/`EXPO_PUBLIC_API_BASE_URL` at your API after it is wired to MySQL.

## Deployment

### Web PWA
Deploy the `dist/` folder to any static hosting:
- Vercel
- Netlify
- GitHub Pages
- Firebase Hosting

### Mobile App
Use EAS (Expo Application Services) for native builds and distribution:

```bash
cd mobile
eas build
eas submit
```

## Architecture

### Shared
- REST API + MySQL for backend data
- TypeScript for type safety
- Responsive design patterns

### Web-Specific
- React + Vite
- Tailwind CSS
- Service Workers for offline support

### Mobile-Specific
- Expo + React Native
- Native audio APIs (expo-av)
- Native navigation (Expo Router)
- Local file system access

## Security

- Secure file uploads with server validation on your API
- Ensure API routes are authenticated/authorized as needed
- No sensitive data in client code

## Troubleshooting

### PWA Not Installing
- Ensure HTTPS is used (required for PWA)
- Check manifest.json is valid
- Service worker must be registered correctly

### Mobile App Not Running
- Clear cache: `cd mobile && rm -rf node_modules && npm install`
- Ensure Expo Go is installed on device
- Check network connectivity

### Upload Failures
- Verify your API URL and MySQL credentials
- Check network connection
- Ensure file permissions are granted

## Support

For issues or questions, check:
1. Browser console (F12) for web errors
2. Expo CLI logs for mobile errors
3. API server and MySQL logs for backend issues
