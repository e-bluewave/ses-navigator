import { useEffect, useId, useRef } from 'react';
import type { ProposalMessageDraft } from '../api/generated.js';

export function ProposalDeliveryConfirmation({
  retry,
  subject,
  bodyText,
  recipients,
  onConfirm,
  onCancel,
}: {
  retry: boolean;
  subject: string;
  bodyText: string;
  recipients: ProposalMessageDraft['recipients'];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const heading = useId();
  const description = useId();
  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement;
    if (!element) return;
    element.showModal();
    cancel.current?.focus();
    return () => {
      element.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      className="delivery-confirmation"
      aria-labelledby={heading}
      aria-describedby={description}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2 id={heading}>{retry ? '再送内容を確認' : '送信内容を確認'}</h2>
      <p id={description}>
        {retry
          ? '失敗した宛先だけに再送します。前の試行の受信状況と履歴を確認してください。'
          : '次の宛先へ承認済みのメールを送信します。宛先と内容を確認してください。'}
      </p>
      <ul aria-label="送信する宛先">
        {recipients.map((recipient, index) => (
          <li key={`${recipient.type}-${recipient.address}-${index}`}>
            {recipient.type.toUpperCase()}: {recipient.name} {recipient.address}
          </li>
        ))}
      </ul>
      <h3>件名</h3>
      <p>{subject}</p>
      <h3>本文</h3>
      <pre aria-label="送信する本文">{bodyText}</pre>
      <div className="button-row">
        <button
          ref={cancel}
          type="button"
          className="secondary-button"
          onClick={onCancel}
        >
          キャンセル
        </button>
        <button type="button" className="primary-button" onClick={onConfirm}>
          {retry ? '内容を確認して再送' : '内容を確認して送信'}
        </button>
      </div>
    </dialog>
  );
}
