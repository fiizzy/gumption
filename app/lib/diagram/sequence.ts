import type { Point } from "../../types";
import type { Box } from "../geometry";

// Layout for a sequence diagram: participants across the top with a
// lifeline dropping from each, one message per row in the order given,
// every message a horizontal arrow between two lifelines (or a small hook
// back to the same one), and fragments (loop, alt, opt) as boxes around a
// run of messages.

export interface SequenceParticipantInput {
  id: string;
  width: number;
  height: number;
}

export interface SequenceMessageInput {
  id: string;
  from: string;
  to: string;
}

export interface SequenceFragmentInput {
  id: string;
  messageIds: string[];
}

export interface SequenceLayoutInput {
  contentOrigin: Point;
  participants: SequenceParticipantInput[];
  messages: SequenceMessageInput[];
  fragments: SequenceFragmentInput[];
}

export interface SequenceLifeline {
  participantId: string;
  top: Point;
  bottom: Point;
}

export interface SequenceLayoutResult {
  participantBoxes: Map<string, Box>;
  lifelines: SequenceLifeline[];
  messagePaths: Map<string, Point[]>;
  // Fragment boxes, outermost first.
  fragmentBoxes: { id: string; box: Box }[];
  contentBounds: Box | null;
}

const PARTICIPANT_GAP = 90;
const FIRST_ROW_GAP = 48;
const ROW_PITCH = 52;
const SELF_MESSAGE_WIDTH = 44;
const SELF_MESSAGE_DROP = 26;
const LIFELINE_TAIL = 36;
const FRAGMENT_HEADER = 30;
const FRAGMENT_SIDE_PADDING = 56;
const FRAGMENT_TOP_PADDING = 22;
const FRAGMENT_BOTTOM_PADDING = 18;
// Clear space after a fragment closes, before the next row (or fragment).
const FRAGMENT_MARGIN = 24;
const FRAGMENT_NESTING_INSET = 14;

export function layoutSequence(input: SequenceLayoutInput): SequenceLayoutResult {
  const participantBoxes = new Map<string, Box>();
  const lifelineX = new Map<string, number>();
  const columnWidth = Math.max(0, ...input.participants.map((participant) => participant.width));
  const headerHeight = Math.max(0, ...input.participants.map((participant) => participant.height));
  input.participants.forEach((participant, index) => {
    const x = input.contentOrigin.x + index * (columnWidth + PARTICIPANT_GAP) + (columnWidth - participant.width) / 2;
    const y = input.contentOrigin.y + (headerHeight - participant.height) / 2;
    participantBoxes.set(participant.id, { x, y, width: participant.width, height: participant.height });
    lifelineX.set(participant.id, x + participant.width / 2);
  });

  const messages = input.messages.filter((message) => lifelineX.has(message.from) && lifelineX.has(message.to));
  const fragments = input.fragments
    .map((fragment) => ({ id: fragment.id, messageIds: fragment.messageIds.filter((id) => messages.some((message) => message.id === id)) }))
    .filter((fragment) => fragment.messageIds.length > 0);
  const firstMessageOf = (fragment: { messageIds: string[] }) => Math.min(...fragment.messageIds.map((id) => messages.findIndex((message) => message.id === id)));
  const lastMessageOf = (fragment: { messageIds: string[] }) => Math.max(...fragment.messageIds.map((id) => messages.findIndex((message) => message.id === id)));

  // ── Rows: a fragment opening before a message pushes it down a header ─
  const rowY = new Map<string, number>();
  let cursor = input.contentOrigin.y + headerHeight + FIRST_ROW_GAP;
  messages.forEach((message, index) => {
    const opening = fragments.filter((fragment) => firstMessageOf(fragment) === index).length;
    cursor += opening * FRAGMENT_HEADER;
    rowY.set(message.id, cursor);
    const closing = fragments.filter((fragment) => lastMessageOf(fragment) === index).length;
    cursor += ROW_PITCH + (message.from === message.to ? SELF_MESSAGE_DROP : 0) + closing * FRAGMENT_MARGIN;
  });
  const lastRowBottom = cursor;

  const messagePaths = new Map<string, Point[]>();
  for (const message of messages) {
    const y = rowY.get(message.id)!;
    const fromX = lifelineX.get(message.from)!;
    const toX = lifelineX.get(message.to)!;
    if (message.from === message.to) {
      messagePaths.set(message.id, [
        { x: fromX, y },
        { x: fromX + SELF_MESSAGE_WIDTH, y },
        { x: fromX + SELF_MESSAGE_WIDTH, y: y + SELF_MESSAGE_DROP },
        { x: fromX, y: y + SELF_MESSAGE_DROP },
      ]);
    } else {
      messagePaths.set(message.id, [
        { x: fromX, y },
        { x: toX, y },
      ]);
    }
  }

  // ── Fragments: around their messages' rows and lifelines; the wider
  // span is drawn outside the narrower ──────────────────────────
  const spans = fragments.map((fragment) => {
    const involved = fragment.messageIds.flatMap((id) => {
      const message = messages.find((candidate) => candidate.id === id)!;
      return [lifelineX.get(message.from)!, lifelineX.get(message.to)!, ...(message.from === message.to ? [lifelineX.get(message.from)! + SELF_MESSAGE_WIDTH] : [])];
    });
    const first = messages[firstMessageOf(fragment)];
    const last = messages[lastMessageOf(fragment)];
    const top = rowY.get(first.id)! - FRAGMENT_TOP_PADDING - FRAGMENT_HEADER;
    const bottom = rowY.get(last.id)! + (last.from === last.to ? SELF_MESSAGE_DROP : 0) + FRAGMENT_BOTTOM_PADDING;
    return { id: fragment.id, left: Math.min(...involved) - FRAGMENT_SIDE_PADDING, right: Math.max(...involved) + FRAGMENT_SIDE_PADDING, top, bottom, firstIndex: firstMessageOf(fragment), lastIndex: lastMessageOf(fragment) };
  });
  const nestingOf = (span: (typeof spans)[number]) => spans.filter((other) => other !== span && other.firstIndex <= span.firstIndex && other.lastIndex >= span.lastIndex && (other.lastIndex - other.firstIndex > span.lastIndex - span.firstIndex || spans.indexOf(other) < spans.indexOf(span))).length;
  const fragmentBoxes = spans
    .map((span) => ({ span, nesting: nestingOf(span) }))
    .sort((first, second) => first.nesting - second.nesting)
    .map(({ span, nesting }) => {
      const inset = nesting * FRAGMENT_NESTING_INSET;
      return { id: span.id, box: { x: span.left + inset, y: span.top + inset, width: span.right - span.left - inset * 2, height: span.bottom - span.top - inset } };
    });

  const lifelineBottom = lastRowBottom + LIFELINE_TAIL;
  const lifelines = input.participants
    .filter((participant) => lifelineX.has(participant.id))
    .map((participant) => {
      const box = participantBoxes.get(participant.id)!;
      const x = lifelineX.get(participant.id)!;
      return { participantId: participant.id, top: { x, y: box.y + box.height }, bottom: { x, y: lifelineBottom } };
    });

  const boxes = [...participantBoxes.values(), ...fragmentBoxes.map((fragment) => fragment.box)];
  let contentBounds = boxes.reduce<Box | null>((bounds, box) => (bounds ? unite(bounds, box) : { ...box }), null);
  if (contentBounds && lifelines.length > 0) contentBounds = unite(contentBounds, { x: contentBounds.x, y: contentBounds.y, width: contentBounds.width, height: lifelineBottom - contentBounds.y });
  return { participantBoxes, lifelines, messagePaths, fragmentBoxes, contentBounds };
}

function unite(first: Box, second: Box): Box {
  const x = Math.min(first.x, second.x);
  const y = Math.min(first.y, second.y);
  return { x, y, width: Math.max(first.x + first.width, second.x + second.width) - x, height: Math.max(first.y + first.height, second.y + second.height) - y };
}
