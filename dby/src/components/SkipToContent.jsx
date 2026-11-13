import React from 'react';

export default function SkipToContent() {
  return <a className="skip-to-content" href="#main-content" onClick={event => {
    const main = document.querySelector('main');
    if (!main) return;
    event.preventDefault();
    main.tabIndex = -1;
    main.focus({ preventScroll: true });
    main.scrollIntoView({ block: 'start', behavior: 'instant' });
  }}>Skip to main content</a>;
}
