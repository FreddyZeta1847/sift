export const SIFT_USER_AGENT = "sift/0.1 (+https://github.com/sift-project/sift)";

export function delayBetweenFetches(): Promise<void> {
  const ms = 500 + Math.random() * 500;
  return new Promise((resolve) => setTimeout(resolve, ms));
}
