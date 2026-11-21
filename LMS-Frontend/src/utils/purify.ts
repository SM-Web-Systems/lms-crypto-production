import DOMPurify from 'dompurify';

// Shared by every Markdown renderer, so each one gets the same link hook however it is imported.
// Force new-tab links to have noopener
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

export default DOMPurify;
