import { Link } from 'react-router-dom';
import { Icon } from '../shell/ui';
import './hosted.css';

/** Back to the main app (projects and the board) from a page that has no sidebar. */
export function BackToApp() {
  return (
    <Link to="/" className="back-to-app">
      <Icon name="arrow-left" size={15} />Back to Sculptured
    </Link>
  );
}
