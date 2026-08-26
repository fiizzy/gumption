export interface NodeData {
  id: string;
  parentId: string | null;
  linkedFromId: string | null; // auto-link to previous node (visual only, no branch context)
  prompt: string;
  response: string;
  x: number;
  y: number;
  color: string;
  minimized: boolean;
  loading: boolean;
}

export interface NodeDims {
  w: number;
  h: number;
}

export type ShapeKind = 'square' | 'circle';

export interface CanvasElementData {
  id: string;
  type: 'text' | 'shape';
  shapeKind?: ShapeKind; // only set when type === 'shape'
  x: number;
  y: number;
  text: string; // text-tool content; unused for shapes
  color: string;
}
