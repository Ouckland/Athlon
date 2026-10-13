import { useState, type FormEvent } from 'react';
import { NavLink, useNavigate } from 'react-router';
import { useAuth } from '../../contexts/AuthContext';
import { ApiError } from '../../lib/api';

// ─── Input primitives ─────────────────────────────────────────────────────────

function Field({
  id, label, type = 'text', value, onChange, placeholder, autoComplete, required, minLength, error,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  error?: string;
}) {
  const [focused, setFocused] = useState(false);
  const borderColor = error ? '#EF4444' : focused ? '#22C55E' : '#243028';
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-[11px] font-mono uppercase tracking-[0.1em] mb-1.5"
        style={{ color: '#7A9E80' }}
      >
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        className="w-full px-3.5 py-2.5 text-[14px] text-text-1 placeholder-text-3 bg-transparent outline-none transition-colors duration-150"
        style={{ background: '#111812', border: `1px solid ${borderColor}`, borderRadius: 5 }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {error && <p className="mt-1 text-[11px]" style={{ color: '#EF4444' }}>{error}</p>}
    </div>
  );
}

function PasswordField({
  id, label, value, onChange, autoComplete, error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  error?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [show, setShow] = useState(false);
  const borderColor = error ? '#EF4444' : focused ? '#22C55E' : '#243028';
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-[11px] font-mono uppercase tracking-[0.1em] mb-1.5"
        style={{ color: '#7A9E80' }}
      >
        {label}
      </label>
      <div
        className="flex items-center transition-colors duration-150"
        style={{ background: '#111812', border: `1px solid ${borderColor}`, borderRadius: 5 }}
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
          minLength={8}
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
      {error && <p className="mt-1 text-[11px]" style={{ color: '#EF4444' }}>{error}</p>}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M14 8a6 6 0 00-6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

// ─── Error helpers ────────────────────────────────────────────────────────────

type FieldErrors = Record<string, string>;

function parseApiError(err: unknown): { general: string; fields: FieldErrors } {
  if (!(err instanceof ApiError)) {
    return {
      general: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
      fields: {},
    };
  }

  const fields: FieldErrors = {};
  let general = '';

  for (const [key, val] of Object.entries(err.data)) {
    if (key === 'detail' || key === 'non_field_errors') continue;
    const msgs = Array.isArray(val) ? val : [String(val)];
    fields[key] = msgs[0];
  }

  const nonField = err.data['non_field_errors'];
  if (Array.isArray(nonField) && nonField.length) general = nonField[0] as string;
  else if (err.data['detail']) general = String(err.data['detail']);
  else if (Object.keys(fields).length === 0) {
    general = err.status === 400 ? 'Please check your details and try again.' : 'Registration failed. Please try again.';
  }

  return { general, fields };
}

// ─── Success state ────────────────────────────────────────────────────────────

function VerifyEmailPrompt({ email }: { email: string }) {
  const navigate = useNavigate();
  return (
    <div className="w-full animate-fade-in">
      <div
        className="flex items-center gap-2 mb-5 px-3 py-2 w-fit"
        style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 5 }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#22C55E" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M2 7l3.5 3.5L12 3.5" />
        </svg>
        <span className="text-[11px] font-mono" style={{ color: '#22C55E' }}>Account created</span>
      </div>

      <h1 className="font-condensed font-black text-[30px] text-text-1 tracking-tight leading-none mb-2">
        Verify your email
      </h1>
      <p className="text-[13px] text-text-3 leading-relaxed mb-1">
        We sent a verification link to
      </p>
      <p className="text-[14px] font-medium mb-6" style={{ color: '#E2F2E8' }}>{email}</p>
      <p className="text-[13px] text-text-3 leading-relaxed mb-8">
        Click the link in the email to activate your account. Check your spam folder if you don't see it within a few minutes.
      </p>

      <button
        onClick={() => navigate('/auth/login')}
        className="w-full py-2.5 font-condensed font-bold text-[14px] tracking-[0.1em] transition-opacity hover:opacity-90 active:scale-[0.99]"
        style={{ background: '#22C55E', color: '#0A0F0C', borderRadius: 5 }}
      >
        Go to sign in
      </button>

      <p className="mt-5 text-[12px] text-text-3 text-center">
        Wrong email?{' '}
        <button
          onClick={() => window.location.reload()}
          className="font-medium transition-colors"
          style={{ color: '#7A9E80' }}
        >
          Start over
        </button>
      </p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RegisterPage() {
  const { register } = useAuth();

  const [firstName, setFirstName]               = useState('');
  const [lastName, setLastName]                 = useState('');
  const [displayName, setDisplayName]           = useState('');
  const [email, setEmail]                       = useState('');
  const [password, setPassword]                 = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');

  const [generalError, setGeneralError]         = useState('');
  const [fieldErrors, setFieldErrors]           = useState<FieldErrors>({});
  const [isLoading, setIsLoading]               = useState(false);
  const [registered, setRegistered]             = useState(false);

  // Auto-suggest display name from first + last when display name is still empty
  function handleFirstName(v: string) {
    setFirstName(v);
    if (!displayName || displayName === `${firstName} ${lastName}`.trim()) {
      setDisplayName(`${v} ${lastName}`.trim());
    }
  }
  function handleLastName(v: string) {
    setLastName(v);
    if (!displayName || displayName === `${firstName} ${lastName}`.trim()) {
      setDisplayName(`${firstName} ${v}`.trim());
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isLoading) return;

    setGeneralError('');
    setFieldErrors({});

    if (password !== passwordConfirmation) {
      setFieldErrors({ password_confirmation: 'Passwords do not match.' });
      return;
    }

    setIsLoading(true);
    try {
      await register({
        email,
        password,
        password_confirmation: passwordConfirmation,
        first_name: firstName,
        last_name: lastName,
        display_name: displayName,
      });
      setRegistered(true);
    } catch (err) {
      const { general, fields } = parseApiError(err);
      setGeneralError(general);
      setFieldErrors(fields);
    } finally {
      setIsLoading(false);
    }
  }

  if (registered) return <VerifyEmailPrompt email={email} />;

  return (
    <div className="w-full">
      <div className="mb-7">
        <h1 className="font-condensed font-black text-[30px] text-text-1 tracking-tight leading-none mb-1.5">
          Create account
        </h1>
        <p className="text-[13px] text-text-3">Join Athlon to track your game</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        {generalError && (
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
            {generalError}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field
            id="first_name"
            label="First name"
            value={firstName}
            onChange={handleFirstName}
            placeholder="First"
            autoComplete="given-name"
            required
            error={fieldErrors['first_name']}
          />
          <Field
            id="last_name"
            label="Last name"
            value={lastName}
            onChange={handleLastName}
            placeholder="Last"
            autoComplete="family-name"
            required
            error={fieldErrors['last_name']}
          />
        </div>

        <Field
          id="display_name"
          label="Display name"
          value={displayName}
          onChange={setDisplayName}
          placeholder="How others see you"
          autoComplete="nickname"
          required
          error={fieldErrors['display_name']}
        />

        <Field
          id="email"
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="you@example.com"
          autoComplete="email"
          required
          error={fieldErrors['email']}
        />

        <PasswordField
          id="password"
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          error={fieldErrors['password']}
        />

        <PasswordField
          id="password_confirmation"
          label="Confirm password"
          value={passwordConfirmation}
          onChange={setPasswordConfirmation}
          autoComplete="new-password"
          error={fieldErrors['password_confirmation']}
        />

        <button
          type="submit"
          disabled={isLoading}
          className="mt-2 w-full py-2.5 font-condensed font-bold text-[14px] tracking-[0.1em] disabled:opacity-50 transition-opacity hover:opacity-90 active:scale-[0.99]"
          style={{ background: '#22C55E', color: '#0A0F0C', borderRadius: 5 }}
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <Spinner />
              Creating account…
            </span>
          ) : 'Create account'}
        </button>
      </form>

      <p className="mt-6 text-[12px] text-text-3 text-center">
        Already have an account?{' '}
        <NavLink
          to="/auth/login"
          className="font-medium transition-colors"
          style={{ color: '#7A9E80' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#E2F2E8')}
          onMouseLeave={e => (e.currentTarget.style.color = '#7A9E80')}
        >
          Sign in
        </NavLink>
      </p>
    </div>
  );
}
