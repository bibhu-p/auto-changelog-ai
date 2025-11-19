import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config();
// import dayjs from 'dayjs'; // optional, used only if you want nicer dates (not required)
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

/**
 * Create a Google Gen AI client.
 * Authentication options:
 *  - If you set GEMINI_API_KEY, we pass it to the SDK (API key auth).
 *  - Otherwise the SDK will use Application Default Credentials (ADC) if available.
 */
function makeClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    return new GoogleGenAI({ apiKey });
  } else {
    // let SDK use ADC (gcloud auth application-default login or service account in CI)
    return new GoogleGenAI({});
  }
}

const aiClient = makeClient();

/**
 * generateAIChangelog
 * @param {string} commitMessage
 * @param {string} diff
 * @returns {Promise<{title:string, description:string, explanation:string}>}
 */
export async function generateAIChangelog(commitMessage, diff) {
  if (!commitMessage) commitMessage = "";
  try {
    const prompt = buildPrompt(commitMessage, diff);

    // The JS SDK uses models.generateContent per docs.
    const response = await aiClient.models.generateContent({
      model: MODEL,
      contents: [
        {
          parts: [
            {
              text: prompt,
            },
          ],
        },
      ],
    });

    // The response object shape varies; docs show `response.text` convenience, but SDK returns structured info.
    // Try to read a common top-level text accessor; fallback to deeper extraction.
    let raw = "";
    if (typeof response?.text === "string") {
      raw = response.text;
    } else if (
      response?.candidates &&
      response.candidates[0]?.content?.parts?.[0]?.text
    ) {
      raw = response.candidates[0].content.parts[0].text;
    } else if (typeof response === "string") {
      raw = response;
    } else {
      // Try JSON stringify for debugging
      raw = JSON.stringify(response);
    }

    raw = String(raw).trim();

    // Extract JSON substring if model returned extra text around JSON
    const firstBrace = raw.indexOf("{");
    const lastBrace = raw.lastIndexOf("}");
    let jsonText = raw;
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonText = raw.slice(firstBrace, lastBrace + 1);
    }

    try {
      const parsed = JSON.parse(jsonText);
      const title = String(parsed.title || "").trim();
      const description = String(parsed.description || "").trim();
      const explanation = String(parsed.explanation || "").trim();

      return {
        title: title || fallbackTitle(commitMessage),
        description: description || fallbackDescription(commitMessage),
        explanation: explanation || fallbackExplanation(commitMessage, diff),
      };
    } catch (parseErr) {
      console.warn(
        "Warning: Gemini output not valid JSON — using fallback. Raw output:\n",
        raw
      );
      return {
        title: fallbackTitle(commitMessage),
        description: fallbackDescription(commitMessage),
        explanation: fallbackExplanation(commitMessage, diff),
      };
    }
  } catch (err) {
    console.error("Gemini call failed:", err?.message ?? err);
    return {
      title: fallbackTitle(commitMessage),
      description: fallbackDescription(commitMessage),
      explanation: fallbackExplanation(commitMessage, diff),
    };
  }
}

function buildPrompt(commitMessage, diff) {
  // Keep a clear deterministic prompt asking for JSON only
  return [
    "You are an automatic changelog generator for software commits.",
    "Inputs:",
    `- Commit message:\n${commitMessage}`,
    `- Diff:\n${diff || "<EMPTY_DIFF>"}`,
    "",
    "Task:",
    "Return EXACTLY a single JSON object and nothing else with the keys: title, description, explanation.",
    "- title: short (<=80 chars).",
    "- description: one paragraph summary (<=200 chars).",
    "- explanation: a technical explanation (<=600 chars).",
    "",
    "If the diff is '<EMPTY_DIFF>' produce a summary that explains there were no code changes (docs/metadata-only).",
    "Output must be valid JSON only. No markdown, no commentary, no surrounding text.",
    "",
  ].join("\n");
}

function fallbackTitle(commitMessage) {
  const firstLine = (commitMessage || "").split("\n")[0] || "Update";
  return firstLine.slice(0, 80);
}
function fallbackDescription(commitMessage) {
  const firstLine =
    (commitMessage || "").split("\n")[0] || "No description available.";
  return firstLine.slice(0, 200);
}
function fallbackExplanation(commitMessage, diff) {
  const d = diff ? `Diff included (trimmed).` : `No diff provided.`;
  return `Generated from commit message: "${
    (commitMessage || "").split("\n")[0]
  }". ${d}`.slice(0, 600);
}
