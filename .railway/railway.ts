import { defineRailway, github, postgres, project, service } from "railway/iac";

// This repository manages only its own resources in the environment.
// See https://docs.railway.com/infrastructure-as-code#multi-repo-projects
export const partial = "nicotrackings";

export default defineRailway(() => {
  const database = postgres("Postgres");

  const nicotrackings = service("nicotrackings", {
    source: github("nicotordev/nicotrackings", { branch: "main", checkSuites: false }),
    build: { buildEnvironment: "V3", builder: "RAILPACK" },
    start: "bun run start",
    replicas: { "us-west2": 1 },
  });

  return project("nicotrackings", {
    resources: [database, nicotrackings],
  });
});
