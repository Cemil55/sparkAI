import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, ScrollView, Text, TextInput, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";
import { useTicketData } from "../hooks/useTicketData";
import { callGeminiAPI } from "../services/geminiService";

export default function Index() {
  const [ticketId, setTicketId] = useState("");
  const [searchTicketId, setSearchTicketId] = useState("");
  const [description, setDescription] = useState("");
  const [llmResponse, setLlmResponse] = useState("");
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
      setLoadingDots("...");
      setSearchTicketId(ticketId);
    } else {
      setSearchTicketId("");
      setDescription("");
      setLlmResponse("");
    }
  };

  const handleSendToLLM = async () => {
    if (!description || description === "Ticket nicht gefunden") {
      alert("Bitte geben Sie zuerst eine gültige Ticket ID ein");
      return;
    }

    setLoading(true);
    setLlmResponse("Spark AI generiert Lösungsvorschlag");
    setLoadingDots("...");

    try {
      const response = await callGeminiAPI(description);
      setLlmResponse(response);
    } catch (err) {
      setLlmResponse(`Fehler: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const currentTicket = searchTicketId ? getTicketById(searchTicketId) : undefined;
  const inputWrapperStyle: StyleProp<ViewStyle> = description
    ? { marginTop: 20, marginBottom: 20, alignItems: "center" }
    : { flex: 1, justifyContent: "center", alignItems: "center", marginBottom: 20 };
  const showRightBadges = Boolean(description && llmResponse && !loading);

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
              Eröffnet am {currentTicket?.creation || ""}
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
                    backgroundColor:
                      currentTicket?.priority === "Critical"
                        ? "#C21B1B"
                        : currentTicket?.priority === "High"
                        ? "#E0890E"
                        : currentTicket?.priority === "Low"
                        ? "#53A668"
                        : "#757575",
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "bold", color: "white" }}>Prio</Text>
                  <Text style={{ fontSize: 12, fontWeight: "bold", color: "white" }}>
                    {currentTicket?.priority?.toUpperCase() || ""}
                  </Text>
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
                    {currentTicket?.status?.toUpperCase() || ""}
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
                    backgroundColor: showRightBadges
                      ? currentTicket?.priority === "Critical"
                        ? "#C21B1B"
                        : currentTicket?.priority === "High"
                        ? "#E0890E"
                        : currentTicket?.priority === "Low"
                        ? "#53A668"
                        : "#757575"
                      : "#E5E7EB",
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "bold", color: showRightBadges ? "white" : "#666" }}>Prio</Text>
                  <Text style={{ fontSize: 12, fontWeight: "bold", color: showRightBadges ? "white" : "#666" }}>
                    {showRightBadges ? currentTicket?.priority?.toUpperCase() : "--"}
                  </Text>
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
