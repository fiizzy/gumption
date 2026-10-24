import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { CanvasNode } from "../types";

const HISTORY_LIMIT = 100;

// Content equality for undo purposes — ignores selection, measurement and
// drag flags. Every content edit replaces a node's `data` object (or its
// position/zIndex), so reference checks are enough and stay cheap even
// with large embedded images.
export function hasSameContent(first: CanvasNode[], second: CanvasNode[]): boolean {
  if (first === second) return true;
  if (first.length !== second.length) return false;
  return first.every((node, index) => {
    const other = second[index];
    return (
      node.id === other.id &&
      node.data === other.data &&
      node.position.x === other.position.x &&
      node.position.y === other.position.y &&
      (node.zIndex ?? 0) === (other.zIndex ?? 0)
    );
  });
}

interface Options {
  nodes: CanvasNode[];
  setNodes: Dispatch<SetStateAction<CanvasNode[]>>;
  // While text is being edited every keystroke changes `data`, and while a
  // diagram streams in every operation does; each should land as one undo
  // step once it ends.
  isEditing: boolean;
}

// Snapshot history over the node list. A change becomes an undo step once
// it settles — no pointer held (so a drag/resize/draw is one step, not one
// per frame) and no text being edited.
export function useCanvasHistory({ nodes, setNodes, isEditing }: Options) {
  const pastRef = useRef<CanvasNode[][]>([]);
  const futureRef = useRef<CanvasNode[][]>([]);
  const committedRef = useRef<CanvasNode[]>(nodes);
  const latestNodesRef = useRef<CanvasNode[]>(nodes);
  const [isPointerDown, setIsPointerDown] = useState(false);
  const [historySizes, setHistorySizes] = useState({ past: 0, future: 0 });

  useEffect(() => {
    latestNodesRef.current = nodes;
  }, [nodes]);

  const syncHistorySizes = useCallback(() => {
    setHistorySizes({ past: pastRef.current.length, future: futureRef.current.length });
  }, []);

  useEffect(() => {
    const onPointerDown = () => setIsPointerDown(true);
    const onPointerUp = () => setIsPointerDown(false);
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("pointercancel", onPointerUp, true);
    window.addEventListener("blur", onPointerUp);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("pointercancel", onPointerUp, true);
      window.removeEventListener("blur", onPointerUp);
    };
  }, []);

  const commit = useCallback(() => {
    const current = latestNodesRef.current;
    if (hasSameContent(committedRef.current, current)) return;
    pastRef.current.push(committedRef.current);
    if (pastRef.current.length > HISTORY_LIMIT) pastRef.current.shift();
    futureRef.current = [];
    committedRef.current = current;
    syncHistorySizes();
  }, [syncHistorySizes]);

  // Deferred a macrotask so the trailing events of a gesture (xyflow's
  // final drag position arrives on mouseup, after our pointerup) land in
  // the same step rather than splitting it in two.
  useEffect(() => {
    if (isPointerDown || isEditing) return;
    const timer = setTimeout(commit, 0);
    return () => clearTimeout(timer);
  }, [nodes, isPointerDown, isEditing, commit]);

  const undo = useCallback(() => {
    commit();
    const previous = pastRef.current.pop();
    if (!previous) return;
    futureRef.current.push(committedRef.current);
    committedRef.current = previous;
    latestNodesRef.current = previous;
    setNodes(previous);
    syncHistorySizes();
  }, [commit, setNodes, syncHistorySizes]);

  const redo = useCallback(() => {
    commit();
    const next = futureRef.current.pop();
    if (!next) return;
    pastRef.current.push(committedRef.current);
    committedRef.current = next;
    latestNodesRef.current = next;
    setNodes(next);
    syncHistorySizes();
  }, [commit, setNodes, syncHistorySizes]);

  const reset = useCallback(
    (initialNodes: CanvasNode[]) => {
      pastRef.current = [];
      futureRef.current = [];
      committedRef.current = initialNodes;
      latestNodesRef.current = initialNodes;
      syncHistorySizes();
    },
    [syncHistorySizes],
  );

  return {
    undo,
    redo,
    reset,
    canUndo: historySizes.past > 0,
    canRedo: historySizes.future > 0,
  };
}
