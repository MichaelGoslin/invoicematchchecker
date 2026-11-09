/**
 * Why Approve or Reject is off on a queue row. A disabled button with no
 * explanation looks broken, so every blocked state says what to do.
 */
import { isAgainstRecommendation } from "./overrideReasons";

type Action = "approve" | "reject";
type Recommendation = "approve" | "review" | "reject";

export const NEED_NAME = "Enter your name at the top of the queue first. It is saved with every decision.";

const SAID: Record<Recommendation, string> = {
  approve: "recommended approving this set",
  review: "said this set needs review",
  reject: "recommended rejecting this set",
};

/** The reason this action can't be used yet, or null when it can. The name is checked first. */
export function decisionBlockedReason(action: Action, recommendation: Recommendation, name: string, reason: string): string | null {
  if (!name.trim()) return NEED_NAME;
  if (isAgainstRecommendation(action, recommendation) && !reason.trim()) {
    return `The engine ${SAID[recommendation]}. To ${action} it anyway, choose a reason code or write a note.`;
  }
  return null;
}
