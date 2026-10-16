import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../api';
import { openRigWords } from '../test-vocab';
import { FolderPicker } from './FolderPicker';
import { HOME, PROJECTS } from './harness';

vi.mock('../api', async (orig) => {
  const m = await orig<typeof import('../api')>();
  return { ...m, api: { ...m.api, listFolders: vi.fn(), createFolder: vi.fn() } };
});

beforeEach(() => {
  vi.mocked(api.createFolder).mockReset();
  vi.mocked(api.listFolders).mockReset().mockImplementation(async (p?: string) => {
    if (!p || p === '/home/me') return HOME;
    if (p === '/home/me/projects') return PROJECTS;
    if (p === '/home/me/projects/new-app') return { ...PROJECTS, path: p, parent: '/home/me/projects', entries: [] };
    if (p === '/etc') throw new ApiError(403, 'outside_home', 'Only folders inside your home folder can be chosen here');
    throw new ApiError(404, 'folder_missing', 'That folder does not exist');
  });
});

function picker(initialPath: string | null = null) {
  const onChoose = vi.fn();
  const onClose = vi.fn();
  render(
    <>
      <button type="button">opener</button>
      <FolderPicker initialPath={initialPath} onChoose={onChoose} onClose={onClose} />
    </>,
  );
  return { onChoose, onClose };
}

describe('FolderPicker', () => {
  it('starts at home, lists folders only, goes down and Up, and chooses the folder shown', async () => {
    const { onChoose } = picker();
    const dialog = await screen.findByRole('dialog', { name: 'Choose a folder' });
    await within(dialog).findByRole('button', { name: 'Open projects' });
    const up = within(dialog).getByRole('button', { name: 'Up' });
    expect(up).toBeDisabled();
    expect(up).toHaveAccessibleDescription('This is your home folder.');
    const user = userEvent.setup();
    await user.click(within(dialog).getByRole('button', { name: 'Open projects' }));
    await within(dialog).findByRole('button', { name: 'Open web-shop' });
    expect(within(dialog).getByText('~/projects')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Up' }));
    await within(dialog).findByRole('button', { name: 'Open notes' });
    await user.click(within(dialog).getByRole('button', { name: 'Open projects' }));
    await user.click(await within(dialog).findByRole('button', { name: 'Use ~/projects' }));
    expect(onChoose).toHaveBeenCalledWith('/home/me/projects');
    expect(openRigWords(document.body)).toEqual([]);
  });

  it('a saved folder that is gone falls back to home and says so in plain words', async () => {
    picker('/home/me/old-thing');
    const note = await screen.findByRole('status');
    expect(note).toHaveTextContent('~/old-thing could not be shown, so this starts in your home folder.');
    expect(await screen.findByRole('button', { name: 'Open projects' })).toBeInTheDocument();
  });

  it('creates a folder with a fresh request id per attempt and shows refusals in plain words', async () => {
    picker('/home/me/projects');
    const user = userEvent.setup();
    await screen.findByRole('button', { name: 'Open web-shop' });
    await user.click(screen.getByRole('button', { name: 'New folder' }));
    const name = screen.getByRole('textbox', { name: 'new folder in ~/projects' });
    expect(name).toHaveFocus();
    vi.mocked(api.createFolder).mockRejectedValueOnce(new ApiError(409, 'folder_exists', 'A folder called web-shop already exists here'));
    await user.type(name, 'web-shop{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('A folder with that name is already here.');
    vi.mocked(api.createFolder).mockRejectedValueOnce(new ApiError(400, 'bad_path', "That folder path can't be used: weird"));
    await user.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("That folder path can't be used.");
    vi.mocked(api.createFolder).mockResolvedValueOnce({ name: 'new-app', path: '/home/me/projects/new-app' });
    await user.clear(name);
    await user.type(name, 'new-app{Enter}');
    await waitFor(() => expect(screen.getByText('~/projects/new-app')).toBeInTheDocument());
    const ids = vi.mocked(api.createFolder).mock.calls.map((c) => c[2]);
    expect(new Set(ids).size).toBe(3);
    expect(vi.mocked(api.createFolder).mock.calls[2].slice(0, 2)).toEqual(['/home/me/projects', 'new-app']);
  });

  it('maps every folder error code to plain words', async () => {
    const { FOLDER_WORDS, folderError } = await import('./FolderPicker');
    for (const code of ['outside_home', 'folder_missing', 'not_a_folder', 'folder_unreadable', 'bad_path', 'bad_folder_name', 'folder_exists'])
      expect(folderError(new ApiError(400, code, 'server text'))).toBe(FOLDER_WORDS[code]);
    expect(folderError(new ApiError(400, 'something_new', 'Server says so'))).toBe('Sculptured could not do that (error 400). Reload the page and try again.');
  });

  it('says how to allow a folder macOS keeps from Sculptured', async () => {
    const { folderError } = await import('./FolderPicker');
    expect(folderError(new ApiError(403, 'folder_unreadable', 'server text'))).toMatch(/Mac.*System Settings → Privacy & Security/);
  });

  it('Esc closes and returns focus to where it came from', async () => {
    screen.queryByRole('dialog');
    const { onClose } = picker();
    await screen.findByRole('button', { name: 'Open projects' });
    await userEvent.setup().keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});

it('browses the computer that runs the team when given a team', async () => {
  render(<FolderPicker team="t1" initialPath={null} onChoose={() => {}} onClose={() => {}} />);
  await screen.findByRole('dialog');
  expect(vi.mocked(api.listFolders).mock.calls[0]).toEqual([undefined, { team: 't1' }]);
});

it('on a computer, Up from an allowed folder goes back to the list of allowed folders', async () => {
  const top = { path: '', parent: null, home: '', truncated: false, entries: [{ name: '/w/a', path: '/w/a' }, { name: '/w/b', path: '/w/b' }] };
  vi.mocked(api.listFolders).mockImplementation(async (p?: string) =>
    p === '/w/a' ? { path: '/w/a', parent: null, home: '/w/a', truncated: false, entries: [] } : top);
  render(<FolderPicker team="t1" initialPath="/w/a" onChoose={() => {}} onClose={() => {}} />);
  await screen.findByRole('dialog');
  expect(await screen.findByText('/w/a', { selector: '.fp-here' })).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: 'Up' }));
  expect(await screen.findByText('Folders this computer allows', { selector: '.fp-here' })).toBeTruthy();
  expect(vi.mocked(api.listFolders).mock.calls.at(-1)).toEqual([undefined, { team: 't1' }]);
});

describe('choosing files', () => {
  it('lists a folder\'s files, keeps ticks across folders, and gives back their full paths', async () => {
    vi.mocked(api.listFolders).mockImplementation(async (p?: string) => {
      if (!p || p === '/home/me') return { ...HOME, files: [{ name: 'brief.pdf', path: '/home/me/brief.pdf' }] };
      return { ...PROJECTS, files: [{ name: 'spec.md', path: '/home/me/projects/spec.md' }] };
    });
    const chosen = vi.fn();
    render(<FolderPicker initialPath={null} onChoose={vi.fn()} pickFiles={chosen} onClose={vi.fn()} />);
    await userEvent.click(await screen.findByRole('checkbox', { name: 'brief.pdf' }));
    await userEvent.click(screen.getByRole('button', { name: 'Open projects' }));
    await userEvent.click(await screen.findByRole('checkbox', { name: 'spec.md' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add 2 files' }));
    expect(chosen).toHaveBeenCalledWith(['/home/me/brief.pdf', '/home/me/projects/spec.md']);
    expect(api.listFolders).toHaveBeenCalledWith('/home/me/projects', {}, true);
  });

  it('says when the computer\'s runner is too old to list files', async () => {
    render(<FolderPicker initialPath={null} onChoose={vi.fn()} pickFiles={vi.fn()} onClose={vi.fn()} />);
    expect(await screen.findByText(/cannot list files yet/)).toBeInTheDocument();
  });
});
