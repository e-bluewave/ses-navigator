import { useState } from 'react';
import type { FormEvent } from 'react';

import { useAuth } from './AuthProvider.js';

export function LoginPage() {
  const { error, signIn, requestPasswordReset } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = data.get('email');
    const password = data.get('password');
    if (typeof email !== 'string') return;
    setSubmitting(true);
    try {
      if (resetMode) {
        await requestPasswordReset(email);
        setMessage(
          '該当するアカウントがある場合、再設定メールを送信しました。',
        );
      } else if (typeof password === 'string') await signIn(email, password);
    } catch {
      setMessage(
        '再設定メールを送信できませんでした。時間をおいて再度お試しください。',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-panel" aria-labelledby="login-heading">
        <p className="eyebrow">SES営業支援</p>
        <h1>SES Navigator</h1>
        <p className="login-lead">
          {resetMode
            ? '再設定メールを送信します。'
            : 'アカウントへログインしてください。'}
        </p>
        <form className="login-form" onSubmit={(event) => void submit(event)}>
          <label>
            メールアドレス
            <input name="email" type="email" autoComplete="username" required />
          </label>
          {message ? <p role="status">{message}</p> : null}
          {!resetMode ? (
            <label>
              パスワード
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
          ) : null}
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
            {submitting
              ? '処理しています…'
              : resetMode
                ? '再設定メールを送信'
                : 'ログイン'}
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              setResetMode(!resetMode);
              setMessage(null);
            }}
          >
            {resetMode ? 'ログインへ戻る' : 'パスワードを忘れた方'}
          </button>
        </form>
      </section>
    </main>
  );
}
