/** Saves `text` as a file through the page, using a Blob URL (never a data: link). */
export function downloadText(filename: string, text: string, type = 'application/yaml'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
