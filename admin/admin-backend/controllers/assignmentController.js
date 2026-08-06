// controllers/assignmentController.js
//
// Task & Assignment Center — who is responsible for an application.
//
// Reuses the existing staff directory (models/Admin.js) rather than creating a
// parallel user or task record: an assignment is a reference from an
// Application to an Admin that already exists.
//
// ASSIGNMENT NEVER TOUCHES `workflowStage`. Ownership and pipeline position are
// independent concerns; nothing in this file writes a stage.
//
// History is not stored on the application — ApplicationHistory is already the
// audit trail and is what the Timeline renders. This module writes there and
// reads it back, so there is one store and no duplication.
//
import mongoose from "mongoose";
import Admin from "../models/Admin.js";
import Application from "../models/Application.js";
import ApprovedApplication from "../models/ApprovedApplication.js";
import ApplicationHistory from "../models/ApplicationHistory.js";
import ActivityLog from "../models/ActivityLog.js";
import {
  PRIORITIES,
  TASK_STATUS,
  TASK_STATUSES,
  CLOSED_STATUSES,
} from "../models/assignmentSchemas.js";
import { createHistoryEntry } from "./formTrackingController.js";
import { logEvent } from "../utils/log.js";

const isSuperAdmin = (admin) => admin?.role === "superadmin" || admin?.role === "sadmin";

/** Start of today, for "due today" / "completed today" comparisons. */
const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
const endOfToday = () => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
};

/** Locate the application in whichever collection currently holds it. */
async function findApplication(applicationId) {
  let Model = Application;
  let app = await Application.findById(applicationId).lean();
  if (!app) {
    app = await ApprovedApplication.findById(applicationId).lean();
    Model = ApprovedApplication;
  }
  return { app, Model };
}

/* ───────────────────── GET /api/assignments/staff ───────────────────────── */

/**
 * Assignable staff.
 *
 * The full staff directory lives behind `/api/superadmin/admins`
 * (requireSuperAdmin), but a regular Admin is allowed to assign — so this
 * returns the minimum a picker needs: id, name, role, for ACTIVE admins only.
 * No email, no password hash, no workflow configuration.
 */
export const listAssignableStaff = async (req, res) => {
  try {
    const staff = await Admin.find({ isActive: { $ne: false } })
      .select("_id name role")
      .sort({ name: 1 })
      .lean();

    return res.json({
      staff: staff.map((s) => ({
        _id: String(s._id),
        name: s.name || "",
        role: s.role || "admin",
      })),
    });
  } catch (err) {
    console.error("listAssignableStaff error:", err);
    return res.status(500).json({ message: "Failed to load staff." });
  }
};

/* ────────────── GET /api/assignments/:applicationId ─────────────────────── */

/** Current assignment plus its history, read back from the audit trail. */
export const getAssignment = async (req, res) => {
  try {
    const { applicationId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(applicationId)) {
      return res.status(400).json({ message: "Invalid application id." });
    }

    const { app } = await findApplication(applicationId);
    if (!app) return res.status(404).json({ message: "Application not found." });

    const history = await ApplicationHistory.find({
      applicationId,
      actionType: {
        $in: ["APPLICATION_ASSIGNED", "ASSIGNMENT_UPDATED", "ASSIGNMENT_CLOSED"],
      },
    })
      .sort({ updatedAt: -1 })
      .lean();

    return res.json({
      applicationId: String(app._id),
      assignment: app.assignment || null,
      history: history.map((h) => ({
        actionType: h.actionType,
        remarks: h.remarks || "",
        from: h.oldValue ?? null,
        to: h.newValue ?? null,
        performedBy: h.updatedBy || "",
        at: h.updatedAt,
      })),
    });
  } catch (err) {
    console.error("getAssignment error:", err);
    return res.status(500).json({ message: "Failed to load assignment." });
  }
};

/* ────────────── POST /api/assignments/:applicationId ────────────────────── */

/**
 * Assign or reassign an application to a member of staff.
 *
 * Permission: any admin may assign. Reassigning work that belongs to SOMEONE
 * ELSE is a supervisor action — a regular admin may only reassign a task that
 * is unassigned or already theirs.
 */
export const assignApplication = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { assignedTo, priority, dueDate, remarks } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(applicationId)) {
      return res.status(400).json({ message: "Invalid application id." });
    }
    if (!assignedTo || !mongoose.Types.ObjectId.isValid(String(assignedTo))) {
      return res.status(400).json({ message: "A staff member must be selected." });
    }
    if (priority !== undefined && !PRIORITIES.includes(priority)) {
      return res.status(400).json({ message: `Invalid priority. Expected one of: ${PRIORITIES.join(", ")}.` });
    }

    let due = null;
    if (dueDate) {
      due = new Date(dueDate);
      if (Number.isNaN(due.getTime())) {
        return res.status(400).json({ message: "Invalid due date." });
      }
    }

    const staff = await Admin.findById(assignedTo).select("_id name role isActive").lean();
    if (!staff) return res.status(404).json({ message: "Selected staff member not found." });
    if (staff.isActive === false) {
      return res.status(400).json({ message: "Cannot assign to a deactivated staff member." });
    }

    const { app, Model } = await findApplication(applicationId);
    if (!app) return res.status(404).json({ message: "Application not found." });

    const current = app.assignment || null;
    const currentOwner = current?.assignedTo ? String(current.assignedTo) : null;
    const actingId = String(req.admin?._id || req.admin?.id || "");

    // Reassigning another person's task is a supervisor action.
    if (currentOwner && currentOwner !== actingId && !isSuperAdmin(req.admin)) {
      return res.status(403).json({
        message: `This task is assigned to ${current.assignedToName || "another user"}. Only a Super Admin can reassign it.`,
      });
    }

    const actorName = req.admin?.name || req.admin?.email || "admin";
    const now = new Date();
    const isReassign = Boolean(currentOwner);

    const next = {
      assignedTo: staff._id,
      assignedToName: staff.name || "",
      assignedToRole: staff.role || "admin",
      assignedBy: req.admin?._id || req.admin?.id || null,
      assignedByName: actorName,
      assignedAt: now,
      priority: priority || current?.priority || "Medium",
      dueDate: due !== null ? due : current?.dueDate ?? null,
      // A reassignment restarts the task; it is not the previous owner's progress.
      taskStatus: TASK_STATUS.PENDING,
      completedAt: null,
      remarks: String(remarks ?? "").trim(),
    };

    // timestamps:false — on approved records `updatedAt` is the approval-time
    // proxy the Processing Days export falls back to.
    await Model.updateOne({ _id: applicationId }, { $set: { assignment: next } }, { timestamps: false });

    await createHistoryEntry({
      applicationId,
      formId: app.formId,
      actionType: "APPLICATION_ASSIGNED",
      oldValue: current
        ? { assignedTo: current.assignedToName, priority: current.priority, taskStatus: current.taskStatus }
        : null,
      newValue: { assignedTo: next.assignedToName, priority: next.priority, taskStatus: next.taskStatus },
      remarks: isReassign
        ? `Reassigned from ${current.assignedToName || "—"} to ${next.assignedToName}${next.remarks ? ` — ${next.remarks}` : ""}`
        : `Assigned to ${next.assignedToName}${next.remarks ? ` — ${next.remarks}` : ""}`,
      updatedBy: actorName,
      updatedByEmail: req.admin?.email || "",
      updatedByRole: req.admin?.role || "admin",
      updatedByAdminId: req.admin?._id || req.admin?.id || null,
    });

    try {
      await ActivityLog.create({
        adminId: req.admin?._id || req.admin?.id,
        applicationId,
        action: isReassign ? "APPLICATION_REASSIGNED" : "APPLICATION_ASSIGNED",
        notes: `${isReassign ? "Reassigned" : "Assigned"} to ${next.assignedToName}`,
        meta: {
          from: current?.assignedToName || null,
          to: next.assignedToName,
          priority: next.priority,
          dueDate: next.dueDate,
        },
        at: now,
      });
    } catch (logErr) {
      console.error("Failed to log assignment:", logErr);
    }

    logEvent("application_assigned", {
      applicationId: String(applicationId),
      formId: app.formId,
      to: next.assignedToName,
      reassigned: isReassign,
      adminId: actingId || null,
      at: now.toISOString(),
    });

    return res.json({
      success: true,
      message: isReassign ? "Application reassigned." : "Application assigned.",
      assignment: next,
    });
  } catch (err) {
    console.error("assignApplication error:", err);
    return res.status(500).json({ message: "Failed to assign application." });
  }
};

/* ────────────── PATCH /api/assignments/:applicationId ───────────────────── */

/**
 * Update priority, due date or task status on an existing assignment.
 * Same ownership rule as reassignment: someone else's task is supervisor-only.
 */
export const updateAssignment = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { priority, dueDate, taskStatus, remarks } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(applicationId)) {
      return res.status(400).json({ message: "Invalid application id." });
    }
    if (priority === undefined && dueDate === undefined && taskStatus === undefined) {
      return res.status(400).json({
        message: "Nothing to update. Provide at least one of: priority, dueDate, taskStatus.",
      });
    }
    if (priority !== undefined && !PRIORITIES.includes(priority)) {
      return res.status(400).json({ message: `Invalid priority. Expected one of: ${PRIORITIES.join(", ")}.` });
    }
    if (taskStatus !== undefined && !TASK_STATUSES.includes(taskStatus)) {
      return res.status(400).json({ message: `Invalid task status. Expected one of: ${TASK_STATUSES.join(", ")}.` });
    }

    let due;
    if (dueDate !== undefined) {
      if (dueDate === null || dueDate === "") due = null;
      else {
        due = new Date(dueDate);
        if (Number.isNaN(due.getTime())) return res.status(400).json({ message: "Invalid due date." });
      }
    }

    const { app, Model } = await findApplication(applicationId);
    if (!app) return res.status(404).json({ message: "Application not found." });

    const current = app.assignment;
    if (!current || !current.assignedTo) {
      return res.status(409).json({ message: "This application is not assigned yet." });
    }

    const actingId = String(req.admin?._id || req.admin?.id || "");
    if (String(current.assignedTo) !== actingId && !isSuperAdmin(req.admin)) {
      return res.status(403).json({
        message: `This task is assigned to ${current.assignedToName || "another user"}. Only a Super Admin can change it.`,
      });
    }

    const actorName = req.admin?.name || req.admin?.email || "admin";
    const now = new Date();
    const $set = {};
    const changed = [];

    if (priority !== undefined && priority !== current.priority) {
      $set["assignment.priority"] = priority;
      changed.push(`priority ${current.priority} → ${priority}`);
    }
    if (due !== undefined) {
      $set["assignment.dueDate"] = due;
      changed.push(`due date → ${due ? due.toISOString().slice(0, 10) : "cleared"}`);
    }
    if (taskStatus !== undefined && taskStatus !== current.taskStatus) {
      $set["assignment.taskStatus"] = taskStatus;
      $set["assignment.completedAt"] = taskStatus === TASK_STATUS.COMPLETED ? now : null;
      changed.push(`status ${current.taskStatus} → ${taskStatus}`);
    }
    if (remarks !== undefined) $set["assignment.remarks"] = String(remarks).trim();

    if (!changed.length && remarks === undefined) {
      return res.json({ success: true, message: "No changes.", assignment: current });
    }

    await Model.updateOne({ _id: applicationId }, { $set }, { timestamps: false });

    const closing = taskStatus !== undefined && CLOSED_STATUSES.includes(taskStatus);
    await createHistoryEntry({
      applicationId,
      formId: app.formId,
      actionType: closing ? "ASSIGNMENT_CLOSED" : "ASSIGNMENT_UPDATED",
      oldValue: { priority: current.priority, dueDate: current.dueDate, taskStatus: current.taskStatus },
      newValue: {
        priority: $set["assignment.priority"] ?? current.priority,
        dueDate: due !== undefined ? due : current.dueDate,
        taskStatus: $set["assignment.taskStatus"] ?? current.taskStatus,
      },
      remarks: changed.join(", ") || "Assignment remarks updated",
      updatedBy: actorName,
      updatedByEmail: req.admin?.email || "",
      updatedByRole: req.admin?.role || "admin",
      updatedByAdminId: req.admin?._id || req.admin?.id || null,
    });

    try {
      await ActivityLog.create({
        adminId: req.admin?._id || req.admin?.id,
        applicationId,
        action: "ASSIGNMENT_UPDATED",
        notes: changed.join(", "),
        meta: { changed },
        at: now,
      });
    } catch (logErr) {
      console.error("Failed to log assignment update:", logErr);
    }

    logEvent("assignment_updated", {
      applicationId: String(applicationId),
      formId: app.formId,
      changed,
      adminId: actingId || null,
      at: now.toISOString(),
    });

    const { app: refreshed } = await findApplication(applicationId);
    return res.json({ success: true, message: "Assignment updated.", assignment: refreshed?.assignment || null });
  } catch (err) {
    console.error("updateAssignment error:", err);
    return res.status(500).json({ message: "Failed to update assignment." });
  }
};

/* ────────────── GET /api/assignments/my-tasks ───────────────────────────── */

/**
 * The caller's work queue plus their counters.
 *
 * A Super Admin may inspect another queue with ?staffId=… (Phase 9: "View All
 * Queues"); a regular admin always sees their own.
 */
export const myTasks = async (req, res) => {
  try {
    const actingId = String(req.admin?._id || req.admin?.id || "");
    const requested = String(req.query.staffId || "").trim();

    let ownerId = actingId;
    if (requested && requested !== actingId) {
      if (!isSuperAdmin(req.admin)) {
        return res.status(403).json({ message: "Only a Super Admin can view another queue." });
      }
      if (!mongoose.Types.ObjectId.isValid(requested)) {
        return res.status(400).json({ message: "Invalid staff id." });
      }
      ownerId = requested;
    }
    if (!mongoose.Types.ObjectId.isValid(ownerId)) {
      return res.status(400).json({ message: "Invalid staff id." });
    }

    const filter = { "assignment.assignedTo": new mongoose.Types.ObjectId(ownerId) };
    const SELECT = "formId applicant dealerDetails status workflowStage assignment";

    const [pending, approved] = await Promise.all([
      Application.find(filter).select(SELECT).lean(),
      ApprovedApplication.find(filter).select(SELECT).lean(),
    ]);

    const today0 = startOfToday();
    const today1 = endOfToday();
    // `source` tells the caller which detail route the record lives behind —
    // approved applications have been moved to their own collection and page.
    const rows = [
      ...pending.map((a) => ({ ...a, source: "pending" })),
      ...approved.map((a) => ({ ...a, source: "approved" })),
    ];

    const counters = {
      applicationsAssigned: rows.length,
      pending: 0,
      inProgress: 0,
      completedToday: 0,
      overdue: 0,
      dueToday: 0,
      highPriority: 0,
    };

    const items = rows.map((app) => {
      const a = app.assignment || {};
      const status = a.taskStatus || TASK_STATUS.PENDING;
      const due = a.dueDate ? new Date(a.dueDate) : null;
      const open = !CLOSED_STATUSES.includes(status);

      if (status === TASK_STATUS.PENDING) counters.pending += 1;
      if (status === TASK_STATUS.IN_PROGRESS) counters.inProgress += 1;
      if (status === TASK_STATUS.COMPLETED && a.completedAt && new Date(a.completedAt) >= today0) {
        counters.completedToday += 1;
      }
      const overdue = Boolean(open && due && due < today0);
      const dueToday = Boolean(open && due && due >= today0 && due <= today1);
      if (overdue) counters.overdue += 1;
      if (dueToday) counters.dueToday += 1;
      if (open && ["High", "Critical"].includes(a.priority)) counters.highPriority += 1;

      return {
        applicationId: String(app._id),
        source: app.source,
        loanNumber: app.formId || "",
        customerName: app?.applicant?.name || app?.applicant?.applicant?.name || "",
        branch: app?.dealerDetails?.branch || "",
        workflowStage: app.workflowStage || "",
        priority: a.priority || "Medium",
        taskStatus: status,
        dueDate: a.dueDate || null,
        assignedToName: a.assignedToName || "",
        overdue,
        dueToday,
      };
    });

    // Most urgent first: overdue, then due today, then priority.
    const rank = { Critical: 0, High: 1, Medium: 2, Low: 3 };
    items.sort((x, y) =>
      (y.overdue - x.overdue) ||
      (y.dueToday - x.dueToday) ||
      ((rank[x.priority] ?? 9) - (rank[y.priority] ?? 9))
    );

    return res.json({ staffId: ownerId, counters, items });
  } catch (err) {
    console.error("myTasks error:", err);
    return res.status(500).json({ message: "Failed to load tasks." });
  }
};

export default {
  listAssignableStaff,
  getAssignment,
  assignApplication,
  updateAssignment,
  myTasks,
};
