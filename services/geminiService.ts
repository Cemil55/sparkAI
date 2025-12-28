const SPARK_AI_ENDPOINT = process.env.EXPO_PUBLIC_SPARK_AI_ENDPOINT ?? "";

export interface FlowiseHistoryMessage {
  role: "apiMessage" | "userMessage";
  content: string;
}

if (!SPARK_AI_ENDPOINT) {
  console.warn("⚠️ Spark AI Endpoint nicht gesetzt. Bitte EXPO_PUBLIC_SPARK_AI_ENDPOINT konfigurieren.");
}

export const callSparkAI = async (
  ticketDescription: string,
  sessionId?: string,
  history?: FlowiseHistoryMessage[],
  signal?: AbortSignal
): Promise<string> => {
  if (!SPARK_AI_ENDPOINT) {
    throw new Error("Spark AI Endpoint fehlt. Bitte Environment Variable setzen.");
  }
  try {
    const normalizedQuestion = ticketDescription.trim();
    if (!normalizedQuestion) {
      throw new Error("Leere Frage kann nicht an Spark AI gesendet werden.");
    }

    const payload: Record<string, unknown> = {
      question: normalizedQuestion,
    };

    const trimmedSessionId = sessionId?.trim();
    if (trimmedSessionId) {
      payload.overrideConfig = {
        memory: {
          sessionId: trimmedSessionId,
        },
      };
    }

    if (history && history.length > 0) {
      payload.history = history.map((entry) => ({
        role: entry.role,
        content: entry.content,
      }));
    }

    const response = await fetch(SPARK_AI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      // pass through an optional AbortSignal so callers can cancel in-flight requests
      signal,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Spark AI API Error ${response.status}: ${errorBody}`);
    }

    const data = await response.json();

    const directCandidates = [
      data?.text,
      data?.answer,
      data?.response,
      data?.output,
      data?.message,
    ];

    const firstStringCandidate = directCandidates.find((candidate) => typeof candidate === "string" && candidate.trim().length > 0);
    if (typeof firstStringCandidate === "string") {
      return firstStringCandidate.trim();
    }

    const visited = new WeakSet<object>();
    const collectText = (node: unknown, depth = 0): string[] => {
      if (node === null || node === undefined) {
        return [];
      }
      if (typeof node === "string") {
        return node.trim().length > 0 ? [node.trim()] : [];
      }
      if (typeof node === "number" || typeof node === "boolean") {
        return [String(node)];
      }
      if (Array.isArray(node)) {
        if (depth > 5) {
          return [];
        }
        return node.flatMap((item) => collectText(item, depth + 1));
      }
      if (typeof node === "object") {
        if (visited.has(node as object) || depth > 5) {
          return [];
        }
        visited.add(node as object);
        const candidateKeys = [
          "text",
          "value",
          "answer",
          "output",
          "response",
          "message",
          "content",
          "generated_text",
          "generatedText",
          "data",
        ];

        const collected: string[] = [];
        candidateKeys.forEach((key) => {
          if (Object.prototype.hasOwnProperty.call(node, key)) {
            collected.push(...collectText((node as Record<string, unknown>)[key], depth + 1));
          }
        });

        if (collected.length === 0) {
          Object.values(node as Record<string, unknown>).forEach((value) => {
            collected.push(...collectText(value, depth + 1));
          });
        }

        return collected;
      }

      return [];
    };

    const extractedSegments = collectText(data);
    const uniqueSegments = Array.from(new Set(extractedSegments)).filter((segment) => segment.length > 0);

    if (uniqueSegments.length > 0) {
      return uniqueSegments.join("\n\n");
    }

    if (typeof data === "string" && data.trim().length > 0) {
      return data.trim();
    }

    try {
      return JSON.stringify(data, null, 2);
    } catch (jsonError) {
      console.warn("Spark AI Antwort konnte nicht interpretiert werden:", jsonError);
      return "Keine Antwort erhalten";
    }
  } catch (error) {
    console.error("Spark AI Space Error:", error);
    throw error instanceof Error ? error : new Error(String(error));
  }
};

/**
 * Call Google Gemini (Generative Language API) for a translation request.
 * Uses EXPO_PUBLIC_GEMINI_API_KEY from env. This is a lightweight wrapper
 * that sends the prompt and returns the top candidate's content string.
 * Model default: text-bison-001.
 */
export const callGeminiTranslate = async (
  text: string,
  opts?: { model?: string; apiKey?: string; signal?: AbortSignal }
): Promise<string> => {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? opts?.apiKey;
  if (!apiKey) {
    throw new Error("Gemini API key fehlt. Bitte EXPO_PUBLIC_GEMINI_API_KEY konfigurieren.");
  }

  const modelPath = (opts?.model || "models/text-bison-001").replace(/^models\//, "models/");
  const url = `https://generativelanguage.googleapis.com/v1beta2/${modelPath}:generateText?key=${apiKey}`;

  try {
    const payload = { prompt: { text } } as any;

    // Perform fetch with explicit network error handling so callers get clear diagnostics
    let response: Response | null = null;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: opts?.signal,
        body: JSON.stringify(payload),
      });
    } catch (fetchErr) {
      // A network-level fetch failure (DNS, TLS, CORS, offline, etc.)
      const fetchError = fetchErr?.message ?? String(fetchErr);
      const err = new Error(`Gemini fetch failed: ${fetchError}`);
      (err as any).endpoint = { url, model: modelPath, fetchError };
      console.error("Gemini fetch failed:", fetchErr);
      throw err;
    }

    if (!response.ok) {
      const body = await response.text();
      // collect endpoint metadata for better debugging
      const endpointInfo = { status: response.status, url, model: modelPath, body };
      // log the full endpoint response to console for debugging
      console.error("Gemini endpoint response:", endpointInfo);

      // Try a best-effort fallback if the REST endpoint reports NOT_FOUND.
      if (response.status === 404) {
        console.warn("Gemini REST 404 – attempting client SDK fallback (if installed)");

        // Try dynamic import of the official client and a newer model name commonly available
        try {
          // dynamic import so we only require this at runtime if available
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const genai = require("@google/generative-ai");

          // Try common client shapes (defensive): GoogleGenAI, GoogleGenerativeAI, GenerativeAI
          const ClientConstructor = genai?.GoogleGenAI || genai?.GoogleGenerativeAI || genai?.GenerativeAI || genai?.default;
          if (ClientConstructor) {
            const client = new ClientConstructor({});
            const altModel = (opts?.model && String(opts.model).replace(/^models\//, "")) || "gemini-3-pro-preview";
            console.warn(`Trying SDK model fallback: ${altModel}`);

            // attempt a couple of candidate call patterns based on typical SDK shapes
            if (typeof client?.models?.generateContent === "function") {
              const resp = await client.models.generateContent({ model: altModel, contents: text });
              // many SDKs return .text or .candidates
              if (resp?.text) return String(resp.text);
              if (resp?.candidates?.[0]?.content) return String(resp.candidates[0].content);
              if (Array.isArray(resp?.candidates) && resp.candidates[0]) return String(JSON.stringify(resp.candidates[0]));
            }

            if (typeof client?.generate === "function") {
              const resp = await client.generate({ model: altModel, prompt: text });
              if (resp?.outputText) return String(resp.outputText);
              if (resp?.candidates?.[0]?.content) return String(resp.candidates[0].content);
            }

            // If we reach here, the SDK was present but the call did not return a usable string
            const sdkErr = new Error("SDK present but could not extract text from response");
            // attach endpoint details
            (sdkErr as any).endpoint = endpointInfo;
            throw sdkErr;
          }
        } catch (sdkErr) {
          // fall through to the original helpful error below
          console.warn("SDK fallback failed:", sdkErr?.message ?? sdkErr);
        }

        const err404 = new Error(
          `Gemini API Error 404: Requested entity not found. This usually means the specified model (${modelPath}) is not available for this API key or the Generative Language API is not enabled for the project. Response body: ${body}.\nChecks: 1) Ensure EXPO_PUBLIC_GEMINI_API_KEY is correct and not restricted, 2) enable the Generative Language API for your Google Cloud project, 3) try a different model name via opts.model (e.g., 'gemini-3-pro-preview' or other "chat" models), or install the official SDK '@google/generative-ai' and try that as a fallback.`
        );
        (err404 as any).endpoint = endpointInfo;
        throw err404;
      }

      if (response.status === 403) {
        const err403 = new Error(
          `Gemini API Error 403: Access denied. Your API key may not have permission to call this model or the Generative Language API. Response body: ${body}. Check API key restrictions and IAM/API enablement.`
        );
        (err403 as any).endpoint = endpointInfo;
        throw err403;
      }

      const err = new Error(`Gemini API Error ${response.status}: ${body}`);
      (err as any).endpoint = endpointInfo;
      throw err;
    }

    const data = await response.json();

    // v1beta2 returns candidates array with content
    const candidate = data?.candidates?.[0]?.content;
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }

    // Fallback: try some other fields or return the stringified body
    if (typeof data === "string") return data;
    try {
      return JSON.stringify(data, null, 2);
    } catch (e) {
      return String(data);
    }
  } catch (err) {
    console.error("Gemini translate call failed:", err);
    // Normalize AbortError message for clarity
    if ((err as any)?.name === "AbortError") {
      throw new Error("Gemini request abgebrochen (Timeout)");
    }
    throw err instanceof Error ? err : new Error(String(err));
  }
};
