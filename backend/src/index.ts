import express from "express";
import cors from "cors";
import { PrismaClient } from "@prisma/client";
import authRoutes from "./routes/auth.js";
import dealRoutes from "./routes/deals.js";
import appointmentRoutes from "./routes/appointments.js";
import costRoutes from "./routes/costs.js";
import invoiceRoutes from "./routes/invoices.js";
import metricRoutes from "./routes/metrics.js";
import kpiRoutes from "./routes/kpi.js";
import syncRoutes from "./routes/sync.js";
import integrationRoutes from "./routes/integrations.js";
import solvariRoutes from "./routes/solvari.js";
import aiRoutes from "./routes/ai.js";
import reportRoutes from "./routes/report.js";
import { startScheduler } from "./jobs/scheduler.js";

export const prisma = new PrismaClient();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:5173", credentials: true }));
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/deals", dealRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/costs", costRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/metrics", metricRoutes);
app.use("/api/kpi", kpiRoutes);
app.use("/api/sync", syncRoutes);
app.use("/api/integrations", integrationRoutes);
app.use("/api/solvari", solvariRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/report", reportRoutes);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startScheduler();
});
