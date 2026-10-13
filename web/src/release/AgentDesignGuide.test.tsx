import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AgentDesignGuide } from './AgentDesignGuide';

describe('AgentDesignGuide', () => {
  it('explains when to split work and draws each pattern as readable steps', () => {
    render(<MemoryRouter><AgentDesignGuide /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Designing teams of agents' })).toBeInTheDocument();
    expect(screen.getByText(/Specialization\./)).toBeInTheDocument();
    expect(screen.getByLabelText('Builder then Reviewer, which can send work back')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'CS2680 pattern catalog' })).toHaveAttribute('href', '/community/explore?q=cs2680');
  });
});
