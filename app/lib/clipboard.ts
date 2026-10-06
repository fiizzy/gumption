// The async Clipboard API needs a secure context and focus; the hidden
// textarea + execCommand fallback covers WebViews or moments where it's
// unavailable or rejects.
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // Fall through to the legacy path.
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const didCopy = document.execCommand("copy");
  textarea.remove();
  if (!didCopy) throw new Error("Copying to the clipboard isn't available here.");
}
