import type { Binding, CanvasNode, Point } from "../types";

// Copies `sourceNodes` with fresh ids, shifted by `offset`, selected.
// Expects line geometry already resolved (see resolveLineBindings) so that
// dropping a binding whose target wasn't copied leaves the line exactly
// where it was drawn. Bindings between copied nodes are re-pointed at the
// copies.
export function cloneNodes(sourceNodes: CanvasNode[], offset: Point): CanvasNode[] {
  const newIdByOldId = new Map(sourceNodes.map((node) => [node.id, crypto.randomUUID()]));
  const remapBinding = (binding: Binding | null): Binding | null => {
    const newElementId = binding ? newIdByOldId.get(binding.elementId) : undefined;
    return binding && newElementId ? { ...binding, elementId: newElementId } : null;
  };

  return sourceNodes.map((node) => {
    const base = {
      id: newIdByOldId.get(node.id)!,
      position: { x: node.position.x + offset.x, y: node.position.y + offset.y },
      selected: true,
    };
    if (node.type === "lineElement") {
      return {
        ...base,
        type: node.type,
        data: {
          ...node.data,
          startBinding: remapBinding(node.data.startBinding),
          endBinding: remapBinding(node.data.endBinding),
        },
      };
    }
    return { ...base, type: node.type, data: { ...node.data } } as CanvasNode;
  });
}
