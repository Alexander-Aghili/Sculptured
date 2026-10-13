import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Highlight } from './highlight';
import { Markdown } from './Markdown';

describe('Markdown', () => {
  it('renders headings, lists, emphasis, tables and inline code', () => {
    const { container } = render(
      <Markdown text={'## Plan\n\n1. **Read** the *code*\n2. Run `npm test`\n\n- [x] done\n\n| file | change |\n| --- | --- |\n| a.ts | added |\n\n> quoted\n\n---'} />,
    );
    expect(screen.getByRole('heading', { name: 'Plan' })).toBeInTheDocument();
    const list = container.querySelector('ol')!;
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getByText('Read').tagName).toBe('STRONG');
    expect(within(list).getByText('code').tagName).toBe('EM');
    expect(within(list).getByText('npm test').tagName).toBe('CODE');
    expect(container.querySelector('ul')).toHaveTextContent('☑ done');
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['file', 'change']);
    expect(within(table).getByRole('cell', { name: 'added' })).toBeInTheDocument();
    expect(container.querySelector('blockquote')).toHaveTextContent('quoted');
    expect(container.querySelector('hr')).not.toBeNull();
  });

  it('shows fenced code in monospace with its language and a Copy button', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<Markdown text={'```ts\nconst x = 1;\n```'} />);
    const block = screen.getByRole('figure', { name: 'ts code' });
    expect(block).toHaveTextContent('ts');
    expect(block.querySelector('pre code')).toHaveTextContent('const x = 1;');
    await user.click(within(block).getByRole('button', { name: 'Copy code' }));
    expect(writeText).toHaveBeenCalledWith('const x = 1;');
    expect(await within(block).findByText('Copied')).toBeInTheDocument();
  });

  it('opens web links in a new tab safely and never links other schemes', () => {
    render(<Markdown text={'[docs](https://example.com/a) and [bad](javascript:alert(1)) and [data](data:text/html,x) ![img](https://e.com/i.png)'} />);
    const link = screen.getByRole('link', { name: 'docs' });
    expect(link).toHaveAttribute('href', 'https://example.com/a');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.queryByRole('link', { name: 'bad' })).toBeNull();
    expect(screen.getByText('bad')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'data' })).toBeNull();
    // Images are not loaded: they show as a link to the image.
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByRole('link', { name: 'image: img' })).toHaveAttribute('href', 'https://e.com/i.png');
  });

  it('never creates elements from raw HTML: scripts and handlers stay as visible text', () => {
    const evil = '<script>alert(1)</script>\n\nHi <img src=x onerror="alert(2)"> <a href="#" onclick="alert(3)">x</a>\n\n<div onmouseover="alert(4)">block</div>';
    const { container } = render(<Markdown text={evil} />);
    expect(container.querySelector('script, img, div[onmouseover], a[onclick]')).toBeNull();
    for (const el of container.querySelectorAll('*')) {
      for (const a of el.getAttributeNames()) expect(a.startsWith('on')).toBe(false);
    }
    expect(container).toHaveTextContent('<script>alert(1)</script>');
    expect(container).toHaveTextContent('onerror="alert(2)"');
  });

  it('keeps text verbatim, entities included', () => {
    const { container } = render(<Markdown text={'a &amp; b < c & d'} />);
    expect(container).toHaveTextContent('a &amp; b < c & d');
  });

  it('highlights search matches in text and code', () => {
    const { container } = render(
      <Highlight query="login">
        <Markdown text={'Added the **Login** page.\n\n```\nlogin()\n```'} />
      </Highlight>,
    );
    expect([...container.querySelectorAll('mark.hit')].map((m) => m.textContent)).toEqual(['Login', 'login']);
  });
});
