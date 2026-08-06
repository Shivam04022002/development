// models/assignmentSchemas.js
//
// Task ownership for an application.
//
// An assignment is a REFERENCE to an existing Admin (the staff directory) — no
// parallel user or task record is created. It is stored on the Application
// itself, the same way documentVerification and the vehicle-document blocks
// are, so there is no new collection.
//
// Assignment history is NOT stored here: ApplicationHistory is already the
// audit trail, already indexed by applicationId and already rendered by the
// Timeline. This block holds current state only; the history is read back from
// there. One store, two views.
//
// Assignment is deliberately independent of `workflowStage` — it records who is
// responsible, never where the application sits in the pipeline.
//
import mongoose from "mongoose";

export const PRIORITIES = ["Low", "Medium", "High", "Critical"];

export const TASK_STATUS = {
  PENDING: "Pending",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  ON_HOLD: "On Hold",
  CANCELLED: "Cancelled",
};

export const TASK_STATUSES = Object.values(TASK_STATUS);

/** Statuses that mean the task is finished and should leave a live queue. */
export const CLOSED_STATUSES = [TASK_STATUS.COMPLETED, TASK_STATUS.CANCELLED];

export const assignment = {
  type: new mongoose.Schema(
    {
      // Who owns it. `assignedToName` / `assignedToRole` are denormalised so
      // lists and queues render without joining Admin on every row.
      assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
      assignedToName: { type: String, default: "" },
      assignedToRole: { type: String, default: "" },

      assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
      assignedByName: { type: String, default: "" },
      assignedAt: { type: Date, default: null },

      priority: { type: String, enum: PRIORITIES, default: "Medium" },
      dueDate: { type: Date, default: null },

      taskStatus: { type: String, enum: TASK_STATUSES, default: TASK_STATUS.PENDING },
      completedAt: { type: Date, default: null },

      remarks: { type: String, default: "" },
    },
    { _id: false }
  ),
  default: undefined, // absent = unassigned; no migration needed
};

export default { assignment, PRIORITIES, TASK_STATUS, TASK_STATUSES, CLOSED_STATUSES };
