// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  SalesActivity,
  SalesActivityApi,
} from '../api/sales-activity-types.js';
import { CompanySalesActivitiesPanel } from './CompanySalesActivitiesPanel.js';

const companyId = '11111111-1111-4111-8111-111111111111';

const activity: SalesActivity = {
  id: '22222222-2222-4222-8222-222222222222',
  companyId,
  activityType: 'call',
  direction: 'outbound',
  occurredAt: '2026-09-15T05:30:00.000Z',
  subject: '案件状況確認',
  summary: '先方へ進捗確認を実施した',
  result: '9/18に再度連絡',
  contact: {
    id: '33333333-3333-4333-8333-333333333333',
    familyName: '山田',
    givenName: '太郎',
    departmentName: '開発部',
    positionTitle: '部長',
  },
  project: null,
  engineer: null,
  followUpTask: {
    id: '44444444-4444-4444-8444-444444444444',
    title: '顧客へ状況確認',
    status: 'open',
    priority: 'high',
    dueAt: '2026-09-18T01:00:00.000Z',
    completedAt: null,
    rowVersion: 1,
  },
  createdAt: '2026-09-15T05:31:00.000Z',
  updatedAt: '2026-09-15T05:31:00.000Z',
  rowVersion: 1,
};

afterEach(() => {
  cleanup();
});

function api(overrides: Partial<SalesActivityApi> = {}): SalesActivityApi {
  return {
    listCompanySalesActivities: vi.fn(() =>
      Promise.resolve({
        items: [activity],
        page: { limit: 25, nextCursor: null },
      }),
    ),
    createCompanySalesActivity: vi.fn(() =>
      Promise.resolve({
        activity: {
          id: activity.id,
          companyId: activity.companyId,
          activityType: activity.activityType,
          direction: activity.direction,
          occurredAt: activity.occurredAt,
          subject: activity.subject,
          summary: activity.summary,
          result: activity.result,
          createdAt: activity.createdAt,
          updatedAt: activity.updatedAt,
          rowVersion: activity.rowVersion,
        },
        followUpTask: activity.followUpTask,
      }),
    ),
    ...overrides,
  };
}

describe('CompanySalesActivitiesPanel', () => {
  it('renders the company sales activity timeline and follow-up state', async () => {
    const salesApi = api();
    render(
      <CompanySalesActivitiesPanel
        api={salesApi}
        companyId={companyId}
        onUnauthorized={() => Promise.resolve()}
      />,
    );

    expect(
      screen.getByText('営業活動履歴を読み込んでいます…'),
    ).toBeInTheDocument();
    expect(await screen.findByText('案件状況確認')).toBeInTheDocument();
    expect(screen.getByText('先方へ進捗確認を実施した')).toBeInTheDocument();
    expect(screen.getByText(/次回対応: 顧客へ状況確認/)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'マイタスクで確認' }),
    ).toHaveAttribute('href', '/my-tasks');
  });

  it('creates an activity and optional follow-up task then refreshes the timeline', async () => {
    const create = vi.fn<SalesActivityApi['createCompanySalesActivity']>(() =>
      Promise.resolve({
        activity: {
          id: activity.id,
          companyId: activity.companyId,
          activityType: activity.activityType,
          direction: activity.direction,
          occurredAt: activity.occurredAt,
          subject: activity.subject,
          summary: activity.summary,
          result: activity.result,
          createdAt: activity.createdAt,
          updatedAt: activity.updatedAt,
          rowVersion: activity.rowVersion,
        },
        followUpTask: activity.followUpTask,
      }),
    );
    const list = vi.fn(() =>
      Promise.resolve({
        items: [activity],
        page: { limit: 25, nextCursor: null },
      }),
    );
    render(
      <CompanySalesActivitiesPanel
        api={api({
          listCompanySalesActivities: list,
          createCompanySalesActivity: create,
        })}
        companyId={companyId}
        onUnauthorized={() => Promise.resolve()}
      />,
    );

    await screen.findByText('案件状況確認');
    fireEvent.click(screen.getByRole('button', { name: '営業活動を登録' }));
    fireEvent.change(screen.getByLabelText('営業活動件名'), {
      target: { value: '提案後フォロー' },
    });
    fireEvent.change(screen.getByLabelText('営業活動内容'), {
      target: { value: '電話で状況を確認した' },
    });
    fireEvent.click(screen.getByLabelText('次回対応タスクを作成'));
    fireEvent.change(screen.getByLabelText('次回対応内容'), {
      target: { value: '来週再連絡' },
    });
    fireEvent.change(screen.getByLabelText('次回対応期限'), {
      target: { value: '2026-09-18T10:00' },
    });
    fireEvent.change(screen.getByLabelText('次回対応優先度'), {
      target: { value: 'high' },
    });

    fireEvent.submit(screen.getByLabelText('営業活動件名').closest('form')!);

    await waitFor(() => expect(create).toHaveBeenCalledOnce());
    const [submittedCompanyId, submitted] = create.mock.calls[0]!;
    expect(submittedCompanyId).toBe(companyId);
    expect(submitted.subject).toBe('提案後フォロー');
    expect(submitted.summary).toBe('電話で状況を確認した');
    expect(submitted.followUp?.title).toBe('来週再連絡');
    expect(submitted.followUp?.priority).toBe('high');
    expect(
      await screen.findByText('営業活動と次回対応タスクを登録しました。'),
    ).toBeInTheDocument();
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('loads the next cursor page without replacing the current timeline', async () => {
    const second: SalesActivity = {
      ...activity,
      id: '55555555-5555-4555-8555-555555555555',
      subject: '次の履歴',
      followUpTask: null,
    };
    const list = vi
      .fn()
      .mockResolvedValueOnce({
        items: [activity],
        page: { limit: 25, nextCursor: 'next-cursor' },
      })
      .mockResolvedValueOnce({
        items: [second],
        page: { limit: 25, nextCursor: null },
      });
    render(
      <CompanySalesActivitiesPanel
        api={api({ listCompanySalesActivities: list })}
        companyId={companyId}
        onUnauthorized={() => Promise.resolve()}
      />,
    );

    await screen.findByText('案件状況確認');
    fireEvent.click(screen.getByRole('button', { name: 'さらに表示' }));
    expect(await screen.findByText('次の履歴')).toBeInTheDocument();
    expect(screen.getByText('案件状況確認')).toBeInTheDocument();
    expect(list).toHaveBeenLastCalledWith(companyId, {
      limit: 25,
      cursor: 'next-cursor',
    });
  });
});
