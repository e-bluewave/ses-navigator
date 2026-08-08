import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from './App.js';

describe('App', () => {
  it('renders the application shell', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { name: 'SES Navigator' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '案件' })).toBeInTheDocument();
  });
});
