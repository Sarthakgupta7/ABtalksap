import "server-only";
import { PipelineStage, type JobApplicationStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { notifyCandidateApplicationStatus } from "@/features/recruiter-notifications/notify-recruiter";
import {
  getPipelineItemCandidateId,
  type PipelineWorkspace,
} from "@/repositories/talent-pipeline";

/**
 * Pipeline → application write-back (the reverse of T-247).
 *
 * T-247 puts an applicant on the recruiter's board at SOURCED. Until now a
 * stage move never flowed back, so the candidate's JobApplication stayed
 * APPLIED forever and they were never told anything. When the recruiter
 * moves a card, every application that candidate has on THIS recruiter's
 * jobs is moved to the matching status and the candidate is notified
 * (in-app + email).
 *
 * Scout-sourced candidates who never applied have no JobApplication for
 * this recruiter, so they are untouched — nothing tells a candidate "a
 * recruiter shortlisted you" unless they applied.
 *
 * Fire-and-forget: the recruiter's stage move already succeeded, so every
 * failure is a warn log and a silent return. Never throws.
 */

/** Stage → candidate-facing status. null = the stage does not change the application. */
export function applicationStatusForStage(
  stage: PipelineStage,
): Exclude<JobApplicationStatus, "APPLIED"> | null {
  switch (stage) {
    case PipelineStage.SHORTLISTED:
    case PipelineStage.CONTACTED:
    case PipelineStage.SCREENING:
    case PipelineStage.INTERVIEWING:
      return "REVIEWING";
    case PipelineStage.OFFER:
    case PipelineStage.HIRED:
      return "ACCEPTED";
    case PipelineStage.REJECTED:
      return "REJECTED";
    // SOURCED is where applicants start; WITHDRAWN is the candidate's own
    // exit, not a recruiter decision to announce.
    default:
      return null;
  }
}

export async function syncApplicationsForStageChange(input: {
  workspace: PipelineWorkspace;
  itemId: string;
  stage: PipelineStage;
}): Promise<void> {
  const target = applicationStatusForStage(input.stage);
  if (!target) return;

  try {
    // Through the T-240 repository (the only module allowed to read
    // TalentListItem); same ownership scope as moveStage.
    const candidateUserId = await getPipelineItemCandidateId(
      input.workspace,
      input.itemId,
    );
    if (!candidateUserId) return;

    const applications = await prisma.jobApplication.findMany({
      where: {
        userId: candidateUserId,
        job: { recruiterId: input.workspace.userId },
        status: { not: target },
      },
      select: {
        id: true,
        status: true,
        job: { select: { title: true, company: true } },
      },
    });

    for (const app of applications) {
      // Conditional on the status we read, so two quick moves cannot both
      // claim the same transition and send two emails.
      const updated = await prisma.jobApplication.updateMany({
        where: { id: app.id, status: app.status },
        data: { status: target },
      });
      if (updated.count === 0) continue;

      await notifyCandidateApplicationStatus({
        candidateUserId,
        applicationId: app.id,
        status: target,
        jobTitle: app.job.title,
        company: app.job.company,
      });
    }
  } catch (err) {
    logger.warn("pipeline-convergence.status_sync_failed", {
      itemId: input.itemId,
      stage: input.stage,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
