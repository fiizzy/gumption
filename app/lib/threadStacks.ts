import type { CanvasNode, ConversationNode, Point } from "../types";
import { getNodeBox } from "./geometry";

// How many cards peek out behind a deck's top card.
export const MAX_VISIBLE_DECK_LAYERS = 4;

export interface Thread {
  rootId: string;
  // In creation order (the order they appear in the node list).
  memberIds: string[];
}

export interface Deck {
  rootId: string;
  topId: string;
  memberIds: string[];
  // Where the deck sits: the thread root's own position.
  position: Point;
}

// A thread is a chat and every follow-up/branch descending from it. A
// branch parent that no longer exists (deleted) starts a new thread.
export function findThreads(nodes: CanvasNode[]): Thread[] {
  const conversations = nodes.filter((node): node is ConversationNode => node.type === "conversation");
  const conversationIds = new Set(conversations.map((node) => node.id));
  const parentById = new Map(
    conversations.map((node) => [
      node.id,
      node.data.branchParentId && conversationIds.has(node.data.branchParentId) ? node.data.branchParentId : null,
    ]),
  );
  const rootOf = (id: string): string => {
    const visited = new Set<string>();
    let current = id;
    while (parentById.get(current) && !visited.has(current)) {
      visited.add(current);
      current = parentById.get(current)!;
    }
    return current;
  };
  const threadsByRoot = new Map<string, Thread>();
  for (const node of conversations) {
    const rootId = rootOf(node.id);
    const thread = threadsByRoot.get(rootId) ?? { rootId, memberIds: [] };
    thread.memberIds.push(node.id);
    threadsByRoot.set(rootId, thread);
  }
  return [...threadsByRoot.values()];
}

// Stacked threads show only their most recent card, moved onto the root's
// position; the rest are hidden. Positions here are display-only — the
// stored positions are untouched, so unstacking restores the layout.
export function findDecks(nodes: CanvasNode[], expandedRootIds: ReadonlySet<string>): Deck[] {
  const positionById = new Map(nodes.map((node) => [node.id, node.position]));
  return findThreads(nodes)
    .filter((thread) => thread.memberIds.length > 1 && !expandedRootIds.has(thread.rootId))
    .map((thread) => ({
      rootId: thread.rootId,
      topId: thread.memberIds[thread.memberIds.length - 1],
      memberIds: thread.memberIds,
      position: positionById.get(thread.rootId)!,
    }));
}

export interface StackedView {
  nodes: CanvasNode[];
  deckByTopId: Map<string, Deck>;
  hiddenIds: Set<string>;
}

export function applyThreadStacking(nodes: CanvasNode[], decks: Deck[]): StackedView {
  const deckByTopId = new Map(decks.map((deck) => [deck.topId, deck]));
  const hiddenIds = new Set(decks.flatMap((deck) => deck.memberIds.filter((id) => id !== deck.topId)));
  if (decks.length === 0) return { nodes, deckByTopId, hiddenIds };
  const stackedNodes = nodes.map((node) => {
    const deck = deckByTopId.get(node.id);
    if (deck) return { ...node, position: deck.position } as CanvasNode;
    if (hiddenIds.has(node.id)) return { ...node, hidden: true } as CanvasNode;
    // Lines attached to a hidden card would point at nothing.
    if (
      node.type === "lineElement" &&
      [node.data.startBinding, node.data.endBinding].some((binding) => binding && hiddenIds.has(binding.elementId))
    ) {
      return { ...node, hidden: true } as CanvasNode;
    }
    return node;
  });
  return { nodes: stackedNodes, deckByTopId, hiddenIds };
}

// One movable thing in the chat grid: a lone card, a whole deck, or a card
// of an expanded (fanned-out) thread.
interface ChatUnit {
  memberIds: string[];
  // The node whose stored position defines the unit's position.
  anchorId: string;
  width: number;
  height: number;
}

const GRID_GAP = 48;

// Lays chat cards/decks out in a grid of `columns` columns, oldest first,
// starting from the current top-left-most unit. Returns position updates
// (stored positions) for every node that has to move; decks move as a whole.
export function arrangeChatsInGrid(
  nodes: CanvasNode[],
  displayedNodes: CanvasNode[],
  decks: Deck[],
  columns: number,
): Map<string, Point> {
  const deckByMemberId = new Map(decks.flatMap((deck) => deck.memberIds.map((id) => [id, deck])));
  const displayedById = new Map(displayedNodes.map((node) => [node.id, node]));
  const units: ChatUnit[] = [];
  const seenDecks = new Set<Deck>();
  for (const node of nodes) {
    if (node.type !== "conversation") continue;
    const deck = deckByMemberId.get(node.id);
    if (deck) {
      if (seenDecks.has(deck)) continue;
      seenDecks.add(deck);
      const box = getNodeBox(displayedById.get(deck.topId)!);
      units.push({ memberIds: deck.memberIds, anchorId: deck.rootId, width: box.width, height: box.height });
    } else {
      const box = getNodeBox(displayedById.get(node.id) ?? node);
      units.push({ memberIds: [node.id], anchorId: node.id, width: box.width, height: box.height });
    }
  }
  const updates = new Map<string, Point>();
  if (units.length === 0) return updates;

  const positionById = new Map(nodes.map((node) => [node.id, node.position]));
  const origin = units.reduce(
    (topLeft, unit) => {
      const position = positionById.get(unit.anchorId)!;
      return { x: Math.min(topLeft.x, position.x), y: Math.min(topLeft.y, position.y) };
    },
    { x: Infinity, y: Infinity },
  );
  const cellWidth = Math.max(...units.map((unit) => unit.width)) + GRID_GAP;

  let rowTop = origin.y;
  for (let rowStart = 0; rowStart < units.length; rowStart += columns) {
    const row = units.slice(rowStart, rowStart + columns);
    row.forEach((unit, columnIndex) => {
      const target = { x: origin.x + columnIndex * cellWidth, y: rowTop };
      const current = positionById.get(unit.anchorId)!;
      const deltaX = target.x - current.x;
      const deltaY = target.y - current.y;
      if (deltaX === 0 && deltaY === 0) return;
      for (const memberId of unit.memberIds) {
        const memberPosition = positionById.get(memberId)!;
        updates.set(memberId, { x: memberPosition.x + deltaX, y: memberPosition.y + deltaY });
      }
    });
    rowTop += Math.max(...row.map((unit) => unit.height)) + GRID_GAP;
  }
  return updates;
}
