/**
 * Tests for lib/translation/models.ts's fixed language -> HF repo id
 * mapping. Covers the 5-language contract itself plus the documented
 * en-pt caveat (see models.ts's header) so a future silent "fix" of the
 * placeholder id doesn't slip in without also updating
 * UNAVAILABLE_LANGUAGES and this test.
 */
import { describe, it, expect } from "vitest";
import { MODEL_BY_LANGUAGE, UNAVAILABLE_LANGUAGES, type Language } from "./models";

describe("MODEL_BY_LANGUAGE", () => {
  it("maps all 5 supported languages to a Xenova opus-mt-en-* repo id", () => {
    const languages: Language[] = ["es", "fr", "de", "it", "pt"];
    for (const language of languages) {
      expect(MODEL_BY_LANGUAGE[language]).toBe(`Xenova/opus-mt-en-${language}`);
    }
  });

  it("has the repo ids confirmed to exist on the HF Hub at implementation time (es/fr/de/it)", () => {
    expect(MODEL_BY_LANGUAGE.es).toBe("Xenova/opus-mt-en-es");
    expect(MODEL_BY_LANGUAGE.fr).toBe("Xenova/opus-mt-en-fr");
    expect(MODEL_BY_LANGUAGE.de).toBe("Xenova/opus-mt-en-de");
    expect(MODEL_BY_LANGUAGE.it).toBe("Xenova/opus-mt-en-it");
  });

  it("marks pt as unavailable — its repo id is a documented placeholder, not a working entry", () => {
    // Confirmed via the HF Hub API at implementation time: this repo
    // does not exist (same generic 401 the Hub returns for a
    // deliberately-nonexistent control id). See models.ts's header.
    expect(UNAVAILABLE_LANGUAGES.has("pt")).toBe(true);
    expect(UNAVAILABLE_LANGUAGES.has("es")).toBe(false);
    expect(UNAVAILABLE_LANGUAGES.has("fr")).toBe(false);
    expect(UNAVAILABLE_LANGUAGES.has("de")).toBe(false);
    expect(UNAVAILABLE_LANGUAGES.has("it")).toBe(false);
  });
});
