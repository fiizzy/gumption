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
