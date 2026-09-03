import { WEBSITE_STATUSES, WEBSITE_STATUS_PRESENTATION } from '@siteops/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StatusBadge, StatusDot } from './status-badge';

/**
 * These assertions protect an accessibility guarantee, not styling: status must
 * never be conveyed by colour alone. If a refactor drops the text label or the
 * visually-hidden alternative, these fail.
 */
describe('StatusBadge', () => {
  it.each(WEBSITE_STATUSES)('renders a visible text label for %s', (status) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(WEBSITE_STATUS_PRESENTATION[status].label)).toBeInTheDocument();
  });

  it('keeps the label readable by assistive tech when visually hidden', () => {
    render(<StatusBadge status="down" iconOnly />);

    // The label is still in the accessibility tree, just not painted.
    expect(screen.getByText('Down. Not responding')).toBeInTheDocument();
    expect(screen.queryByText('Down', { exact: true })).not.toBeInTheDocument();
  });

  it('is not a live region, so a table of rows is not re-announced on refresh', () => {
    render(<StatusBadge status="down" />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('describes the status for pointer users via the title attribute', () => {
    render(<StatusBadge status="degraded" />);
    expect(screen.getByTitle('Responding slowly or intermittently')).toBeInTheDocument();
  });

  it('hides the decorative icon from assistive tech', () => {
    const { container } = render(<StatusBadge status="operational" />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('accepts additional class names without losing its own', () => {
    render(<StatusBadge status="operational" className="ml-2" />);
    const badge = screen.getByText('Operational');
    expect(badge).toHaveClass('ml-2');
    expect(badge).toHaveClass('text-status-operational');
  });
});

describe('StatusDot', () => {
  it('carries a text alternative because a dot alone conveys nothing', () => {
    render(<StatusDot status="operational" />);
    expect(screen.getByText('Operational')).toBeInTheDocument();
  });
});
