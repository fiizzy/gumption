import type { Binding, CanvasNode, Point } from "../types";

// Copies `sourceNodes` with fresh ids, shifted by `offset`, selected.
// Expects line geometry already resolved (see resolveLineBindings) so that
// dropping a binding whose target wasn't copied leaves the line exactly
// where it was drawn. Bindings and branch links between copied nodes are
// re-pointed at the copies; a chat node still waiting on its AI reply is
// skipped, since that reply can only ever land on the original.
export function cloneNodes(sourceNodes: CanvasNode[], offset: Point): CanvasNode[] {
  const copyableNodes = sourceNodes.filter((node) => !(node.type === "conversation" && node.data.loading));
  const newIdByOldId = new Map(copyableNodes.map((node) => [node.id, crypto.randomUUID()]));
  const remapBinding = (binding: Binding | null): Binding | null => {
    const newElementId = binding ? newIdByOldId.get(binding.elementId) : undefined;
    return binding && newElementId ? { ...binding, elementId: newElementId } : null;
  };

  return copyableNodes.map((node) => {
    const base = {
      id: newIdByOldId.get(node.id)!,
      position: { x: node.position.x + offset.x, y: node.position.y + offset.y },
      selected: true,
    };
    switch (node.type) {
      case "lineElement":
        return {
          ...base,
          type: node.type,
          data: {
            ...node.data,
            startBinding: remapBinding(node.data.startBinding),
            endBinding: remapBinding(node.data.endBinding),
          },
        };
      case "conversation":
        return {
          ...base,
          type: node.type,
          data: {
            ...node.data,
            branchParentId: node.data.branchParentId
              ? (newIdByOldId.get(node.data.branchParentId) ?? node.data.branchParentId)
              : null,
          },
        };
      default:
        return { ...base, type: node.type, data: { ...node.data } } as CanvasNode;
    }
  });
}
