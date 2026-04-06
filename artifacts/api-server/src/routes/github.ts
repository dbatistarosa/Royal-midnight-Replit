import { Router, type IRouter } from "express";
import { createRepo, listUserRepos, getAuthenticatedUser, pushFile, getFileSha } from "../lib/github";

const router: IRouter = Router();

router.get("/admin/github/user", async (_req, res): Promise<void> => {
  try {
    const user = await getAuthenticatedUser();
    res.json(user);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/admin/github/repos", async (_req, res): Promise<void> => {
  try {
    const repos = await listUserRepos();
    res.json(repos);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/admin/github/create-repo", async (req, res): Promise<void> => {
  const { name = "royal-midnight", description = "Royal Midnight — Luxury Black Car Service Platform", isPrivate = false } = req.body as {
    name?: string;
    description?: string;
    isPrivate?: boolean;
  };
  try {
    const user = await getAuthenticatedUser();
    const existing = await listUserRepos();
    const alreadyExists = existing.find(r => r.name === name);
    if (alreadyExists) {
      res.json({ created: false, repo: alreadyExists, message: "Repository already exists" });
      return;
    }
    const repo = await createRepo(name, description, isPrivate);

    const readmeContent = `# Royal Midnight

**Luxury Black Car Service — South Florida**

A comprehensive platform for FLL, MIA, and PBI airport transfers and luxury ground transportation.

## Features
- Real-time quoting with Google Maps integration
- Stripe payment processing
- Passenger, Driver, and Admin portals
- Live fleet dispatch

## Tech Stack
- React + Vite + TanStack Query
- Express 5 + PostgreSQL + Drizzle ORM
- Stripe Payments
- Google Maps Places API

## Test Credentials
- Passenger: alex@example.com / password123
- Admin: admin@royalmidnight.com / admin2024!

Built with Royal Midnight Platform.
`;
    const sha = await getFileSha(user.login, repo.name, "README.md");
    await pushFile(user.login, repo.name, "README.md", readmeContent, "docs: Add Royal Midnight README", sha);

    res.json({ created: true, repo, message: `Repository created at ${repo.htmlUrl}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
