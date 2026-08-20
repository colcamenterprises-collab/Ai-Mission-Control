export type CompletionDecision = "VERIFIED_COMPLETE" | "REWORK_REQUIRED";

export type CompletionRoute = {
  status: "running" | "review" | "done";
  timelineEvent: "REWORK REQUIRED" | "OWNER REVIEW REQUIRED" | "ORCHESTRATOR VERIFIED COMPLETE";
};

/**
 * Deterministic routing after a separate orchestrator evidence review.
 * Pre-execution approval is deliberately absent: the execution policy engine
 * remains the only component allowed to create policy approval requests.
 */
export function routeVerifiedCompletion(input: {
  decision: CompletionDecision;
  ownerReviewRequired: boolean;
  escalatedOwnerReview: boolean;
  reviewReason?: string | null;
}): CompletionRoute {
  if (input.decision === "REWORK_REQUIRED") {
    return { status: "running", timelineEvent: "REWORK REQUIRED" };
  }
  if (input.ownerReviewRequired || input.escalatedOwnerReview) {
    if (!input.reviewReason?.trim()) {
      throw new Error("A factual owner-review reason is required");
    }
    return { status: "review", timelineEvent: "OWNER REVIEW REQUIRED" };
  }
  return { status: "done", timelineEvent: "ORCHESTRATOR VERIFIED COMPLETE" };
}
