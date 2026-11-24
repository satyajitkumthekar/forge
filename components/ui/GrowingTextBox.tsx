/**
 * GrowingTextBox - the box food is typed into. Long text wraps onto the
 * next line and the box grows with it, up to five lines; after that it
 * scrolls inside, like any chat box.
 *
 * It still behaves like a one-line box: Enter sends the form it sits in
 * (exactly when the form's Send button would), and typed or pasted text
 * stays one line (a new line becomes a space).
 */

import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

// Pages are also rendered ahead of time, where layout effects cannot run
const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

// Size, padding, border and type shared by the box, its one-line hint and
// the hidden copy used for measuring, so all three line up exactly. One
// line comes to 44px, the height of the buttons beside it.
const SHAPE = 'w-full px-3 py-[9px] border rounded-ctrl text-base';

interface GrowingTextBoxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Lines shown before the box scrolls inside instead of growing */
  maxLines?: number;
  /** Lets the screen put the cursor in the box */
  inputRef?: React.Ref<HTMLTextAreaElement>;
}

export default function GrowingTextBox({
  value,
  onChange,
  placeholder,
  disabled,
  maxLines = 5,
  inputRef,
}: GrowingTextBoxProps) {
  const box = useRef<HTMLTextAreaElement | null>(null);
  const copy = useRef<HTMLTextAreaElement | null>(null);

  const setBox = useCallback(
    (node: HTMLTextAreaElement | null) => {
      box.current = node;
      if (typeof inputRef === 'function') inputRef(node);
      else if (inputRef) inputRef.current = node;
    },
    [inputRef]
  );

  // Sizes the box to the text as it wraps now. The text is measured in a
  // hidden copy, so nothing around the box moves while it is measured.
  const fit = useCallback(() => {
    const el = box.current;
    const twin = copy.current;
    if (!el || !twin) return;
    const style = window.getComputedStyle(el);
    const line = parseFloat(style.lineHeight) || 24;
    const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const border = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    twin.value = el.value || ' ';
    const needed = twin.scrollHeight + border;
    const tallest = line * maxLines + padding + border;
    el.style.height = `${Math.min(needed, tallest)}px`;
    el.style.overflowY = needed > tallest + 1 ? 'auto' : 'hidden';
  }, [maxLines]);

  useBrowserLayoutEffect(fit, [value, fit]);

  // The lines also rewrap when only the width changes: turning the phone,
  // or the Send button changing its label
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let width = el.clientWidth;
    const watcher = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      fit();
    });
    watcher.observe(el);
    return () => watcher.disconnect();
  }, [fit]);

  // Enter sends, the way it does in a one-line box: not while the keyboard
  // is still putting a word together, and not while Send is switched off
  const send = useCallback(() => {
    const form = box.current?.form;
    if (!form) return;
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (!button) form.requestSubmit();
    else if (!button.disabled) button.click();
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    event.preventDefault();
    send();
  };

  // Some phone keyboards announce Enter only as a new line being added
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onBeforeInput = (event: InputEvent) => {
      if (event.inputType !== 'insertLineBreak' && event.inputType !== 'insertParagraph') return;
      event.preventDefault();
      if (!event.isComposing) send();
    };
    el.addEventListener('beforeinput', onBeforeInput);
    return () => el.removeEventListener('beforeinput', onBeforeInput);
  }, [send]);

  return (
    <div className="relative flex-1 min-w-0">
      <textarea
        ref={setBox}
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\r?\n/g, ' '))}
        onKeyDown={handleKeyDown}
        rows={1}
        enterKeyHint="send"
        aria-label={placeholder}
        disabled={disabled}
        className={`${SHAPE} block resize-none overflow-hidden border-line-strong focus:outline-none focus:ring-1 focus:ring-ink-muted bg-paper-raised/70 backdrop-blur-sm text-ink transition duration-150`}
      />

      {/* The hint, kept to one line with an ellipsis on narrow screens
          (a hint inside a text box would wrap and be cut off) */}
      {!value && placeholder && (
        <span
          aria-hidden="true"
          className={`${SHAPE} absolute left-0 top-0 border-transparent truncate select-none pointer-events-none text-ink-faint`}
        >
          {placeholder}
        </span>
      )}

      {/* Hidden copy, only for measuring how tall the text is */}
      <textarea
        ref={copy}
        rows={1}
        tabIndex={-1}
        aria-hidden="true"
        readOnly
        className={`${SHAPE} absolute left-0 top-0 h-0 invisible overflow-hidden resize-none pointer-events-none`}
      />
    </div>
  );
}
