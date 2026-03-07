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

  const onDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const nw = side === "right" ? rect.right - e.clientX : e.clientX - rect.left;
      const cl = Math.max(minRight, Math.min(maxRight, nw));
      if (rect.width - cl >= minLeft) setPanelW(cl);
    };
    const onUp = () => setDragging(false);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [dragging, minLeft, minRight, maxRight, side]);

  const handle = (
    <div
      className="w-2 cursor-col-resize flex items-center justify-center relative z-10 flex-shrink-0 group transition-colors"
      onMouseDown={onDown}
    >
      <div
        className="absolute top-0 bottom-0 w-px transition-all"
        style={{
          left: dragging ? "2px" : "3px",
          width: dragging ? "3px" : "1px",
          background: dragging ? "var(--accent-blue)" : "var(--border)",
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
