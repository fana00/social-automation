import { qualityCheck } from "@/lib/openrouter";
import { appendQCTrial, updateGenerationLog } from "@/lib/sheets";
import { notifyQCFailed } from "@/lib/discord";

const MAX_RETRIES = 4;

interface QCInput {
  genId: string;
  imageUrl: string;
  persona: string;
  currentAttempt: number;
  expandedPrompt: string;
}

interface QCOutput {
  passed: boolean;
  approvedImageUrl: string;
  totalAttempts: number;
  issues: string;
  needsRetry: boolean;
  adjustedPrompt: string;
}

export async function runQualityChecker(input: QCInput): Promise<QCOutput> {
  const { pass, issues } = await qualityCheck(input.imageUrl);

  // Log this trial
  await appendQCTrial({
    genId: input.genId,
    attemptNumber: input.currentAttempt,
    timestamp: new Date().toISOString(),
    imageUrl: input.imageUrl,
    qcResult: pass ? "pass" : "fail",
    issuesFound: issues,
    adjustedPrompt: "",
  });

  if (pass) {
    await updateGenerationLog(input.genId, {
      qcStatus: "passed",
      qcAttempts: input.currentAttempt,
    });

    return {
      passed: true,
      approvedImageUrl: input.imageUrl,
      totalAttempts: input.currentAttempt,
      issues: "",
      needsRetry: false,
      adjustedPrompt: "",
    };
  }

  // Failed - check if we can retry
  const canRetry = input.currentAttempt <= MAX_RETRIES;

  if (canRetry) {
    // Create adjusted prompt that addresses the issues
    const adjustedPrompt = `${input.expandedPrompt}\n\nIMPORTANT: Avoid these issues from previous generation: ${issues}. Ensure correct anatomy, proper number of fingers (5 per hand), natural proportions, and no artifacts.`;

    await notifyQCFailed(
      input.persona,
      input.imageUrl,
      issues,
      input.currentAttempt
    );

    await updateGenerationLog(input.genId, {
      qcStatus: "failed-retry",
      qcAttempts: input.currentAttempt,
    });

    return {
      passed: false,
      approvedImageUrl: "",
      totalAttempts: input.currentAttempt,
      issues,
      needsRetry: true,
      adjustedPrompt,
    };
  }

  // Max retries exhausted - flag for manual review
  await updateGenerationLog(input.genId, {
    qcStatus: "failed-flagged",
    qcAttempts: input.currentAttempt,
  });

  await notifyQCFailed(
    input.persona,
    input.imageUrl,
    `MAX RETRIES REACHED. Issues: ${issues}`,
    input.currentAttempt
  );

  return {
    passed: false,
    approvedImageUrl: input.imageUrl, // Return best attempt anyway
    totalAttempts: input.currentAttempt,
    issues,
    needsRetry: false,
    adjustedPrompt: "",
  };
}
