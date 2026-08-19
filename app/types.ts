export interface NodeData {
  id: string;
  parentId: string | null;
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
