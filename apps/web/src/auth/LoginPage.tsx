import { useState } from 'react';
import type { FormEvent } from 'react';

import { useAuth } from './AuthProvider.js';

export function LoginPage() {
  const { error, signIn } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = data.get('email');
    const password = data.get('password');
    if (typeof email !== 'string' || typeof password !== 'string') return;
    setSubmitting(true);
    await signIn(email, password);
    setSubmitting(false);
  }

  return (
    <main className="login-shell">
      <section className="login-panel" aria-labelledby="login-heading">
        <p className="eyebrow">SES営業支援</p>
        <h1>SES Navigator</h1>
        <p className="login-lead">アカウントへログインしてください。</p>
        <form className="login-form" onSubmit={(event) => void submit(event)}>
          <label>
            メールアドレス
            <input name="email" type="email" autoComplete="username" required />
          </label>
          <label>
            パスワード
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <button
            className="primary-button"
            type="submit"
            disabled={submitting}
          >
            {submitting ? 'ログインしています…' : 'ログイン'}
          </button>
        </form>
      </section>
    </main>
  );
}
