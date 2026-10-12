import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { api } from '../../lib/api';
import { API_PATHS } from '../../lib/apiPaths';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const uid   = searchParams.get('uid') ?? '';
  const token = searchParams.get('token') ?? '';

  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [done, setDone]           = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (password.length < 8)  { setError('Password must be at least 8 characters.'); return; }
    setIsLoading(true);
    try {
      await api.post(API_PATHS.auth.resetPassword, {
        uid,
        token,
        new_password: password,
        new_password_confirmation: confirm,
      });
      setDone(true);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to reset password. The link may have expired.');
    } finally {
      setIsLoading(false);
    }
  }

  if (!uid || !token) {
    return (
      <div className="w-full">
        <h1 className="font-condensed font-black text-[28px] text-text-1 tracking-tight leading-none mb-2">Invalid link</h1>
        <p className="text-[13px] text-text-3 mb-6">This password reset link is missing or invalid.</p>
        <button onClick={() => navigate('/auth/forgot-password')} className="text-[12px] font-mono text-athlon hover:opacity-80 transition-opacity">
          Request a new link →
        </button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="w-full">
        <div className="w-10 h-10 rounded-full flex items-center justify-center mb-5" style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)' }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#22C55E" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l4.5 4.5L15 5" />
          </svg>
        </div>
        <h1 className="font-condensed font-black text-[28px] text-text-1 tracking-tight leading-none mb-2">Password updated</h1>
        <p className="text-[13px] text-text-3 mb-6">Your password has been changed. Sign in with your new credentials.</p>
        <button
          onClick={() => navigate('/auth/login')}
          className="w-full py-2.5 font-condensed font-bold text-[14px] tracking-[0.1em] transition-opacity hover:opacity-90"
          style={{ background: '#22C55E', color: '#0A0F0C', borderRadius: 5 }}
        >
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mb-7">
        <h1 className="font-condensed font-black text-[28px] text-text-1 tracking-tight leading-none mb-1.5">
          New password
        </h1>
        <p className="text-[13px] text-text-3">Choose a strong password for your account.</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <div className="px-4 py-3 text-[12px] text-live leading-snug" style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.18)', borderRadius: 5 }}>
            {error}
          </div>
        )}

        {[
          { label: 'New password', value: password, setter: setPassword, placeholder: 'At least 8 characters' },
          { label: 'Confirm password', value: confirm, setter: setConfirm, placeholder: 'Repeat new password' },
        ].map(({ label, value, setter, placeholder }) => (
          <div key={label}>
            <label className="block text-[11px] font-mono tracking-[0.1em] uppercase mb-1.5" style={{ color: '#454E62' }}>{label}</label>
            <input
              type="password"
              value={value}
              onChange={e => setter(e.target.value)}
              placeholder={placeholder}
              required
              className="w-full px-3.5 py-2.5 text-[14px] text-text-1 placeholder-text-3 outline-none transition-all duration-150"
              style={{ background: '#162019', border: '1px solid #243028', borderRadius: 5 }}
            />
          </div>
        ))}

        <button
          type="submit"
          disabled={isLoading || !password || !confirm}
          className="mt-2 w-full py-2.5 font-condensed font-bold text-[14px] tracking-[0.1em] disabled:opacity-50 transition-opacity hover:opacity-90"
          style={{ background: '#22C55E', color: '#0A0F0C', borderRadius: 5 }}
        >
          {isLoading ? 'Updating…' : 'Set new password'}
        </button>
      </form>
    </div>
  );
}
