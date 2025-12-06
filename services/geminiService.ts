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
