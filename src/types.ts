export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type RunMode = "smoke" | "full";
export type ToolName =
  | "playwright"
  | "lighthouse"
  | "crawlee"
  | "axe-core"
  | "sitespeed.io"
  | "selenium"
  | "puppeteer";

export interface TargetConfig {
  projectName: string;
  baseUrl: string;
  ssh: {
    host: string;
    user: string;
    projectPath: string;
  };
  auth?: {
    username?: string;
    password?: string;
  };
  mode: RunMode;
}

export interface TargetProfile {
  targetKind: "website" | "web-app" | "hybrid";
  likelyFrameworks: string[];
  likelyCms: string[];
  renderingMode: "spa" | "ssr" | "static" | "mixed";
  requiresAuth: boolean;
  needsDeepCrawl: boolean;
  needsCompatibilityFallback: boolean;
  signals: string[];
}

export interface ToolDefinition {
  name: ToolName;
  role: string;
  selected: boolean;
  reason: string;
}

export interface ExecutionPlan {
  mode: RunMode;
  profileSummary: string;
  selectedTools: ToolDefinition[];
  processSteps: string[];
}

export interface Finding {
  severity: Severity;
  area: string;
  title: string;
  details: string;
  route?: string;
}

export interface RunSummary {
  projectName: string;
  baseUrl: string;
  mode: RunMode;
  startedAt: string;
  completedAt: string;
  sshTarget: string;
  authSummary: string;
  targetProfile: TargetProfile;
  executionPlan: ExecutionPlan;
  findings: Finding[];
  skipped: string[];
}
