import { useEffect, useRef, useState } from 'react';

export interface TextSelection {
  text: string;
  startOffset: number;
  endOffset: number;
  paragraphId: string;
}

export function useTextSelection(
  paragraphId: string | null,
  containerRef: React.RefObject<HTMLElement> | null,
  enabled: boolean = true
) {
  const [selection, setSelection] = useState<TextSelection | null>(null);
  const lastRequestRef = useRef<number>(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    setSelection(null);
  }, [paragraphId, enabled]);

  useEffect(() => {
    if (!enabled) return;

    const handleSelectionChange = () => {
      const currentRequest = ++lastRequestRef.current;

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        if (currentRequest !== lastRequestRef.current) return;

        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
          setSelection(null);
          return;
        }

        const range = sel.getRangeAt(0);
        const selectedText = sel.toString().trim();

        if (!selectedText || selectedText.length < 2) {
          setSelection(null);
          return;
        }

        if (containerRef?.current) {
          const container = containerRef.current;
          if (
            !container.contains(range.startContainer) ||
            !container.contains(range.endContainer)
          ) {
            setSelection(null);
            return;
          }
        }

        const container = containerRef?.current || range.commonAncestorContainer.parentElement;
        let startOffset = 0;
        let endOffset = 0;

        if (container) {
          const preRange = document.createRange();
          preRange.selectNodeContents(container);
          preRange.setEnd(range.startContainer, range.startOffset);
          startOffset = preRange.toString().length;
          endOffset = startOffset + selectedText.length;
        }

        setSelection({
          text: selectedText,
          startOffset,
          endOffset,
          paragraphId: paragraphId || '',
        });
      }, 150);
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    document.addEventListener('mouseup', handleSelectionChange);
    document.addEventListener('keyup', handleSelectionChange);

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      document.removeEventListener('mouseup', handleSelectionChange);
      document.removeEventListener('keyup', handleSelectionChange);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [paragraphId, containerRef, enabled]);

  const clearSelection = () => {
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  };

  return { selection, setSelection, clearSelection };
}
