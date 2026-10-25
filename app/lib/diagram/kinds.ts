// The kinds of diagram the whiteboard can draw. The agent names one in its
// plan line (or the person pins one in the composer); each kind belongs to
// a layout family, which is the engine that places its shapes.
//
//   layered   ranks or lanes along one axis, orthogonal routing (placement.ts)
//   tree      a hierarchy with bus connectors (tree.ts)
//   radial    a hierarchy spread both ways from a centre, curved links (radial.ts)
//   sequence  lifelines with messages in time order (sequence.ts)
//   grid      labelled columns and rows holding cards (grid.ts)
//   screens   device frames with stacked UI primitives (screens.ts)

export type LayoutFamily = "layered" | "tree" | "radial" | "sequence" | "grid" | "screens";

export interface DiagramKindDefinition {
  id: DiagramKind;
  family: LayoutFamily;
  // Shown in the composer's picker, with a few words under it.
  label: string;
  pickerHint: string;
  // One line for the agent: when this kind is the right answer.
  whenToUse: string;
  defaultDirection: "down" | "right";
}

export const DIAGRAM_KIND_IDS = ["flow", "swimlane", "layers", "sequence", "sitemap", "tree", "mindmap", "grid", "mockup", "screens"] as const;
export type DiagramKind = (typeof DIAGRAM_KIND_IDS)[number];

export const DIAGRAM_KINDS: readonly DiagramKindDefinition[] = [
  {
    id: "flow",
    family: "layered",
    label: "Flowchart",
    pickerHint: "Steps, decisions, loops",
    whenToUse: "a process, algorithm or decision flow with a start and an end; no lanes. Also state machines.",
    defaultDirection: "down",
  },
  {
    id: "swimlane",
    family: "layered",
    label: "Swimlane",
    pickerHint: "Steps by who does them",
    whenToUse: "a flow where who does each step matters: lanes for teams, systems or roles.",
    defaultDirection: "right",
  },
  {
    id: "layers",
    family: "layered",
    label: "Layers",
    pickerHint: "Architecture tiers",
    whenToUse: "architecture and system structure: layers or tiers (client, API, services, data) with the parts in each.",
    defaultDirection: "down",
  },
  {
    id: "sequence",
    family: "sequence",
    label: "Sequence",
    pickerHint: "Messages over time",
    whenToUse: "the exact order of calls and replies between a few participants over time: request handling, protocols, handshakes.",
    defaultDirection: "down",
  },
  {
    id: "sitemap",
    family: "tree",
    label: "Site map",
    pickerHint: "Pages and how they nest",
    whenToUse: "the pages or screens of a site or app and how they nest; navigation structure.",
    defaultDirection: "down",
  },
  {
    id: "tree",
    family: "tree",
    label: "Tree",
    pickerHint: "Org chart, taxonomy",
    whenToUse: "any other hierarchy: org chart, taxonomy, decision tree, folder structure, breakdown of a topic.",
    defaultDirection: "down",
  },
  {
    id: "mindmap",
    family: "radial",
    label: "Mind map",
    pickerHint: "Ideas around a topic",
    whenToUse: "ideas, themes and brainstorming around one central topic; loose thinking rather than a strict hierarchy.",
    defaultDirection: "right",
  },
  {
    id: "grid",
    family: "grid",
    label: "Grid",
    pickerHint: "Kanban, journey map, 2x2",
    whenToUse: "cards in labelled columns (and optionally rows): kanban boards, journey maps, comparison tables, 2x2 matrices, affinity groups.",
    defaultDirection: "right",
  },
  {
    id: "mockup",
    family: "screens",
    label: "Mockup",
    pickerHint: "Wireframe of a screen",
    whenToUse: "what a screen or page looks like: a wireframe of one or a few screens built from UI pieces.",
    defaultDirection: "right",
  },
  {
    id: "screens",
    family: "screens",
    label: "Screen flow",
    pickerHint: "Screens joined by actions",
    whenToUse: "how a person moves between screens: several wireframes with arrows labelled by the action.",
    defaultDirection: "right",
  },
];

const KIND_BY_ID = new Map(DIAGRAM_KINDS.map((definition) => [definition.id, definition]));

export function getDiagramKind(id: DiagramKind): DiagramKindDefinition {
  return KIND_BY_ID.get(id)!;
}

export function familyOf(id: DiagramKind): LayoutFamily {
  return getDiagramKind(id).family;
}
