import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const dockerfile = readFileSync(
  resolve(__dirname, "../../Dockerfile"),
  "utf-8"
);

const dockerCompose = readFileSync(
  resolve(__dirname, "../../../docker-compose.yml"),
  "utf-8"
);

describe("Dockerfile hardening (SEC-INFRA-01)", () => {
  it("contains a USER directive with a non-root user", () => {
    const userLine = dockerfile
      .split("\n")
      .find((l) => l.trim().startsWith("USER "));
    expect(userLine).toBeDefined();
    expect(userLine).not.toMatch(/USER\s+root/);
  });

  it("USER directive specifies the node user", () => {
    const userLine = dockerfile
      .split("\n")
      .find((l) => l.trim().startsWith("USER "));
    expect(userLine).toBeDefined();
    expect(userLine).toMatch(/USER\s+node/);
  });

  it("chowns /app/data and /app/uploads to the runtime user before USER directive", () => {
    const lines = dockerfile.split("\n");
    const chownIndex = lines.findIndex(
      (l) => l.includes("chown") && l.includes("node") && l.includes("/app/data")
    );
    const userIndex = lines.findIndex((l) => l.trim().startsWith("USER "));
    expect(chownIndex).toBeGreaterThan(-1);
    expect(userIndex).toBeGreaterThan(-1);
    expect(chownIndex).toBeLessThan(userIndex);
  });

  it("creates /home/node directory for npm cache", () => {
    expect(dockerfile).toMatch(/mkdir.*\/home\/node/);
  });

  it("does not run application code as root", () => {
    const lines = dockerfile.split("\n");
    const userIndex = lines.findIndex((l) => l.trim().startsWith("USER "));
    // CMD/ENTRYPOINT should be after USER directive
    const cmdIndex = lines.findIndex(
      (l) => l.trim().startsWith("CMD ") || l.trim().startsWith("ENTRYPOINT ")
    );
    expect(userIndex).toBeGreaterThan(-1);
    expect(cmdIndex).toBeGreaterThan(-1);
    expect(userIndex).toBeLessThan(cmdIndex);
  });
});

describe("docker-compose.yml hardening (SEC-INFRA-02)", () => {
  it("api service has read_only: true", () => {
    // Parse the api service section
    expect(dockerCompose).toMatch(/read_only:\s*true/);
  });

  it("api service has tmpfs mounts for /tmp", () => {
    expect(dockerCompose).toMatch(/tmpfs:/);
    expect(dockerCompose).toMatch(/\/tmp/);
  });
});
