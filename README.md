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
- Direct upload to Supabase
- Play back recordings
- Delete recordings
- Beautiful native UI

### Environment Variables

Create `.env` file in `mobile/` directory:

```
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

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

## Database Setup

Both apps use Supabase for data persistence. The database schema includes:

### Tables
- `sounds` - Audio recordings with metadata
- `sound_shares` - Sharing information between users

### Configuration

1. Get your Supabase credentials from the dashboard
2. Set environment variables:
   - Web: Update `.env` file
   - Mobile: Update `mobile/.env` file

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
- Supabase for backend
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

- Authentication through Supabase
- Row-level security (RLS) policies on database
- Secure file uploads with server validation
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
- Verify Supabase credentials
- Check network connection
- Ensure file permissions are granted

## Support

For issues or questions, check:
1. Browser console (F12) for web errors
2. Expo CLI logs for mobile errors
3. Supabase dashboard for database issues
