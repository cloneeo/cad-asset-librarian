export interface CADAsset {
  id: number;
  name: string;
  description: string;
  fileLink: string;
  phash: string;
  category: string;
  svgPath: string; // Used to dynamically render the drawing blueprint of the assets on the UI canvas
}

export interface Category {
  id: number;
  name: string;
  color: string; // Tailwind colors like 'sky', 'emerald', 'amber', 'purple'
}

export interface MatchResult {
  asset: CADAsset;
  distance: number;
  similarity: number;
}

export interface CustomCommand {
  id: string;
  name: string;
  command: string;
  description: string;
  enabled: boolean;
}

export type ActiveTab =
  | 'dashboard'
  | 'vault'
  | 'planning'
  | 'site'
  | 'compliance'
  | 'materials'
  | 'plots'
  | 'automation'
  | 'render'
  | 'reports'
  | 'settings'
  // Legacy workspace ids are kept so older saved workspace JSON files still restore safely.
  | 'floorplan'
  | 'lab'
  | 'studio';

export interface ExternalDWGProvider {
  name: string;
  url: string;
  description: string;
  searchUrl: (query: string) => string;
  isPopular?: boolean;
}
