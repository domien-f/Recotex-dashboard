import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../index.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";

const router = Router();

router.post("/login", async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: "Email and password required" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || "secret", {
    expiresIn: (process.env.JWT_EXPIRES_IN || "7d") as any,
  });

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await prisma.session.create({
    data: { userId: user.id, token, expiresAt },
  });

  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
});

router.post("/logout", authenticate, async (req: AuthRequest, res: Response) => {
  const token = req.headers.authorization?.slice(7);
  if (token) {
    await prisma.session.deleteMany({ where: { token } });
  }
  res.json({ message: "Logged out" });
});

router.get("/me", authenticate, async (req: AuthRequest, res: Response) => {
  res.json({ user: req.user });
});

// Admin: create user
router.post("/users", authenticate, requireRole("ADMIN"), async (req: AuthRequest, res: Response) => {
  const { email, password, name, role } = req.body;

  if (!email || !password || !name) {
    res.status(400).json({ error: "Email, password, and name required" });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: "Email already exists" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, passwordHash, name, role: role || "VIEWER" },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });

  res.status(201).json(user);
});

// Admin: list users
router.get("/users", authenticate, requireRole("ADMIN"), async (_req: AuthRequest, res: Response) => {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(users);
});

// Admin: update user role
router.patch("/users/:id", authenticate, requireRole("ADMIN"), async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { name, role } = req.body;

  const data: any = {};
  if (name) data.name = name;
  if (role) data.role = role;

  const user = await prisma.user.update({
    where: { id: id as string },
    data,
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });

  res.json(user);
});

// Admin: delete user
router.delete("/users/:id", authenticate, requireRole("ADMIN"), async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  // Prevent self-delete
  if (id === req.user!.id) {
    res.status(400).json({ error: "Je kunt je eigen account niet verwijderen" });
    return;
  }

  await prisma.session.deleteMany({ where: { userId: id as string } });
  await prisma.user.delete({ where: { id: id as string } });

  res.json({ message: "Gebruiker verwijderd" });
});

// Change own password
router.post("/change-password", authenticate, async (req: AuthRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "Huidig en nieuw wachtwoord vereist" });
    return;
  }

  if (newPassword.length < 6) {
    res.status(400).json({ error: "Nieuw wachtwoord moet minimaal 6 tekens zijn" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) {
    res.status(404).json({ error: "Gebruiker niet gevonden" });
    return;
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Huidig wachtwoord is onjuist" });
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: req.user!.id }, data: { passwordHash } });

  res.json({ message: "Wachtwoord gewijzigd" });
});

export default router;
