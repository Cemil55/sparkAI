const PRIORITY_ENDPOINT = process.env.EXPO_PUBLIC_PRIORITY_ENDPOINT ?? "";

if (!PRIORITY_ENDPOINT) {
  console.warn("⚠️ Priority Endpoint nicht gesetzt. Bitte EXPO_PUBLIC_PRIORITY_ENDPOINT konfigurieren.");
}

export interface PriorityPredictionPayload {
  "Case Description": string;
  Product: string;
  "Support Type": string;
  Status: string;
  // optional / extra ticket fields we may want to provide for better predictions
  "Case Number"?: string;
  Subject?: string;
  created?: string;
  assigned_to?: string;
  Priority?: string;
  department?: string;
}

export interface PriorityPredictionResponse {
  priority: string;
  confidence?: number;
}

export const predictPriority = async (
  payload: PriorityPredictionPayload,
  options?: { signal?: AbortSignal }
): Promise<PriorityPredictionResponse> => {
  if (!PRIORITY_ENDPOINT) {
    throw new Error("Priority Endpoint fehlt. Bitte Environment Variable setzen.");
  }

  const response = await fetch(PRIORITY_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: options?.signal,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Priority API Error ${response.status}: ${errorBody}`);
  }

  const data = (await response.json()) as PriorityPredictionResponse;

  if (!data?.priority) {
    throw new Error("Ungültige Antwort vom Priority Endpoint");
  }

  return data;
};
