export const subsidyStages = ["DRAFT", "DOCUMENTS_PENDING", "READY_FOR_SUBMISSION", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED"] as const;
export const initialSubsidyStage = "DRAFT";

const transitions: Record<string, string[]> = {
  DRAFT: ["DOCUMENTS_PENDING"],
  DOCUMENTS_PENDING: ["READY_FOR_SUBMISSION"],
  READY_FOR_SUBMISSION: ["DOCUMENTS_PENDING", "SUBMITTED"],
  SUBMITTED: ["UNDER_REVIEW"],
  UNDER_REVIEW: ["APPROVED", "REJECTED"],
  APPROVED: [],
  REJECTED: ["DOCUMENTS_PENDING"],
};

export const subsidyStageStatus = (stage: string): "PENDING" | "SUBMITTED" | "APPROVED" | "REJECTED" =>
  stage === "APPROVED" ? "APPROVED" : stage === "REJECTED" ? "REJECTED" : ["SUBMITTED", "UNDER_REVIEW"].includes(stage) ? "SUBMITTED" : "PENDING";

export const subsidyTransitionError = (from: string, to: string) =>
  transitions[from]?.includes(to) ? null : `Cannot move subsidy application from ${from} to ${to}`;

export const missingSubsidyDocuments = (required: string[], received: string[]) =>
  required.filter((document) => !received.includes(document));
