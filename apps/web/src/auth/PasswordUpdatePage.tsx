import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from './AuthProvider.js';

export function PasswordUpdatePage({
  kind,
  onComplete,
}: {
  kind: 'recovery' | 'invite';
  onComplete: () => void;
}) {
  const { updatePassword } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = data.get('password');
    const confirmation = data.get('confirmation');
    if (typeof password !== 'string' || password.length < 12)
      return setError('パスワードは12文字以上で入力してください。');
    if (password !== confirmation)
      return setError('確認用パスワードが一致しません。');
    setSubmitting(true);
    setError(null);
    try {
      await updatePassword(password);
      onComplete();
    } catch {
      setError(
        'パスワードを更新できませんでした。リンクの有効期限を確認してください。',
      );
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <main className="login-shell">
      <section className="login-panel" aria-labelledby="password-heading">
        <p className="eyebrow">SES営業支援</p>
        <h1 id="password-heading">
          {kind === 'invite' ? '招待を受諾' : 'パスワードを再設定'}
        </h1>
        <form className="login-form" onSubmit={(event) => void submit(event)}>
          <label>
            新しいパスワード
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
            />
          </label>
          <label>
            新しいパスワード（確認）
            <input
              name="confirmation"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
            />
          </label>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <button className="primary-button" disabled={submitting}>
            {submitting ? '更新しています…' : 'パスワードを設定'}
          </button>
        </form>
      </section>
    </main>
  );
}
