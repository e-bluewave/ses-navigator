import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProjectsApi } from '../api/client.js';
import type { Project } from '../api/generated.js';
import { App } from './App.js';

const project: Project = {
  id: '11111111-1111-4111-8111-111111111111',
  managementNo: 'PJ-000001',
  projectName: '基幹システム刷新',
  summary: '基幹業務を刷新する案件です。',
  projectStatus: 'open',
  recruitmentStatus: 'recruiting',
  plannedStartOn: '2026-09-01',
  plannedEndOn: null,
  updatedAt: '2026-08-08T12:00:00Z',
  rowVersion: 2,
};

function api(overrides: Partial<ProjectsApi> = {}): ProjectsApi {
  return {
    listProjects: vi.fn(() =>
      Promise.resolve({
        items: [project],
        page: { limit: 50, nextCursor: null },
      }),
    ),
    getProject: vi.fn(() => Promise.resolve(project)),
    ...overrides,
  };
}

beforeEach(() => window.history.replaceState({}, '', '/projects'));
afterEach(cleanup);

describe('App', () => {
  it('renders projects returned by the generated client', async () => {
    render(<App api={api()} />);
    expect(
      screen.getByRole('heading', { name: '案件一覧' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: '基幹システム刷新' }),
    ).toBeInTheDocument();
    expect(screen.getByText('PJ-000001')).toBeInTheDocument();
    expect(screen.getByText('募集中')).toBeInTheDocument();
  });

  it('navigates from the list to project detail', async () => {
    const getProject = vi.fn(() => Promise.resolve(project));
    const projects = api({ getProject });
    render(<App api={projects} />);
    fireEvent.click(
      await screen.findByRole('button', { name: '基幹システム刷新' }),
    );
    expect(
      await screen.findByRole('heading', { name: '基幹システム刷新' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('基幹業務を刷新する案件です。'),
    ).toBeInTheDocument();
    expect(getProject).toHaveBeenCalledWith(project.id);
  });

  it('renders an empty state', async () => {
    render(
      <App
        api={api({
          listProjects: () =>
            Promise.resolve({
              items: [],
              page: { limit: 50, nextCursor: null },
            }),
        })}
      />,
    );
    expect(
      await screen.findByText('表示できる案件はありません。'),
    ).toBeInTheDocument();
  });
});
