// Layering for a flowchart with no lanes. Each shape gets a rank: its
// longest path from a start, so every connection runs forward by at least
// one rank and the ranks become the lanes of the layered engine. Cycles
// are broken first; the edges that close them are the loops a flowchart
// draws back and around. The spine is the main path, start to finish, that
// the layout keeps straight.

export interface RankingConnector {
  id: string;
  from: string;
  to: string;
  label: string | null;
}

export interface RankingInput {
  // In arrival order: ties break toward what the agent said first.
  shapeIds: string[];
  connectors: RankingConnector[];
  // Shapes that read as a start (terminators), tried first as the spine's origin.
  startCandidateIds?: string[];
}

export interface Ranking {
  rankOf: Map<string, number>;
  rankCount: number;
  spine: Set<string>;
  backEdgeIds: Set<string>;
}

// A decision's exit that carries on along the main path.
const AFFIRMATIVE_LABEL_PATTERN = /^(yes|y|true|ok|okay|success|succeeds|succeeded|valid|approved|accepted|pass|passes|passed|continue|next|done|happy path)\b/i;

export function rankByLongestPath({ shapeIds, connectors, startCandidateIds = [] }: RankingInput): Ranking {
  const ids = new Set(shapeIds);
  const edges = connectors.filter((connector) => ids.has(connector.from) && ids.has(connector.to) && connector.from !== connector.to);
  const outgoing = new Map<string, RankingConnector[]>(shapeIds.map((id) => [id, []]));
  for (const edge of edges) outgoing.get(edge.from)!.push(edge);

  const backEdgeIds = findBackEdges(shapeIds, outgoing, startCandidateIds);
  const forward = edges.filter((edge) => !backEdgeIds.has(edge.id));

  const incomingCount = new Map<string, number>(shapeIds.map((id) => [id, 0]));
  for (const edge of forward) incomingCount.set(edge.to, incomingCount.get(edge.to)! + 1);
  const rankOf = new Map<string, number>(shapeIds.map((id) => [id, 0]));
  const ready = shapeIds.filter((id) => incomingCount.get(id) === 0);
  const remaining = new Map(incomingCount);
  while (ready.length > 0) {
    const id = ready.shift()!;
    for (const edge of outgoing.get(id)!) {
      if (backEdgeIds.has(edge.id)) continue;
      rankOf.set(edge.to, Math.max(rankOf.get(edge.to)!, rankOf.get(id)! + 1));
      remaining.set(edge.to, remaining.get(edge.to)! - 1);
      if (remaining.get(edge.to) === 0) ready.push(edge.to);
    }
  }
  const rankCount = shapeIds.length === 0 ? 0 : Math.max(...rankOf.values()) + 1;

  const sources = shapeIds.filter((id) => incomingCount.get(id) === 0);
  const start = startCandidateIds.find((id) => sources.includes(id)) ?? sources[0] ?? shapeIds[0];
  const spine = new Set<string>();
  let current: string | undefined = start;
  while (current && !spine.has(current)) {
    spine.add(current);
    const exits: RankingConnector[] = outgoing.get(current)!.filter((edge: RankingConnector) => !backEdgeIds.has(edge.id) && !spine.has(edge.to));
    const preferred: RankingConnector | undefined = exits.find((edge: RankingConnector) => edge.label !== null && AFFIRMATIVE_LABEL_PATTERN.test(edge.label)) ?? exits[0];
    current = preferred?.to;
  }

  return { rankOf, rankCount, spine, backEdgeIds };
}

// Depth-first from the starts, in arrival order: an edge back into the
// path being walked closes a cycle.
function findBackEdges(shapeIds: string[], outgoing: Map<string, RankingConnector[]>, startCandidateIds: string[]): Set<string> {
  const backEdgeIds = new Set<string>();
  const visited = new Set<string>();
  const onPath = new Set<string>();
  const visit = (id: string) => {
    visited.add(id);
    onPath.add(id);
    for (const edge of outgoing.get(id)!) {
      if (onPath.has(edge.to)) backEdgeIds.add(edge.id);
      else if (!visited.has(edge.to)) visit(edge.to);
    }
    onPath.delete(id);
  };
  const incoming = new Set(shapeIds.flatMap((id) => outgoing.get(id)!.map((edge) => edge.to)));
  const order = [
    ...startCandidateIds.filter((id) => outgoing.has(id)),
    ...shapeIds.filter((id) => !incoming.has(id)),
    ...shapeIds,
  ];
  for (const id of order) if (!visited.has(id)) visit(id);
  return backEdgeIds;
}
