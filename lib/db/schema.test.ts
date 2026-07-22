import { describe, it, expect } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { pipelineRunsTable, candidatesTable, postsTable, llmCallsTable, sourcesTable } from "./schema";

describe("pipelineRunsTable", () => {
  it("has the expected columns", () => {
    const columns = Object.keys(getTableColumns(pipelineRunsTable));
    expect(columns).toEqual(
      expect.arrayContaining(["id", "startedAt", "finishedAt", "status", "abortReason", "errorMessage", "type"])
    );
  });
});

describe("candidatesTable", () => {
  it("has the expected columns", () => {
    const columns = Object.keys(getTableColumns(candidatesTable));
    expect(columns).toEqual(
      expect.arrayContaining(["id", "runId", "url", "sourceRecap", "sourceId", "chosen", "createdAt"])
    );
  });
});

describe("sourcesTable", () => {
  it("has the expected columns", () => {
    const columns = Object.keys(getTableColumns(sourcesTable));
    expect(columns).toEqual(expect.arrayContaining(["id", "name"]));
  });
});

describe("postsTable", () => {
  it("has the expected columns", () => {
    const columns = Object.keys(getTableColumns(postsTable));
    expect(columns).toEqual(
      expect.arrayContaining([
        "id",
        "candidateId",
        "runId",
        "url",
        "title",
        "originalText",
        "editedText",
        "imagePrompt",
        "discarded",
        "posted",
        "postedAt",
        "pending",
      ])
    );
  });
});

describe("llmCallsTable", () => {
  it("has the expected columns", () => {
    const columns = Object.keys(getTableColumns(llmCallsTable));
    expect(columns).toEqual(
      expect.arrayContaining([
        "id",
        "timestamp",
        "runId",
        "provider",
        "model",
        "inputTokens",
        "outputTokens",
        "estimatedCost",
      ])
    );
  });
});
