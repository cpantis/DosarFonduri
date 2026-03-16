"use client";
import { useState, useRef, useEffect, useCallback, ReactNode } from "react";

interface SplitPaneProps {
  left: ReactNode;
  right: ReactNode;
  defaultWidth?: number;
  minLeft?: number;
  minRight?: number;
  maxRight?: number;
  side?: "left" | "right";
}

export function SplitPane({
  left,
  right,
  defaultWidth = 320,
  minLeft = 200,
  minRight = 200,
  maxRight = 600,
  side = "right",
}: SplitPaneProps) {
  const [panelW, setPanelW] = useState(defaultWidth);
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const onDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleMove = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const nw = side === "right" ? rect.right - clientX : clientX - rect.left;
    const cl = Math.max(minRight, Math.min(maxRight, nw));
    if (rect.width - cl >= minLeft) setPanelW(cl);
  }, [side, minLeft, minRight, maxRight]);

  useEffect(() => {
    if (!dragging) return;
    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX);
    const onTouchMove = (e: TouchEvent) => { if (e.touches[0]) handleMove(e.touches[0].clientX); };
    const onUp = () => setDragging(false);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("touchmove", onTouchMove);
    document.addEventListener("touchend", onUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onUp);
    };
  }, [dragging, handleMove]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 40 : 10;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const delta = e.key === "ArrowLeft" ? -step : step;
      // For right-side panel, left arrow grows it, right shrinks
      const adjust = side === "right" ? -delta : delta;
      setPanelW(prev => {
        const next = prev + adjust;
        return Math.max(minRight, Math.min(maxRight, next));
      });
    }
  }, [side, minRight, maxRight]);

  const handle = (
    <div
      className="w-2 cursor-col-resize flex items-center justify-center relative z-10 flex-shrink-0 group transition-colors"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panels"
      aria-valuenow={panelW}
      aria-valuemin={minRight}
      aria-valuemax={maxRight}
      tabIndex={0}
      onMouseDown={onDown}
      onTouchStart={onDown}
      onKeyDown={onKeyDown}
    >
      <div
        className="absolute top-0 bottom-0 w-px transition-all"
        style={{
          left: dragging ? "2px" : "3px",
          width: dragging ? "3px" : "1px",
          background: dragging ? "#4d8bff" : "#e0e4ea",
          boxShadow: dragging ? "0 0 4px rgba(77,139,255,.3)" : undefined,
        }}
      />
    </div>
  );

  return (
    <div
      ref={containerRef}
      className="flex h-full flex-1 min-h-0 overflow-hidden"
      style={{ userSelect: dragging ? "none" : "auto" }}
    >
      {side === "left" ? (
        <>
          <div
            className="flex flex-col min-h-0 h-full flex-shrink-0 overflow-hidden"
            style={{ width: panelW, minWidth: minRight, maxWidth: maxRight }}
          >
            {left}
          </div>
          {handle}
          <div
            className="flex-1 flex flex-col min-h-0 h-full overflow-hidden"
            style={{ minWidth: minLeft }}
          >
            {right}
          </div>
        </>
      ) : (
        <>
          <div
            className="flex-1 flex flex-col min-h-0 h-full overflow-hidden"
            style={{ minWidth: minLeft }}
          >
            {left}
          </div>
          {handle}
          <div
            className="flex flex-col min-h-0 h-full flex-shrink-0 overflow-hidden"
            style={{ width: panelW, minWidth: minRight, maxWidth: maxRight }}
          >
            {right}
          </div>
        </>
      )}
    </div>
  );
}
