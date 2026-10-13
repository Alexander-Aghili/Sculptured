import {render,screen,fireEvent} from '@testing-library/react';
import {it,expect,vi} from 'vitest';
import {CommunicationMap} from './CommunicationMap';
it('keeps separate clickable sender and recipient lists with keyboard-accessible routes',()=>{
 const sender=vi.fn(),recipient=vi.fn(),pair=vi.fn();render(<CommunicationMap routes={[{key:'ab',from:'a',to:'b',count:3}]} name={id=>id} onSender={sender} onRecipient={recipient} onPair={pair}/>);
 expect(screen.getByText('Senders · outbound')).toBeVisible();expect(screen.getByText('Recipients · inbound')).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'Map outbound from a'}));expect(sender).toHaveBeenCalledWith('a');
 fireEvent.keyDown(screen.getByRole('button',{name:'Map inbound to b'}),{key:'Enter'});expect(recipient).toHaveBeenCalledWith('b');
 fireEvent.keyDown(screen.getByRole('button',{name:'Filter pair a → b: 3 messages'}),{key:' '});expect(pair).toHaveBeenCalledWith('a','b');
});
