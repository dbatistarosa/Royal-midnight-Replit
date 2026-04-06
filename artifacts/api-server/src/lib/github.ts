import { ReplitConnectors } from "@replit/connectors-sdk";

const connectors = new ReplitConnectors();

export interface RepoInfo {
  name: string;
  fullName: string;
  htmlUrl: string;
  private: boolean;
  description: string;
}

export async function getAuthenticatedUser(): Promise<{ login: string; name: string }> {
  const response = await connectors.proxy("github", "/user", { method: "GET" });
  return response.json() as Promise<{ login: string; name: string }>;
}

export async function listUserRepos(): Promise<RepoInfo[]> {
  const response = await connectors.proxy("github", "/user/repos?per_page=100&sort=updated", { method: "GET" });
  const repos = await response.json() as any[];
  return repos.map(r => ({
    name: r.name,
    fullName: r.full_name,
    htmlUrl: r.html_url,
    private: r.private,
    description: r.description || "",
  }));
}

export async function createRepo(name: string, description: string, isPrivate: boolean): Promise<RepoInfo> {
  const response = await connectors.proxy("github", "/user/repos", {
    method: "POST",
    body: JSON.stringify({ name, description, private: isPrivate, auto_init: true }),
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    const err = await response.json() as any;
    throw new Error(err.message || "Failed to create repository");
  }
  const repo = await response.json() as any;
  return {
    name: repo.name,
    fullName: repo.full_name,
    htmlUrl: repo.html_url,
    private: repo.private,
    description: repo.description || "",
  };
}

export async function pushFile(
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  sha?: string
): Promise<void> {
  const body: any = {
    message,
    content: Buffer.from(content).toString("base64"),
  };
  if (sha) body.sha = sha;
  const response = await connectors.proxy("github", `/repos/${owner}/${repo}/contents/${path}`, {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    const err = await response.json() as any;
    throw new Error(err.message || `Failed to push ${path}`);
  }
}

export async function getFileSha(owner: string, repo: string, path: string): Promise<string | undefined> {
  const response = await connectors.proxy("github", `/repos/${owner}/${repo}/contents/${path}`, { method: "GET" });
  if (!response.ok) return undefined;
  const data = await response.json() as any;
  return data.sha;
}
