/**
 * Server Actions for the Admin page (`/admin` and its sub-routes).
 *
 * Thin wrappers around lib/admin/delete.ts's actual delete/integrity
 * logic — locally-declared async functions rather than bare re-exports,
 * per this project's established "use server" rule (a bare
 * `export { x } from "..."` trips Next's "Only async functions are
 * allowed to be exported in a 'use server' file" at dev/build time; see
 * app/review/actions.ts for the exact precedent this follows).
 */
"use server";

import { deleteLlmCall, deletePost, deleteCandidate, deleteRun } from "../../lib/admin/delete";
import type { DeleteResult } from "../../lib/admin/delete";

export async function deleteRunAction(id: number): Promise<DeleteResult> {
  return deleteRun(id);
}

export async function deleteCandidateAction(id: number): Promise<DeleteResult> {
  return deleteCandidate(id);
}

export async function deletePostAction(id: number): Promise<DeleteResult> {
  return deletePost(id);
}

export async function deleteLlmCallAction(id: number): Promise<DeleteResult> {
  return deleteLlmCall(id);
}
