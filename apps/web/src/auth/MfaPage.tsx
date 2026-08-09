import { useEffect, useState } from 'react';

import { useAuth } from './AuthProvider.js';
import type { MfaEnrollment } from './auth-client.js';

export function MfaPage() {
  const { session, error, enrollMfa, verifyMfa, signOut } = useAuth();
  const verifiedFactor = session?.factors.find(
    (factor) => factor.status === 'verified',
  );
  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (verifiedFactor !== undefined || enrollment !== null) return;
    void enrollMfa().then(setEnrollment);
  }, [enrollMfa, enrollment, verifiedFactor]);

  const factorId = verifiedFactor?.id ?? enrollment?.factorId;
  return (
    <main className="login-shell">
      <section className="login-panel" aria-labelledby="mfa-heading">
        <p className="eyebrow">SECURITY</p>
        <h1 id="mfa-heading">多要素認証</h1>
        <p className="login-lead">
          管理者アカウントは認証アプリの確認コードが必要です。
        </p>
        {enrollment ? (
          <div className="mfa-enrollment">
            <img src={enrollment.qrCode} alt="認証アプリ登録用QRコード" />
            <p>QRコードを読み取れない場合のキー</p>
            <code>{enrollment.secret}</code>
          </div>
        ) : null}
        <form
          className="login-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (factorId === undefined) return;
            setBusy(true);
            void verifyMfa(factorId, code).finally(() => setBusy(false));
          }}
        >
          <label>
            6桁の確認コード
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              required
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </label>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <button
            className="primary-button"
            disabled={busy || factorId === undefined}
          >
            {busy ? '確認中…' : '確認する'}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void signOut()}
          >
            ログアウト
          </button>
        </form>
      </section>
    </main>
  );
}
