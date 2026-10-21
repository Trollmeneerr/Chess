/**
 * Clipboard & Game Export Utility
 * Provides cross-browser clipboard copy with visual feedback for standard chess moves/PGN.
 */

/**
 * Copies PGN or moves notation to the user clipboard.
 * @param {string} pgnOrMoves - PGN notation string
 * @param {HTMLElement} [buttonElement] - Optional button element to trigger visual feedback
 * @returns {Promise<void>}
 */
export async function copyMovesToClipboard(pgnOrMoves, buttonElement) {
  if (!pgnOrMoves) {
    alert('No moves available to copy.');
    throw new Error('Empty moves string');
  }

  const text = String(pgnOrMoves).trim();

  const doCopy = async () => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    // Fallback using textarea execCommand
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (!ok) throw new Error('execCommand copy failed');
    } catch (err) {
      document.body.removeChild(ta);
      throw err;
    }
  };

  try {
    await doCopy();
    if (buttonElement) {
      const origText = buttonElement.innerHTML;
      buttonElement.innerHTML = '✓ Copied Moves!';
      buttonElement.classList.add('btn-copied-success');
      setTimeout(() => {
        buttonElement.innerHTML = origText;
        buttonElement.classList.remove('btn-copied-success');
      }, 2000);
    }
  } catch (err) {
    console.warn('[Clipboard] Copy failed, falling back to manual prompt:', err);
    window.prompt('Copy game moves / PGN:', text);
  }
}

if (typeof window !== 'undefined') {
  window.copyMovesToClipboard = copyMovesToClipboard;
}
