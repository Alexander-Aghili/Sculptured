export type View = 'home' | 'team' | 'agent' | 'structure';

export type KeyHelp = { keys: string; what: string; where: 'anywhere' | 'team' | 'structure' | 'agent' | 'goto' | 'sidebar' };

/** The full keymap shown by `?`. Every action also has a click target. */
export const KEYMAP: KeyHelp[] = [
  { keys: 'g  ·  Ctrl+K', what: 'go to an agent', where: 'anywhere' },
  { keys: '/', what: 'search agents (opens Go to)', where: 'anywhere' },
  { keys: '?', what: 'show this keymap', where: 'anywhere' },
  { keys: 'n', what: 'new team (Start from…)', where: 'anywhere' },
  { keys: 'j  ·  k', what: 'move the selection down or up', where: 'sidebar' },
  { keys: 'Enter', what: 'open the selected agent', where: 'sidebar' },
  { keys: 'l', what: 'switch between graph and list', where: 'team' },
  { keys: 'f', what: 'fit the graph to the view', where: 'team' },
  { keys: '+  ·  -', what: 'zoom in or out', where: 'team' },
  { keys: 'drag  ·  wheel', what: 'pan and zoom the graph', where: 'team' },
  { keys: 'n  then  Enter', what: 'add an agent at the next free place', where: 'structure' },
  { keys: 'Tab  ·  click', what: 'select an agent, group or connection', where: 'structure' },
  { keys: '←  ↑  →  ↓', what: 'move the selection (Shift: bigger steps)', where: 'structure' },
  { keys: 'Enter', what: "edit the selected agent's name, job and folder", where: 'structure' },
  { keys: 'Del  ·  Backspace', what: 'delete the selection', where: 'structure' },
  { keys: 'Ctrl+C  ·  Ctrl+V', what: 'copy · paste the selected agent or group (Command on Mac)', where: 'structure' },
  { keys: 'Ctrl+D', what: 'duplicate the selected agent or group', where: 'structure' },
  { keys: 'right-click', what: 'actions for the board, a group or an agent', where: 'structure' },
  { keys: 'Ctrl+Z  ·  Ctrl+Shift+Z', what: 'undo · redo', where: 'structure' },
  { keys: 'drag ●', what: 'connect: hands work to', where: 'structure' },
  { keys: 'f  ·  +  ·  -', what: 'fit · zoom', where: 'structure' },
  { keys: 'Esc', what: 'back to the team, keeping view and selection', where: 'agent' },
  { keys: '/', what: 'search the transcript (Enter: next match, Shift+Enter: previous)', where: 'agent' },
  { keys: 'Esc', what: 'after opening a transcript item from Visual progress: back to the picture', where: 'agent' },
  { keys: 'i', what: 'interrupt the current turn', where: 'agent' },
  { keys: 'Enter', what: 'send the message', where: 'agent' },
  { keys: 'Shift+Enter', what: 'new line in the message', where: 'agent' },
  { keys: 'Ctrl+C / Ctrl+V', what: 'copy / paste text (Command on Mac)', where: 'agent' },
  { keys: '↑  ·  ↓', what: 'move through the list', where: 'goto' },
  { keys: 'Alt+b  ·  Alt+w  ·  Alt+i  ·  Alt+d', what: 'filter: needs you or failed · working · idle · turn finished (✓)', where: 'goto' },
  { keys: 'Enter', what: 'jump to the agent', where: 'goto' },
  { keys: 'Esc', what: 'close an overlay', where: 'anywhere' },
];

type Hint = [string, string];

const COMMON: Hint[] = [
  ['g', 'goto'],
  ['/', 'search'],
  ['j/k', 'move'],
  ['⏎', 'open'],
];

const HINTS: Record<View, Hint[]> = {
  agent: [
      ['esc', 'back'],
      ['/', 'search'],
      ['i', 'interrupt'],
      ['⏎', 'send'],
      ['⇧⏎', 'newline'],
      ['g', 'goto'],
      ['?', 'keys'],
    ],
  structure: [
      ['n', 'new agent'],
      ['←↑→↓', 'move'],
      ['⏎', 'edit'],
      ['del', 'delete'],
      ['^z', 'undo'],
      ['f', 'fit'],
      ['g', 'goto'],
      ['?', 'keys'],
    ],
  team: [...COMMON, ['l', 'list'], ['f', 'fit'], ['n', 'new team'], ['?', 'keys']],
  home: [...COMMON, ['n', 'new team'], ['?', 'keys']],
};

/** The footer: the few keys that matter on each view. */
export function hintsFor(view: View): Hint[] {
  return HINTS[view];
}
