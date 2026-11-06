import type { ThemeId } from '../../../app/theme';

/** One column of the layout. Stage numbers shown to the user are 1-based; `from` / `to` below are 0-based and inclusive. */
export interface Stage {
  name: string;
  /** Short sub-steps listed under the stage name. */
  subs?: string[];
  note?: string;
}

/** A band over several stages (for example "Plan", "Make", "Run"). */
export interface Phase {
  label: string;
  from: number;
  to: number;
}

/** A practice: one swimlane row whose card spans the stages it applies to. */
export interface Lane {
  title: string;
  /** Lanes with the same group sit under one group heading. */
  group?: string;
  from: number;
  to: number;
  items: string[];
  /** SOP numbers (names come from LayoutSpec.sops). */
  sops?: number[];
  note?: string;
}

/** A dashed arc under the stages: a feedback loop between two stages. */
export interface Loop {
  from: number;
  to: number;
  label: string;
}

/** A named path shown as a row of steps, for example an escalation path. */
export interface Chain {
  label: string;
  steps: string[];
}

/** One industry's complete Practice Layout. Different categories have different stages, practices, groupings and paths. */
export interface LayoutSpec {
  name: string;
  tagline: string;
  phases: Phase[];
  stages: Stage[];
  loops?: Loop[];
  lanes: Lane[];
  chains?: Chain[];
  sops: Record<number, string>;
}

export interface Category {
  id: string;
  label: string;
  /** Colour theme applied when the tab is clicked. */
  theme: ThemeId;
  /** null = the original hand-drawn Calybrate diagram (lifecycle.html). */
  layout: LayoutSpec | null;
}
