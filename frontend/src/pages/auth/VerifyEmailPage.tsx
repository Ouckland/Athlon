import { useEffect, useState, type FormEvent } from 'react';
import { NavLink, useSearchParams, useParams } from 'react-router';
import { api } from '../../lib/api';
import { API_PATHS } from '../../lib/apiPaths';
import { ApiError } from '../../lib/api';

function BackToLogin() {
  return (
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
  );
}

// ─── Resend email sub-form ─────────────────────────────────────────────────────

function ResendForm() {
  const [email, setEmail]   = useState('');
  const [sent, setSent]     = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');
  const [focused, setFocused] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post(API_PATHS.auth.resendVerification, { email });
      setSent(true);
    } catch (err) {
      if (err instanceof ApiError && err.data['email']) {
        setError(String(Array.isArray(err.data['email']) ? err.data['email'][0] : err.data['email']));
      } else {
        setError('Failed to resend. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div
        className="flex items-center gap-2 px-4 py-3"
        style={{ background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 5 }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#22C55E" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M2 7l3.5 3.5L12 3.5" />
        </svg>
        <span className="text-[12px] font-mono" style={{ color: '#22C55E' }}>
          Sent — check your inbox.
        </span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4">
      <p className="text-[12px] text-text-3 mb-3">Enter your email to receive a new verification link:</p>
      {error && (
        <p className="text-[11px] mb-2" style={{ color: '#EF4444' }}>{error}</p>
      )}
      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          autoComplete="email"
          className="flex-1 min-w-0 px-3 py-2 text-[13px] text-text-1 placeholder-text-3 outline-none transition-colors duration-150"
          style={{
            background: '#111812',
            border: `1px solid ${focused ? '#22C55E' : '#243028'}`,
            borderRadius: 5,
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        <button
          type="submit"
          disabled={loading || !email}
          className="px-4 py-2 font-condensed font-bold text-[13px] tracking-[0.08em] disabled:opacity-50 transition-opacity hover:opacity-90 flex-shrink-0"
          style={{ background: '#22C55E', color: '#0A0F0C', borderRadius: 5 }}
        >
          {loading ? '…' : 'Send'}
        </button>
      </div>
    </form>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function VerifyEmailPage() {
  const { token: routeToken } = useParams<{ token?: string }>();
  const [params] = useSearchParams();
  // Accept token from route param (/auth/verify-email/:token) or query string (?token=xxx)
  const token = routeToken ?? params.get('token');

  const [status, setStatus] = useState<'idle' | 'verifying' | 'success' | 'error'>('idle');
  const [showResend, setShowResend] = useState(false);

  useEffect(() => {
    if (!token) return;
    setStatus('verifying');
    // Contract: GET /api/accounts/verify-email/<token>/
    api.get(API_PATHS.auth.verifyEmail(token))
      .then(() => setStatus('success'))
      .catch(() => setStatus('error'));
  }, [token]);

  /* ── No token — "Check your inbox" state ────────────────────────── */
  if (!token) {
    return (
      <div className="w-full">
        <div className="mb-6">
          <h1 className="font-condensed font-black text-[30px] text-text-1 tracking-tight leading-none mb-1.5">
            Check your inbox
          </h1>
          <p className="text-[13px] text-text-3 leading-relaxed">
            We sent a verification link to your email address. Click it to activate your account.
          </p>
        </div>

        <div
          className="px-4 py-3.5 mb-5"
          style={{ background: '#111812', border: '1px solid #243028', borderRadius: 6 }}
        >
          <p className="text-[12px] font-mono text-text-3 leading-relaxed">
            Can't find it? Check your spam folder, or request a new link.
          </p>
        </div>

        {!showResend ? (
          <button
            onClick={() => setShowResend(true)}
            className="text-[13px] font-medium transition-colors"
            style={{ color: '#7A9E80' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#E2F2E8')}
            onMouseLeave={e => (e.currentTarget.style.color = '#7A9E80')}
          >
            Resend verification email →
          </button>
        ) : (
          <ResendForm />
        )}

        <BackToLogin />
      </div>
    );
  }

  /* ── Verifying token ─────────────────────────────────────────────── */
  if (status === 'verifying' || status === 'idle') {
    return (
      <div className="w-full">
        <div className="flex items-center gap-3 mb-6">
          <svg className="animate-spin w-4 h-4 flex-shrink-0" viewBox="0 0 16 16" fill="none" style={{ color: '#22C55E' }}>
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
            <path d="M14 8a6 6 0 00-6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          <span className="text-[13px] font-mono text-text-3">Verifying your account…</span>
        </div>
      </div>
    );
  }

  /* ── Success ─────────────────────────────────────────────────────── */
  if (status === 'success') {
    return (
      <div className="w-full animate-fade-in">
        <div
          className="flex items-center gap-2 mb-5 px-3 py-2 w-fit"
          style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 5 }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#22C55E" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M2 7l3.5 3.5L12 3.5" />
          </svg>
          <span className="text-[11px] font-mono" style={{ color: '#22C55E' }}>Email verified</span>
        </div>

        <h1 className="font-condensed font-black text-[30px] text-text-1 tracking-tight leading-none mb-2">
          You're in.
        </h1>
        <p className="text-[13px] text-text-3 leading-relaxed mb-8">
          Your Athlon account is now active. Sign in to get started.
        </p>

        <NavLink
          to="/auth/login"
          className="inline-flex items-center px-6 py-2.5 font-condensed font-bold text-[14px] tracking-[0.1em] hover:opacity-90 transition-opacity"
          style={{ background: '#22C55E', color: '#0A0F0C', borderRadius: 5 }}
        >
          Sign in
        </NavLink>
      </div>
    );
  }

  /* ── Error ───────────────────────────────────────────────────────── */
  return (
    <div className="w-full animate-fade-in">
      <div
        className="flex items-center gap-2 mb-5 px-3 py-2 w-fit"
        style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.18)', borderRadius: 5 }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#EF4444" strokeWidth={2} strokeLinecap="round" aria-hidden>
          <path d="M3 3l8 8M11 3l-8 8" />
        </svg>
        <span className="text-[11px] font-mono" style={{ color: '#EF4444' }}>Verification failed</span>
      </div>

      <h1 className="font-condensed font-black text-[30px] text-text-1 tracking-tight leading-none mb-2">
        Link expired
      </h1>
      <p className="text-[13px] text-text-3 leading-relaxed mb-6">
        This verification link may have expired or already been used. Request a new one below.
      </p>

      {!showResend ? (
        <button
          onClick={() => setShowResend(true)}
          className="text-[13px] font-medium transition-colors"
          style={{ color: '#7A9E80' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#E2F2E8')}
          onMouseLeave={e => (e.currentTarget.style.color = '#7A9E80')}
        >
          Request a new verification link →
        </button>
      ) : (
        <ResendForm />
      )}

      <BackToLogin />
    </div>
  );
}
