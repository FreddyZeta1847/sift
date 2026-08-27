/**
 * The one-line "here is what just happened" message that follows a save,
 * a delete or a probe — "Provider added.", "Save failed: timed out".
 *
 * WHY THIS EXISTS
 * Four files each carried their own copy of the same helper:
 *
 *   const statusTone = (m: string) =>
 *     /failed/i.test(m) ? "status-line status-line--danger" : "status-line";
 *
 * Four copies of one regex is four chances for them to drift, and the
 * regex itself is a guess: it infers failure from the wording of a message
 * the caller already knows the outcome of. So this component takes an
 * explicit `tone` where the caller knows it, and keeps the regex only as
 * the fallback for the many existing call sites that pass a bare string
 * assembled as `Save failed: ${error}`.
 *
 * Renders nothing for a null/empty message, so callers can hand it their
 * status state directly without guarding at every site.
 */

export type StatusTone = "neutral" | "success" | "danger";

/**
 * The historical heuristic: a message reading "... failed ..." is an
 * error. Kept for callers that build their message before they think
 * about its tone — prefer passing `tone` explicitly.
 */
export function inferTone(message: string): StatusTone {
  return /failed/i.test(message) ? "danger" : "neutral";
}

const TONE_CLASS: Record<StatusTone, string> = {
  neutral: "status-line",
  success: "status-line status-line--success",
  danger: "status-line status-line--danger",
};

interface StatusMessageProps {
  message: string | null | undefined;
  /** Omit to infer from the message text. */
  tone?: StatusTone;
  className?: string;
}

export function StatusMessage({ message, tone, className }: StatusMessageProps) {
  if (!message) return null;
  const resolved = tone ?? inferTone(message);
  return (
    // role="alert" is what makes a screen reader announce the result of an
    // action the user just took; it also drives the global fade-slide-in.
    <p role="alert" className={`${TONE_CLASS[resolved]}${className ? ` ${className}` : ""}`}>
      {message}
    </p>
  );
}
