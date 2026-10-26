import envPaths from "env-paths";

export const { data: configDir, log: logDir } = envPaths("slave");
