import {useState,isValidElement,Children,type ReactNode,type HTMLAttributes} from 'react';
function text(node:ReactNode):string {
  return Children.toArray(node).map(n=>isValidElement<{children?:ReactNode}>(n)?text(n.props.children):typeof n==='string'||typeof n==='number'?String(n):'').join('');
}
/** Acknowledging a notice never clears the underlying failed state or evidence. */
export function DismissibleError({message,children,className='',...props}:{message?:string;children?:ReactNode}&HTMLAttributes<HTMLDivElement>) {
  const [dismissed,setDismissed]=useState<string|null>(null);
  const signature=message??text(children);
  if(dismissed===signature)return null;
  return <div {...props} role="alert" className={`dismissible-error ${className}`}><div>{children??message}</div><button type="button" className="error-dismiss" aria-label="Dismiss error" title="Dismiss error" onClick={()=>setDismissed(signature)}>×</button></div>;
}
