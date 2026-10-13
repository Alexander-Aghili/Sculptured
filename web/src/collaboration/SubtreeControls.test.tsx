import { render,screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect,it,vi } from 'vitest';
import { compiledRig } from '../test-fixtures';
import { SubtreeControls } from './SubtreeControls';
it('lets users focus a selected branch, move to its parent, or return to the whole tree',async()=>{
 const rig=compiledRig();const children=[{parent:rig.seats[0].id,child:rig.seats[1].id}];const onChange=vi.fn();const user=userEvent.setup();
 const props={compiled:rig,children,onChange,selected:rig.seats[1].id};
 const {rerender}=render(<SubtreeControls {...props}/>);
 await user.click(screen.getByRole('button',{name:'Focus selected subtree'}));expect(onChange).toHaveBeenLastCalledWith(rig.seats[1].id);
 rerender(<SubtreeControls {...props} root={rig.seats[1].id}/>);
 await user.click(screen.getByRole('button',{name:'Up to parent'}));expect(onChange).toHaveBeenLastCalledWith(rig.seats[0].id);
 await user.click(screen.getByRole('button',{name:'Whole tree'}));expect(onChange).toHaveBeenLastCalledWith('');
 await user.selectOptions(screen.getByRole('combobox',{name:'View subtree'}),rig.seats[0].id);expect(onChange).toHaveBeenLastCalledWith(rig.seats[0].id);
 rerender(<SubtreeControls {...props} root="previous-run"/>);
 expect(screen.getByRole('option',{name:'Previous subtree (unavailable)'})).toBeInTheDocument();
});
