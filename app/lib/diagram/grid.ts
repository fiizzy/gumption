import type { Point } from "../../types";
import type { Box } from "../geometry";

// Layout for a board of cards: named columns, optional named rows, and the
// cards stacked inside each cell in the order given. Kanban boards,
// journey maps, comparison tables, 2x2 matrices and affinity groups are
// all this with different names on the edges.

export interface GridCardInput {
  id: string;
  columnIndex: number;
  rowIndex: number;
  height: number;
}

export interface GridLayoutInput {
  contentOrigin: Point;
  columnCount: number;
  rowCount: number;
  hasColumnHeaders: boolean;
  hasRowHeaders: boolean;
  cardWidth: number;
  cards: GridCardInput[];
}

export interface GridLayoutResult {
  cardBoxes: Map<string, Box>;
  columnHeaderBoxes: Box[];
  rowHeaderBoxes: Box[];
  cellBoxes: Box[][];
  // The rules between columns and between rows.
  separators: Point[][];
  contentBounds: Box | null;
}

const CELL_PADDING = 14;
const CARD_GAP = 10;
const MIN_CELL_HEIGHT = 96;
const COLUMN_HEADER_HEIGHT = 40;
const ROW_HEADER_WIDTH = 128;

export function layoutGrid(input: GridLayoutInput): GridLayoutResult {
  const columnWidth = input.cardWidth + CELL_PADDING * 2;
  const rowCount = Math.max(1, input.rowCount);
  const gridLeft = input.contentOrigin.x + (input.hasRowHeaders ? ROW_HEADER_WIDTH : 0);
  const gridTop = input.contentOrigin.y + (input.hasColumnHeaders ? COLUMN_HEADER_HEIGHT : 0);
  const stackHeight = (cards: GridCardInput[]) => cards.reduce((total, card) => total + card.height, 0) + Math.max(0, CARD_GAP * (cards.length - 1));
  const cardsIn = (column: number, row: number) => input.cards.filter((card) => card.columnIndex === column && card.rowIndex === row);

  const rowHeights = Array.from({ length: rowCount }, (_, row) =>
    Math.max(MIN_CELL_HEIGHT, ...Array.from({ length: input.columnCount }, (_, column) => stackHeight(cardsIn(column, row)) + CELL_PADDING * 2)),
  );
  const rowTops: number[] = [];
  let cursor = gridTop;
  rowHeights.forEach((height) => {
    rowTops.push(cursor);
    cursor += height;
  });
  const gridBottom = cursor;
  const gridRight = gridLeft + columnWidth * input.columnCount;

  const cardBoxes = new Map<string, Box>();
  const cellBoxes: Box[][] = [];
  for (let row = 0; row < rowCount; row += 1) {
    cellBoxes.push([]);
    for (let column = 0; column < input.columnCount; column += 1) {
      const cell = { x: gridLeft + column * columnWidth, y: rowTops[row], width: columnWidth, height: rowHeights[row] };
      cellBoxes[row].push(cell);
      let top = cell.y + CELL_PADDING;
      for (const card of cardsIn(column, row)) {
        cardBoxes.set(card.id, { x: cell.x + CELL_PADDING, y: top, width: input.cardWidth, height: card.height });
        top += card.height + CARD_GAP;
      }
    }
  }

  const columnHeaderBoxes = input.hasColumnHeaders
    ? Array.from({ length: input.columnCount }, (_, column) => ({ x: gridLeft + column * columnWidth, y: input.contentOrigin.y, width: columnWidth, height: COLUMN_HEADER_HEIGHT }))
    : [];
  const rowHeaderBoxes = input.hasRowHeaders ? rowTops.map((top, row) => ({ x: input.contentOrigin.x, y: top, width: ROW_HEADER_WIDTH, height: rowHeights[row] })) : [];

  const separators: Point[][] = [];
  for (let column = 1; column < input.columnCount; column += 1) {
    const x = gridLeft + column * columnWidth;
    separators.push([
      { x, y: input.contentOrigin.y },
      { x, y: gridBottom },
    ]);
  }
  for (let row = 1; row < rowCount; row += 1) {
    separators.push([
      { x: input.contentOrigin.x, y: rowTops[row] },
      { x: gridRight, y: rowTops[row] },
    ]);
  }
  if (input.hasColumnHeaders) {
    separators.push([
      { x: input.contentOrigin.x, y: gridTop },
      { x: gridRight, y: gridTop },
    ]);
  }
  if (input.hasRowHeaders) {
    separators.push([
      { x: gridLeft, y: input.contentOrigin.y },
      { x: gridLeft, y: gridBottom },
    ]);
  }

  const contentBounds = input.columnCount === 0 ? null : { x: input.contentOrigin.x, y: input.contentOrigin.y, width: gridRight - input.contentOrigin.x, height: gridBottom - input.contentOrigin.y };
  return { cardBoxes, columnHeaderBoxes, rowHeaderBoxes, cellBoxes, separators, contentBounds };
}
