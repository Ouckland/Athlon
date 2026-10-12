import { useState, useEffect, type FormEvent } from 'react';
import { NavLink, useNavigate } from 'react-router';
import { useAuth } from '../../contexts/AuthContext';
import { ApiError } from '../../lib/api';

// ─── Shared input primitives ──────────────────────────────────────────────────

function InputField({
  id, label, type, value, onChange, placeholder, autoComplete, required, action,
}: {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  action?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label
          htmlFor={id}
          className="text-[11px] font-mono tracking-[0.1em] uppercase"
          style={{ color: '#7A9E80' }}
        >
          {label}
        </label>
        {action}
      </div>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        className="w-full px-3.5 py-2.5 text-[14px] text-text-1 placeholder-text-3 outline-none transition-colors duration-150"
        style={{
          background: '#111812',
          border: `1px solid ${focused ? '#22C55E' : '#243028'}`,
          borderRadius: 5,
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </div>
  );
}

function PasswordField({
  id, label, value, onChange, autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [show, setShow] = useState(false);
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-[11px] font-mono tracking-[0.1em] uppercase mb-1.5"
        style={{ color: '#7A9E80' }}
      >
        {label}
      </label>
      <div
        className="flex items-center transition-colors duration-150"
        style={{
          background: '#111812',
          border: `1px solid ${focused ? '#22C55E' : '#243028'}`,
          borderRadius: 5,
        }}
      >
        <input
          id={id}
          name={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="••••••••"
          autoComplete={autoComplete}
          required
          className="flex-1 min-w-0 px-3.5 py-2.5 text-[14px] text-text-1 placeholder-text-3 bg-transparent outline-none"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          className="px-3 flex-shrink-0 transition-colors"
          style={{ color: show ? '#22C55E' : '#40604A' }}
          aria-label={show ? 'Hide password' : 'Show password'}
          tabIndex={-1}
        >
          {show ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" aria-hidden>
              <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" />
              <circle cx="8" cy="8" r="2" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" aria-hidden>
              <path d="M2 2l12 12M6.5 6.6A2 2 0 0010 9.6M4.4 4.4C2.9 5.4 1.7 7 1 8c1.3 2.2 4 5 7 5a7 7 0 003.6-1M7 3.1A7.7 7.7 0 018 3c3 0 5.7 2.8 7 5-.4.6-1 1.4-1.7 2.1" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Error banner ─────────────────────────────────────────────────────────────

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="px-4 py-3 text-[12px] leading-snug"
      style={{
        background: 'rgba(239,68,68,0.07)',
        border: '1px solid rgba(239,68,68,0.18)',
        borderRadius: 5,
        color: '#EF4444',
      }}
    >
      {message}
    </div>
  );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M14 8a6 6 0 00-6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    // Field-level: { email: ["..."], password: ["..."] }
    const fieldErrors = Object.entries(err.data)
      .filter(([k]) => k !== 'detail' && k !== 'non_field_errors')
      .flatMap(([k, v]) => {
        const label = k.replace(/_/g, ' ');
        const msgs = Array.isArray(v) ? v : [String(v)];
        return msgs.map(m => `${label}: ${m}`);
      });
    if (fieldErrors.length) return fieldErrors.join(' · ');

    // Non-field errors
    const nonField = err.data['non_field_errors'];
    if (Array.isArray(nonField) && nonField.length) return nonField.join(' ');

    // detail string
    if (err.data['detail']) return String(err.data['detail']);

    if (err.status === 401) return 'Invalid email or password.';
    if (err.status === 403) return 'Your account is inactive. Please verify your email.';
  }
  if (err instanceof Error) return err.message;
  return 'Something went wrong. Please try again.';
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const { login, isAuthenticated, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Already authenticated → send to home
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isLoading) return;
    setError('');
    setIsLoading(true);
    try {
      await login({ email, password });
      navigate('/');
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }

  // While auth state is resolving, show nothing to avoid flash
  if (authLoading) return null;

  return (
    <div className="w-full">
      {/* Heading */}
      <div className="mb-7">
        <h1 className="font-condensed font-black text-[30px] text-text-1 tracking-tight leading-none mb-1.5">
          Welcome back
        </h1>
        <p className="text-[13px] text-text-3">Sign in to your Athlon account</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        {error && <ErrorBanner message={error} />}

        <InputField
          id="email"
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="you@example.com"
          autoComplete="email"
          required
        />

        <PasswordField
          id="password"
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />

        <div className="flex justify-end -mt-1">
          <NavLink
            to="/auth/forgot-password"
            className="text-[11px] font-mono transition-colors"
            style={{ color: '#40604A' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#7A9E80')}
            onMouseLeave={e => (e.currentTarget.style.color = '#40604A')}
          >
            Forgot password?
          </NavLink>
        </div>

        <button
          type="submit"
          disabled={isLoading || !email || !password}
          className="mt-1 w-full py-2.5 font-condensed font-bold text-[14px] tracking-[0.1em] disabled:opacity-50 transition-opacity hover:opacity-90 active:scale-[0.99]"
          style={{ background: '#22C55E', color: '#0A0F0C', borderRadius: 5 }}
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <Spinner />
              Signing in…
            </span>
          ) : 'Sign in'}
        </button>
      </form>

      <p className="mt-6 text-[12px] text-text-3 text-center">
        No account?{' '}
        <NavLink
          to="/auth/register"
          className="font-medium transition-colors"
          style={{ color: '#7A9E80' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#E2F2E8')}
          onMouseLeave={e => (e.currentTarget.style.color = '#7A9E80')}
        >
          Create one
        </NavLink>
      </p>
    </div>
  );
}
