import { useState, type FormEvent } from 'react';
import { NavLink } from 'react-router';
import { api } from '../../lib/api';
import { API_PATHS } from '../../lib/apiPaths';

function Field({
  label, value, onChange, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <label className="block text-[11px] font-mono uppercase tracking-[0.1em] mb-1.5" style={{ color: '#454E62' }}>
        {label}
      </label>
      <input
        type="email"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required
        className="w-full px-3.5 py-2.5 text-[14px] text-text-1 placeholder-text-3 bg-transparent outline-none transition-all duration-150"
        style={{
          background: '#111217',
          border: `1px solid ${focused ? '#22C55E' : '#243028'}`,
          borderRadius: 5,
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </div>
  );
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await api.post(API_PATHS.auth.forgotPassword, { email });
      setSent(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="w-full">
        {/* Sent confirmation — clean typographic state, no icon circle */}
        <div className="mb-6 flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#22C55E" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M2.5 8.5l4 4 7-8" />
          </svg>
          <span className="text-[12px] font-mono text-win">Email sent</span>
        </div>

        <h1 className="font-condensed font-black text-[28px] text-text-1 tracking-tight leading-none mb-2">
          Check your inbox
        </h1>
        <p className="text-[13px] text-text-3 leading-relaxed mb-8">
          We sent a password reset link to{' '}
          <span className="text-text-2 font-medium">{email}</span>.
          {' '}The link expires in 30 minutes.
        </p>

        <p className="text-[12px] text-text-3">
          Didn't receive it?{' '}
          <button
            onClick={() => setSent(false)}
            className="text-text-2 hover:text-text-1 font-medium transition-colors"
          >
            Try again
          </button>
          {' '}· Check spam folder.
        </p>

        <div className="mt-8 pt-6 border-t border-border">
          <NavLink
            to="/auth/login"
            className="flex items-center gap-1.5 text-[12px] font-mono text-text-3 hover:text-text-2 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
              <path d="M8 2L4 6l4 4" />
            </svg>
            Back to sign in
          </NavLink>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mb-8">
        <h1 className="font-condensed font-black text-[30px] text-text-1 tracking-tight leading-none mb-1.5">
          Reset password
        </h1>
        <p className="text-[13px] text-text-3">
          Enter your email and we'll send a reset link.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <div
            className="px-4 py-3 text-[12px] text-live leading-snug"
            style={{
              background: 'rgba(239,68,68,0.07)',
              border: '1px solid rgba(239,68,68,0.18)',
              borderRadius: 5,
            }}
          >
            {error}
          </div>
        )}

        <Field
          label="Email address"
          value={email}
          onChange={setEmail}
          placeholder="you@example.com"
        />

        <button
          type="submit"
          disabled={isLoading}
          className="mt-2 w-full py-2.5 font-condensed font-bold text-[14px] tracking-[0.1em] disabled:opacity-50 transition-opacity hover:opacity-90 active:scale-[0.99]"
          style={{ background: '#22C55E', color: '#0A0F0C', borderRadius: 5 }}
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5"/>
                <path d="M14 8a6 6 0 00-6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
              Sending…
            </span>
          ) : 'Send reset link'}
        </button>
      </form>

      <div className="mt-8 pt-6 border-t border-border">
        <NavLink
          to="/auth/login"
          className="flex items-center gap-1.5 text-[12px] font-mono text-text-3 hover:text-text-2 transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
            <path d="M8 2L4 6l4 4" />
          </svg>
          Back to sign in
        </NavLink>
      </div>
    </div>
  );
}
