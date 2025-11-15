import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, ScrollView, Text, TextInput, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";
import { useTicketData } from "../hooks/useTicketData";
import { callSparkAI } from "../services/geminiService";
import { predictPriority } from "../services/priorityService";

export default function Index() {
  type ChatMessage = {
    sender: "user" | "ai";
    message: string;
  };

  const normalizePriorityLabel = (value: string) => {
    const trimmed = value?.trim().toLowerCase();

    if (!trimmed) {
      return "";
    }

    if (trimmed === "critical") return "Critical";
    if (trimmed === "high") return "High";
    if (trimmed === "medium") return "Medium";
    if (trimmed === "low") return "Low";

    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  };

  const getPriorityColor = (value: string) => {
    switch (value?.toLowerCase()) {
      case "critical":
        return "#C21B1B";
      case "high":
        return "#C21B1B";
      case "medium":
        return "#E8B931";
      case "low":
        return "#53A668";
      default:
        return "#757575";
    }
  };

  const [ticketId, setTicketId] = useState("");
  const [searchTicketId, setSearchTicketId] = useState("");
  const [description, setDescription] = useState("");
  const [llmResponse, setLlmResponse] = useState("");
  const [userResponse, setUserResponse] = useState("");
  const [sendingUserResponse, setSendingUserResponse] = useState(false);
  const [conversation, setConversation] = useState<ChatMessage[]>([]);
  const [predictedPriority, setPredictedPriority] = useState<string>("");
  const [priorityConfidence, setPriorityConfidence] = useState<number | null>(null);
  const [priorityLoading, setPriorityLoading] = useState(false);
  const [priorityError, setPriorityError] = useState<string>("");
  const [showPriority, setShowPriority] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingDots, setLoadingDots] = useState("...");
  const { tickets, loading: ticketsLoading, getTicketById, error } = useTicketData();

  useEffect(() => {
    if (searchTicketId) {
      const ticket = getTicketById(searchTicketId);
      if (ticket) {
        setDescription(ticket.description);
      } else {
        setDescription("Ticket nicht gefunden");
      }
    }
  }, [searchTicketId, tickets]);

  const handleSearchTicket = () => {
    if (ticketId.trim()) {
      setLlmResponse("");
      setUserResponse("");
      setLoadingDots("...");
      setConversation([]);
      setShowPriority(false);
      setPredictedPriority("");
      setPriorityConfidence(null);
      setPriorityError("");
      setPriorityLoading(false);
      setSearchTicketId(ticketId);
    } else {
      setSearchTicketId("");
      setDescription("");
      setLlmResponse("");
      setUserResponse("");
      setConversation([]);
      setShowPriority(false);
      setPredictedPriority("");
      setPriorityConfidence(null);
      setPriorityError("");
      setPriorityLoading(false);
    }
  };

  const buildConversationPrompt = (messages: ChatMessage[]) =>
    messages
      .map((entry) =>
        entry.sender === "user"
          ? `Nutzer: ${entry.message}`
          : `SparkAI: ${entry.message}`
      )
      .join("\n\n");

  const currentTicket = searchTicketId ? getTicketById(searchTicketId) : undefined;

  const handleSendToLLM = async () => {
    if (!description || description === "Ticket nicht gefunden") {
      alert("Bitte geben Sie zuerst eine gültige Ticket ID ein");
      return;
    }

    setLoading(true);
    setLlmResponse("Spark AI generiert Lösungsvorschlag");
    setLoadingDots("...");

    try {
      setPriorityLoading(true);
      setPriorityError("");
      setPredictedPriority("");
      setPriorityConfidence(null);

      const ticketContext = currentTicket
        ? `Ticket-ID: ${currentTicket.id}\nBetreff: ${currentTicket.subject || "Unbekannt"}\nProdukt: ${currentTicket.product || "Unbekannt"}\nBeschreibung: ${description}`
        : description;

      const initialConversation: ChatMessage[] = [
        ...conversation,
        { sender: "user" as const, message: ticketContext },
      ];
      setConversation(initialConversation);

      let priorityPromise: Promise<void> | undefined;
      if (currentTicket) {
        const payload = {
          "Case Description": description,
          Product: currentTicket.product || "Unbekannt",
          "Support Type":
            (currentTicket.raw?.["Support Type"] as string) ||
            (currentTicket as any)?.supportType ||
            "Technical Support",
          Status: currentTicket.status || "Open",
        };

        priorityPromise = predictPriority(payload)
          .then((result) => {
            const normalized = normalizePriorityLabel(result.priority);
            setPredictedPriority(normalized);
            setPriorityConfidence(
              typeof result.confidence === "number" ? result.confidence : null
            );
          })
          .catch((err) => {
            console.warn("Priority Endpoint Fehler:", err);
            setPredictedPriority("");
            setPriorityConfidence(null);
            setPriorityError(String(err));
          })
          .finally(() => {
            setPriorityLoading(false);
          });
      } else {
        setPriorityLoading(false);
      }

      const response = await callSparkAI(buildConversationPrompt(initialConversation));
      const updatedConversation: ChatMessage[] = [
        ...initialConversation,
        { sender: "ai" as const, message: response },
      ];
      setConversation(updatedConversation);
      setLlmResponse(response);
      setUserResponse("");

      if (priorityPromise) {
        await priorityPromise;
      }
      setShowPriority(Boolean(currentTicket));
    } catch (err) {
      setLlmResponse(`Fehler: ${err}`);
      setPriorityLoading(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSendUserResponse = async () => {
    const trimmedResponse = userResponse.trim();
    if (!trimmedResponse) {
      alert("Bitte gib eine Antwort ein, bevor du sie sendest.");
      return;
    }

    try {
      setSendingUserResponse(true);
      setLoading(true);
      setLlmResponse("Spark AI verarbeitet deine Antwort");
      setLoadingDots("...");

      const nextConversation: ChatMessage[] = [
        ...conversation,
        { sender: "user" as const, message: trimmedResponse },
      ];
      setConversation(nextConversation);

      const response = await callSparkAI(buildConversationPrompt(nextConversation));
      const updatedConversation: ChatMessage[] = [
        ...nextConversation,
        { sender: "ai" as const, message: response },
      ];
      setConversation(updatedConversation);
      setLlmResponse(response);
      setUserResponse("");
    } catch (error) {
      setLlmResponse(`Fehler: ${error}`);
    } finally {
      setSendingUserResponse(false);
      setLoading(false);
    }
  };

  const inputWrapperStyle: StyleProp<ViewStyle> = description
    ? { marginTop: 20, marginBottom: 20, alignItems: "center" }
    : { flex: 1, justifyContent: "center", alignItems: "center", marginBottom: 20 };
  const showRightBadges = Boolean(showPriority && description && llmResponse && !loading);

  useEffect(() => {
    if (!loading) {
      return;
    }

    const interval = setInterval(() => {
      setLoadingDots((prev) => {
        if (prev === "...") {
          return ".";
        }
        if (prev === ".") {
          return "..";
        }
        return "...";
      });
    }, 400);

    return () => clearInterval(interval);
  }, [loading]);

  const priorityFromEndpoint = Boolean(predictedPriority);
  const endpointColor = "#7C3AED";
  const priorityBadgeColor = priorityFromEndpoint
    ? getPriorityColor(predictedPriority) || endpointColor
    : "#E5E7EB";
  const priorityTextRaw = priorityFromEndpoint ? predictedPriority : "";
  const priorityTextUpper = showPriority
    ? priorityTextRaw
      ? priorityTextRaw.toUpperCase()
      : priorityLoading
      ? "..."
      : "--"
    : "--";
  const leftBadgeBackground = "#E5E7EB";
  const leftTextColor = "#666";
  const showPriorityConfidence =
    showPriority && priorityFromEndpoint &&
    typeof priorityConfidence === "number" &&
    !Number.isNaN(priorityConfidence);

  return (
    <ScrollView style={{ flex: 1, padding: 20, backgroundColor: "#f5f5f5" }}>
      {/* Ticket ID Input */}
      <View style={inputWrapperStyle}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "white",
              borderRadius: 5,
              paddingHorizontal: 16,
              paddingVertical: 8,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.1,
              shadowRadius: 4,
              elevation: 3,
              width: 280,
            }}
          >
            <Image
              source={require("../assets/images/ticketId_logo.png")}
              style={{ width: 24, height: 24, marginRight: 12 }}
            />
            <TextInput
              style={{
                flex: 1,
                fontSize: 14,
                color: "#333",
                padding: 0,
                height: 28,
              }}
              placeholder="Geben Sie eine Ticket ID ein"
              placeholderTextColor="#999"
              value={ticketId}
              onChangeText={setTicketId}
              onSubmitEditing={handleSearchTicket}
            />
          </View>
          <TouchableOpacity
            onPress={handleSearchTicket}
            style={{
              borderRadius: 5,
              overflow: "hidden",
              height: 44,
              width: 100,
            }}
          >
            <LinearGradient
              colors={["#B93F4B", "#451268"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{
                flex: 1,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Text style={{ color: "white", fontWeight: "bold", fontSize: 12 }}>Suchen</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>

      {ticketsLoading && <Text style={{ marginTop: 10, color: "blue" }}>Lädt Tickets...</Text>}
      {error && <Text style={{ marginTop: 10, color: "red" }}>Fehler: {error}</Text>}

      {/* Ticket Betreff */}
      {description && (
        <View style={{ marginTop: 20, maxWidth: 1100, flexDirection: "row", gap: 20 }}>
          {/* Linke Seite */}
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, color: "#999", marginBottom: 8 }}>
              {currentTicket?.creation
                ? `Eröffnet am ${currentTicket.creation}`
                : currentTicket?.product
                ? `Produkt: ${currentTicket.product}`
                : ""}
            </Text>
            
            {/* Betreff und Status/Prio auf gleicher Höhe */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <Text style={{ fontSize: 16, fontWeight: "bold", color: "#333", flex: 1 }}>
                {currentTicket
                  ? `#${currentTicket.id}: ${currentTicket.subject}`
                  : searchTicketId
                  ? `#${searchTicketId}`
                  : ""}
              </Text>
              <View style={{ flexDirection: "row", gap: 8, marginLeft: 12 }}>
                {/* Priorität Badge */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 20,
                    backgroundColor: leftBadgeBackground,
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "bold", color: leftTextColor }}>Prio</Text>
                  <Text style={{ fontSize: 12, fontWeight: "bold", color: leftTextColor }}>--</Text>
                </View>

                {/* Status Badge */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 20,
                    backgroundColor: "#E8B931",
                  }}
                >
                  <Text style={{ fontSize: 14, color: "#333" }}>⏱</Text>
                  <Text style={{ fontSize: 13, fontWeight: "bold", color: "#333" }}>
                    {currentTicket ? "OPEN" : ""}
                  </Text>
                </View>
              </View>
            </View>
            
            {/* Ticket Beschreibung */}
            <Text style={{ fontSize: 13, lineHeight: 20, color: "#555", marginBottom: 20 }}>
              {description}
            </Text>
          </View>

          {/* Rechte Seite - SparkAI Logo */}
          <View style={{ width: 350 }}>
            <Image
              source={require("../assets/images/spark-logo.png")}
              style={{ width: 100, height: 40, resizeMode: "contain", marginBottom: 20 , marginLeft: 100}}
            />
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 12, marginLeft: 100 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 20,
                    backgroundColor: showRightBadges ? priorityBadgeColor : "#E5E7EB",
                  }}
                >
                    <Text style={{ fontSize: 12, fontWeight: "bold", color: priorityFromEndpoint ? "white" : "#666" }}>Prio</Text>
                    <Text style={{ fontSize: 12, fontWeight: "bold", color: priorityFromEndpoint ? "white" : "#666" }}>
                    {showRightBadges ? priorityTextUpper || "--" : "--"}
                  </Text>
                    {showRightBadges && showPriorityConfidence ? (
                      <Text style={{ fontSize: 10, color: "white" }}>
                      ({Math.round((priorityConfidence ?? 0) * 100)}%)
                    </Text>
                  ) : null}
                </View>

              <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 20,
                    backgroundColor: showRightBadges ? "#F3F4F6" : "#E5E7EB",
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "bold", color: "#333" }}>Abteilung</Text>
                  <Text style={{ fontSize: 12, color: "#333" }}>
                    {showRightBadges ? currentTicket?.department || "Unbekannt" : "--"}
                  </Text>
                </View>
            </View>
            {priorityError && showPriority ? (
              <Text style={{ fontSize: 11, color: "#B91C1C", marginLeft: 100, marginBottom: 12 }}>
                Priorität konnte nicht berechnet werden.
              </Text>
            ) : null}
            <TextInput
                style={{
                  borderWidth: 1,
                  borderColor: "#B93F4B",
                  padding: 10,
                  borderRadius: 5,
                  height: 600,
                  width: 750,
                  textAlignVertical: "top",
                  backgroundColor: "white",
                  fontSize: 12,
                  marginLeft: 100,
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.1,
                  shadowRadius: 6,
                  elevation: 5,
                }}
              placeholder="Frag einfach SparkAI..."
              value={loading ? `${llmResponse}${loadingDots}` : llmResponse}
              editable={false}
              multiline
            />
            <Text style={{ fontSize: 12, color: "#555", marginTop: 16, marginBottom: 8, marginLeft: 100 }}>
              Eigene Antwort an den Kunden
            </Text>
            <TextInput
              style={{
                borderWidth: 1,
                borderColor: "#D1D5DB",
                padding: 10,
                borderRadius: 5,
                height: 160,
                width: 750,
                textAlignVertical: "top",
                backgroundColor: "white",
                fontSize: 12,
                marginLeft: 100,
                marginBottom: 12,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.05,
                shadowRadius: 4,
                elevation: 2,
              }}
              placeholder="Formuliere hier deine Rückmeldung..."
              value={userResponse}
              onChangeText={setUserResponse}
              multiline
            />
            <TouchableOpacity
              onPress={handleSendUserResponse}
              disabled={sendingUserResponse}
              style={{
                borderRadius: 5,
                overflow: "hidden",
                alignSelf: "flex-end",
                marginRight: 100,
                width: 180,
                height: 44,
              }}
            >
              <LinearGradient
                colors={["#451268", "#B93F4B"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{
                  flex: 1,
                  justifyContent: "center",
                  alignItems: "center",
                  opacity: sendingUserResponse ? 0.6 : 1,
                }}
              >
                {sendingUserResponse ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={{ color: "white", fontWeight: "bold", fontSize: 12 }}>Antwort senden</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Button */}
      {description && (
        <TouchableOpacity
          onPress={handleSendToLLM}
          disabled={loading}
          style={{
            borderRadius: 5,
            marginTop: 15,
            overflow: "hidden",
            maxWidth: 750,
          }}
        >
          <LinearGradient
            colors={["#B93F4B", "#451268"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{
              padding: 12,
              alignItems: "center",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={{ color: "white", fontWeight: "bold" }}>SparkAI fragen</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}
