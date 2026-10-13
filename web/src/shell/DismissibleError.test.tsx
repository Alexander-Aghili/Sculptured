import {render,screen,fireEvent} from '@testing-library/react';
import {it,expect} from 'vitest';
import {DismissibleError} from './DismissibleError';
it('dismisses repeated failures but exposes changed errors and leaves retry available',()=>{
 const {rerender}=render(<DismissibleError>Failed to stop <button>Retry</button></DismissibleError>);
 expect(screen.getByRole('button',{name:'Retry'})).toBeVisible();fireEvent.click(screen.getByRole('button',{name:'Dismiss error'}));expect(screen.queryByRole('alert')).toBeNull();
 rerender(<DismissibleError>Failed to stop <button>Retry</button></DismissibleError>);expect(screen.queryByRole('alert')).toBeNull();
 rerender(<DismissibleError>Connection lost</DismissibleError>);expect(screen.getByRole('alert')).toHaveTextContent('Connection lost');
});
