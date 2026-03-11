/**
 * Deadline Check Cron Job
 *
 * Runs periodically (e.g. daily) to check for projects with approaching deadlines
 * and sends notification emails to organization users.
 *
 * Checks at 3 thresholds: 7 days, 3 days, 1 day before deadline.
 */

import { db } from "../db";
import { projects, organizations } from "../db/schema";
import { and, gte, lte, isNotNull, eq } from "drizzle-orm";
import { notifyDeadlineApproaching } from "../services/email";

const THRESHOLDS_DAYS = [7, 3, 1];

export async function checkDeadlines() {
  const now = new Date();

  for (const daysLeft of THRESHOLDS_DAYS) {
    // Find projects whose deadline falls between now and now + daysLeft + 1 day
    // but only exactly at this threshold (to avoid duplicate notifications)
    const targetStart = new Date(now);
    targetStart.setDate(targetStart.getDate() + daysLeft);
    targetStart.setHours(0, 0, 0, 0);

    const targetEnd = new Date(targetStart);
    targetEnd.setDate(targetEnd.getDate() + 1);

    const upcomingProjects = await db
      .select({
        id: projects.id,
        name: projects.name,
        organizationId: projects.organizationId,
        deadline: projects.deadline,
      })
      .from(projects)
      .where(
        and(
          isNotNull(projects.deadline),
          gte(projects.deadline, targetStart),
          lte(projects.deadline, targetEnd),
          // Only notify for active projects
          eq(projects.status, "in_progress"),
        )
      );

    for (const project of upcomingProjects) {
      if (!project.deadline) continue;
      try {
        await notifyDeadlineApproaching({
          organizationId: project.organizationId,
          projectName: project.name,
          deadline: project.deadline.toLocaleDateString("ro-RO"),
          daysLeft,
        });
      } catch (err) {
        console.error(`Failed to send deadline notification for project ${project.id}:`, err);
      }
    }

    if (upcomingProjects.length > 0) {
      console.log(`[checkDeadlines] Found ${upcomingProjects.length} projects with deadline in ${daysLeft} day(s)`);
    }
  }
}
