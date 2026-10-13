import type { GroupBlock } from '../generated/GroupBlock';
import { sanitizeExport } from '../release/sharing';
import { workspaceOrigin } from '../release/workspaceLink';
const PREFIX='#import-block=';
export function blockTransferUrl(origin:string,block:GroupBlock):string {
  const local=workspaceOrigin(origin);
  if(!local)throw Error('Open Community from your local workspace to add blocks.');
  const json=JSON.stringify(sanitizeExport(block));
  if(json.length>500000)throw Error('This block is too large for direct import. Download it and import from Library.');
  return `${local}/library/groups${PREFIX}${encodeURIComponent(json)}`;
}
export function transferredBlock(hash:string):GroupBlock|null {
  if(!hash.startsWith(PREFIX))return null;
  if(hash.length>4500000)throw Error('This block is too large to import.');
  const json=decodeURIComponent(hash.slice(PREFIX.length));
  if(json.length>500000)throw Error('This block is too large to import.');
  return sanitizeExport(JSON.parse(json));
}
