import { useState } from 'react';
import { LogIn, ShieldCheck, Headphones } from 'lucide-react';

interface LoginPageProps {
  onLogin: () => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    onLogin();
  };

  return (
    <div className="max-w-2xl mx-auto text-white">
      <div className="mb-8 text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-sm">
          <Headphones className="w-4 h-4" />
          Timed Audio Queue
        </div>
        <div className="space-y-2">
          <h1 className="text-4xl font-bold">ברוך הבא</h1>
          <p className="text-slate-300">התחבר כדי להעלות ולהפעיל קבצי שמע ברצף חכם.</p>
        </div>
      </div>

      <div className="bg-slate-900/70 border border-slate-800 shadow-xl rounded-2xl p-8 backdrop-blur">
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="grid md:grid-cols-2 gap-4">
            <label className="space-y-2">
              <span className="block text-sm text-slate-300">אימייל</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="w-full rounded-lg bg-slate-950/60 border border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 px-4 py-3 text-white"
              />
            </label>
            <label className="space-y-2">
              <span className="block text-sm text-slate-300">סיסמה</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full rounded-lg bg-slate-950/60 border border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 px-4 py-3 text-white"
              />
            </label>
          </div>

          <div className="flex items-center justify-between text-sm text-slate-300">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
              />
              זכור אותי
            </label>
            <a className="text-emerald-300 hover:text-emerald-200 transition" href="#">שכחת סיסמה?</a>
          </div>

          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold rounded-lg py-3 transition shadow-lg shadow-emerald-500/20"
          >
            <LogIn className="w-5 h-5" />
            כניסה לחשבון
          </button>

          <div className="flex items-center gap-3 text-slate-400 text-sm">
            <ShieldCheck className="w-4 h-4" />
            החיבור מאובטח באמצעות הצפנה מלאה וכניסה מבוקרת.
          </div>
        </form>
      </div>
    </div>
  );
}
