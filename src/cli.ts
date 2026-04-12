export type RunMode = "smoke" | "full";

export interface CliOptions {
  projectName: string;
  baseUrl: string;
  sshHost: string;
  sshUser: string;
  sshProjectPath: string;
  authUser?: string;
  authPassword?: string;
  mode: RunMode;
}
