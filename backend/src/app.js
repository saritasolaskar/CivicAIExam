
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import path from "node:path";

import geographyRoutes from "./routes/geography.routes.js";
import healthRoutes from "./routes/health.routes.js";
import authRoutes from "./routes/auth.routes.js";
import complaintRoutes from "./routes/complaint.routes.js";
import officerRoutes from "./routes/officer.routes.js";
import officerComplaintRoutes from "./routes/officerComplaint.routes.js";
import adminComplaintRoutes from "./routes/adminComplaint.routes.js";
import adminDashboardRoutes from "./routes/adminDashboard.routes.js";
import errorHandler from "./middleware/errorHandler.js";

const app = express();

const uploadsDirectory = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../uploads"
);

app.use(helmet());

app.use(
  "/uploads",
  helmet.crossOriginResourcePolicy({ policy: "cross-origin" }),
  express.static(uploadsDirectory)
);

app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:5173"
}));

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

app.get("/", (req, res) => {
  res.json({
    message: "Welcome to CivicAI API"
  });
});

// API routes
app.use("/api/v1/health", healthRoutes);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/complaints", complaintRoutes);
app.use("/api/v1/geography", geographyRoutes);

app.use("/api/v1/admin/officers", officerRoutes);
app.use("/api/v1/admin/complaints", adminComplaintRoutes);

app.use("/api/v1/officer", officerComplaintRoutes);
app.use("/api/v1/admin/dashboard", adminDashboardRoutes);
// Error handling MUST come after all routes
app.use(errorHandler);

// 404 handler MUST be last
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API endpoint not found"
  });
});

export default app;
