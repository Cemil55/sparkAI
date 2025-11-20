import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Svg, {
  Defs,
  Path,
  Stop,
  LinearGradient as SvgLinearGradient,
  Text as SvgText,
} from "react-native-svg";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import { useTicketData } from "../hooks/useTicketData";
import { callSparkAI, type FlowiseHistoryMessage } from "../services/geminiService";
import { predictPriority } from "../services/priorityService";
import { getSessionId } from "../utils/session";

type DemoTicket = {
  "Case Number": string;
  Subject: string;
  "Case Description": string;
  created: string;
  assigned_to: string;
  Status: string;
  Priority: string;
};

const demoTicketData = require("../assets/data/ticket_demo.json") as DemoTicket;

export default function Index() {
  const demoTicket: DemoTicket = demoTicketData;

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
  const [demoNotes, setDemoNotes] = useState("");
  const [emptyTicketNotes, setEmptyTicketNotes] = useState("");
  const [predictedPriority, setPredictedPriority] = useState<string>("");
  const [priorityConfidence, setPriorityConfidence] = useState<number | null>(null);
  const [priorityLoading, setPriorityLoading] = useState(false);
  const [priorityError, setPriorityError] = useState<string>("");
  const [showPriority, setShowPriority] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingDots, setLoadingDots] = useState("...");
  const [hasSentInitialPrompt, setHasSentInitialPrompt] = useState(false);
  const [showFullscreenResponse, setShowFullscreenResponse] = useState(false);
  const [messages, setMessages] = useState<FlowiseHistoryMessage[]>([]);
  const [hasStartedSpark, setHasStartedSpark] = useState(false);
  const conversationHistoryRef = useRef<FlowiseHistoryMessage[]>([]);
  const scrollViewRef = useRef<ScrollView>(null);
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

  const currentTicket = searchTicketId ? getTicketById(searchTicketId) : undefined;

  const buildTicketContext = (ticket = currentTicket, desc = description) => {
    if (ticket) {
      const supportTypeRaw = ticket.raw?.["Support Type"];
      const supportType =
        typeof supportTypeRaw === "string" && supportTypeRaw.trim().length > 0
          ? supportTypeRaw.trim()
          : "Unbekannt";

      return [
        `Ticket-ID: ${ticket.id}`,
        `Betreff: ${ticket.subject || "Unbekannt"}`,
        `Produkt: ${ticket.product || "Unbekannt"}`,
        `Abteilung: ${ticket.department || "Unbekannt"}`,
        `Status: ${ticket.status || "Unbekannt"}`,
        `Support-Typ: ${supportType}`,
        `Beschreibung: ${desc}`,
      ]
        .map((line) => line.trim())
        .join("\n");
    }

    return desc;
  };

  const buildInitialPrompt = (ticketContext: string) =>
    [
      "Du bist SparkAI, ein deutschsprachiger Support-Assistent. Analysiere das folgende Ticket und formuliere eine strukturierte, pragmatische Lösung mit konkreten nächsten Schritten.",
      "Deine Antwort muss mindestens eine fundierte Handlungsempfehlung enthalten. Wenn Informationen fehlen, stelle gezielte Rückfragen und schlage diagnostische Schritte vor.",
      "Du darfst den Fall nur eskalieren, wenn eine unmittelbare Sicherheits-, Datenschutz- oder Eskalationsrichtlinie verletzt würde. Formulierungen wie 'Ich habe keine Lösung' sind zu vermeiden.",
      "Ticketinformationen:",
      ticketContext.trim(),
      "Antworte bitte auf Deutsch und konzentriere dich ausschließlich auf die Ticketdaten.",
    ].join("\n\n");

  const handleSearchTicket = () => {
    const trimmedId = ticketId.trim();

    if (trimmedId) {
      setLlmResponse("");
      setUserResponse("");
      setLoadingDots("...");
      setShowPriority(false);
      setPredictedPriority("");
      setPriorityConfidence(null);
      setPriorityError("");
      setPriorityLoading(false);
      setSearchTicketId(trimmedId);
      setHasSentInitialPrompt(false);
      conversationHistoryRef.current = [];
      setMessages([]);
    } else {
      setSearchTicketId("");
      setDescription("");
      setLlmResponse("");
      setUserResponse("");
      setShowPriority(false);
      setPredictedPriority("");
      setPriorityConfidence(null);
      setPriorityError("");
      setPriorityLoading(false);
      setHasSentInitialPrompt(false);
      conversationHistoryRef.current = [];
      setMessages([]);
    }
  };

  const handleSendToLLM = async (overrideTicketId?: string | any) => {
    const specificId = typeof overrideTicketId === "string" ? overrideTicketId : undefined;
    let activeTicket = currentTicket;
    let activeDescription = description;

    if (specificId) {
      let t = getTicketById(specificId);
      if (!t) {
        const cleanId = specificId.replace(/^(Ticket)?#?/i, "").trim();
        t = getTicketById(cleanId);
      }
      
      if (t) {
        activeTicket = t;
        activeDescription = t.description;
        setSearchTicketId(t.id);
        setDescription(t.description);
        setHasSentInitialPrompt(false);
        conversationHistoryRef.current = [];
        setMessages([]);
      }
    }

    if (!activeDescription || activeDescription === "Ticket nicht gefunden") {
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

      const ticketContext = buildTicketContext(activeTicket, activeDescription);

      let priorityPromise: Promise<void> | undefined;
      if (activeTicket) {
        const payload = {
          "Case Description": activeDescription,
          Product: activeTicket.product || "Unbekannt",
          "Support Type":
            (activeTicket.raw?.["Support Type"] as string) ||
            (activeTicket as any)?.supportType ||
            "Technical Support",
          Status: activeTicket.status || "Open",
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

      const sessionForCall = await getSessionId();
      const messageForSpark = hasSentInitialPrompt
        ? activeDescription.trim()
        : buildInitialPrompt(ticketContext);
      const response = await callSparkAI(
        messageForSpark,
        sessionForCall,
        [...conversationHistoryRef.current]
      );
      setLlmResponse(response);
      setUserResponse("");
      setHasSentInitialPrompt(true);

      const newMsgs: FlowiseHistoryMessage[] = [
        { role: "userMessage", content: messageForSpark },
        { role: "apiMessage", content: response },
      ];

      conversationHistoryRef.current = [
        ...conversationHistoryRef.current,
        ...newMsgs,
      ];
      setMessages(conversationHistoryRef.current);

      if (priorityPromise) {
        await priorityPromise;
      }
      setShowPriority(Boolean(activeTicket));
    } catch (err) {
      setLlmResponse(`Fehler: ${err}`);
      setPriorityLoading(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSendUserResponse = async (overrideText?: string) => {
    const isOverride = typeof overrideText === "string";
    const textToUse = isOverride ? overrideText : userResponse;
    const trimmedResponse = textToUse.trim();

    if (!trimmedResponse) {
      alert("Bitte gib eine Antwort ein, bevor du sie sendest.");
      return;
    }

    // Zeige die User-Nachricht sofort im Chat
    const userMsg: FlowiseHistoryMessage = { role: "userMessage", content: trimmedResponse };
    conversationHistoryRef.current = [...conversationHistoryRef.current, userMsg];
    setMessages([...conversationHistoryRef.current]);

    try {
      setSendingUserResponse(true);
      // setLlmResponse(""); // Removed to keep priority states
      // setLoadingDots("..."); // Removed to keep priority states

      // Ladeanimation als Platzhalter im Chat
      const loadingMsg: FlowiseHistoryMessage = { role: "apiMessage", content: "__LOADING__" };
      conversationHistoryRef.current = [...conversationHistoryRef.current, loadingMsg];
      setMessages([...conversationHistoryRef.current]);

      const sessionForCall = await getSessionId();
      // Sende nur die User-Nachricht und die History an SparkAI, kein Priority-Endpoint!
      const response = await callSparkAI(
        trimmedResponse,
        sessionForCall,
        conversationHistoryRef.current.filter(m => m.content !== "__LOADING__")
      );
      setLlmResponse(response);

      if (isOverride) {
        setEmptyTicketNotes("");
      } else {
        setUserResponse("");
      }

      // Ersetze Ladeanimation mit echter Antwort
      conversationHistoryRef.current = conversationHistoryRef.current.map(m =>
        m.content === "__LOADING__" ? { ...m, content: response } : m
      );
      setMessages([...conversationHistoryRef.current]);
    } catch (error) {
      setLlmResponse(`Fehler: ${error}`);
      // Ersetze Ladeanimation mit Fehlertext
      conversationHistoryRef.current = conversationHistoryRef.current.map(m =>
        m.content === "__LOADING__" ? { ...m, content: `Fehler: ${error}` } : m
      );
      setMessages([...conversationHistoryRef.current]);
    } finally {
      setSendingUserResponse(false);
    }
  };

  const inputWrapperStyle: StyleProp<ViewStyle> = description
    ? { marginTop: 20, marginBottom: 20, alignItems: "flex-start" }
    : { flex: 1, justifyContent: "center", alignItems: "center", marginBottom: 20 };
  const showRightBadges = Boolean(showPriority && description && llmResponse && !loading);

  useEffect(() => {
    if (!loading && !sendingUserResponse) {
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
  }, [loading, sendingUserResponse]);

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
    <View style={{ flex: 1, backgroundColor: "white" }}>
      <View style={{ 
        flex: 1, 
        flexDirection: "row", 
        backgroundColor: "white"
      }}>
        <Sidebar activeKey="tickets" />
        <View style={{ flex: 1, backgroundColor: "#F9F9FB" }}>
          <Topbar userName="Sam Singh" />
          <ScrollView
            style={{ flex: 1, paddingHorizontal: 32, paddingTop: 12 }}
            contentContainerStyle={{ paddingBottom: 40 }}
          >
        {/* Demo Ticket Card */}
        <View
          style={{
            backgroundColor: "white",
            borderRadius: 24,
            padding: 24,
            marginTop: 12,
            marginBottom: 24,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.08,
            shadowRadius: 20,
            elevation: 6,
            gap: 18,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Text
              style={{ fontSize: 16, fontWeight: "700", color: "#27253D" }}
              numberOfLines={1}
            >
              {demoTicket["Case Number"]}
            </Text>
            <View
              style={{
                paddingHorizontal: 18,
                paddingVertical: 8,
                borderRadius: 20,
                backgroundColor: "#5B60FF",
              }}
            >
              <Text style={{ color: "white", fontWeight: "600", fontSize: 12 }}>
                {demoTicket.Status}
              </Text>
            </View>

            <View
              style={{
                paddingHorizontal: 18,
                paddingVertical: 8,
                borderRadius: 20,
                backgroundColor: "#FF6C6C",
              }}
            >
              <Text style={{ color: "white", fontWeight: "600", fontSize: 12 }}>
                {demoTicket.Priority}
              </Text>
            </View>

            <Text style={{ fontSize: 12, color: "#7D7A92", marginLeft: "auto" }}>
              {demoTicket.created ? `Created at ${demoTicket.created}` : ""}
            </Text>
          </View>

          <Text style={{ fontSize: 20, fontWeight: "400", color: "#2E2C34" }}>
            {demoTicket.Subject}
          </Text>

          <Text style={{ fontSize: 13, lineHeight: 20, color: "#5E5B73" }}>
            {demoTicket["Case Description"]}
          </Text>

          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: "#E52C3B",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                }}
              >
                <Image
                  source={require("../assets/images/SBB.png")}
                  style={{ width: 28, height: 28, resizeMode: "contain" }}
                />
              </View>
              <View>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#727272" }}>
                  SBB CFF FFS
                </Text>
              </View>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={{ fontSize: 12, color: "#7D7A92" }}>Assigned to</Text>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#2E2C34" }}>
                  {demoTicket.assigned_to}
                </Text>
              </View>
            </View>
          </View>
        </View>
        
        <View
          style={{
            flexDirection: "row",
            alignItems: "stretch",
            gap: 12,
            marginBottom: 24,
            width: "100%",
          }}
        >
          
          <View
            style={{
              flex: 1,
              backgroundColor: "white",
              borderRadius: 16,
              padding: 20,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.06,
              shadowRadius: 12,
              elevation: 4,
            }}
          >
            <TextInput
              value={demoNotes}
              onChangeText={setDemoNotes}
              placeholder="Type your response here..."
              placeholderTextColor="#9CA3AF"
              multiline
              style={{
                width: "100%",
                minHeight: 40,
                borderWidth: 1,
                borderColor: "#E5E7EB",
                borderRadius: 12,
                paddingHorizontal: 16,
                paddingVertical: 10,
                fontSize: 13,
                color: "#333",
                backgroundColor: "#F9FAFB",
              }}
            />
          </View>
          
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => {
              handleSendToLLM("Ticket#20200521-5022024");
              setShowFullscreenResponse(true);
              setHasStartedSpark(true);
            }}
            disabled={loading}
            style={{
              width: 150,
              minHeight: 80,
              borderRadius: 12,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.08,
              shadowRadius: 4,
              elevation: 3,
            }}
          >
            <LinearGradient
              colors={["#B93F4B", "#451268"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                flex: 1,
                borderRadius: 12,
                padding: 2,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  flex: 1,
                  borderRadius: 10,
                  backgroundColor: "white",
                  alignItems: "center",
                  justifyContent: "center",
                  paddingVertical: 8,
                }}
              >
                <Image
                  source={require("../assets/images/spark-logo.png")}
                  style={{ width: 64, height: 32, resizeMode: "contain" }}
                />
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </View>
        {hasStartedSpark && <View style={{ flexDirection: "row", gap: 8, marginBottom: 12, marginTop: 24 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 25 }}>
              <View style={{ width: 40, height: 15 }}>
                <Svg width="100%" height="100%">
                  <Defs>
                    <SvgLinearGradient id="prio2-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <Stop offset="0%" stopColor="#B93F4B" />
                      <Stop offset="100%" stopColor="#451268" />
                    </SvgLinearGradient>
                  </Defs>
                  <SvgText
                    fill="url(#prio2-gradient)"
                    fontSize="12"
                    fontWeight="bold"
                    x="0"
                    y="11"
                  >
                    Prio:
                  </SvgText>
                </Svg>
              </View>
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
                <Text style={{ fontSize: 12, fontWeight: "bold", color: priorityFromEndpoint ? "white" : "#666" }}>
                  {showRightBadges ? priorityTextUpper || "--" : "--"}
                </Text>
                {showRightBadges && showPriorityConfidence ? (
                  <Text style={{ fontSize: 10, color: "white" }}>
                    ({Math.round((priorityConfidence ?? 0) * 100)}%)
                  </Text>
                ) : null}
              </View>
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 25,marginLeft: 40 }}>
              <View style={{ width: 75, height: 15 }}>
                <Svg width="100%" height="100%">
                  <Defs>
                    <SvgLinearGradient id="abteilung2-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <Stop offset="0%" stopColor="#B93F4B" />
                      <Stop offset="100%" stopColor="#451268" />
                    </SvgLinearGradient>
                  </Defs>
                  <SvgText
                    fill="url(#abteilung2-gradient)"
                    fontSize="12"
                    fontWeight="bold"
                    x="0"
                    y="11"
                  >
                    Abteilung:
                  </SvgText>
                </Svg>
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
                <Text style={{ fontSize: 12, color: "#333" }}>
                  {showRightBadges ? currentTicket?.department || "Unbekannt" : "--"}
                </Text>
              </View>
            </View>
          </View>}
        
        {hasStartedSpark && <View
          style={{
            flexDirection: "row",
            alignItems: "stretch",
            gap: 12,
            marginBottom: 24,
            marginTop: 10,
            width: "100%",
          }}
        >
          <LinearGradient
            colors={["#B93F4B", "#451268"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ flex: 1, borderRadius: 16, padding: 3 }}
          >
            <View
              style={{
                flex: 1,
                backgroundColor: "white",
                borderRadius: 13,
                padding: 20,
                minHeight: 200,
                position: "relative",
              }}
            >
              {llmResponse && !loading ? (
                <TouchableOpacity
                  onPress={() => setShowFullscreenResponse(true)}
                  style={{ position: "absolute", top: 12, right: 12, zIndex: 10 }}
                >
                  <Svg width="32" height="32" viewBox="0 0 24 24">
                    <Defs>
                      <SvgLinearGradient id="fullscreen-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <Stop offset="0%" stopColor="#B93F4B" />
                        <Stop offset="100%" stopColor="#451268" />
                      </SvgLinearGradient>
                    </Defs>
                    <Path
                      d="M5 5h5v2H7v3H5V5zm10 0h5v5h-2V7h-3V5zm0 14h3v-3h2v5h-5v-2zM5 14h2v3h3v2H5v-5z"
                      fill="url(#fullscreen-gradient)"
                    />
                  </Svg>
                </TouchableOpacity>
              ) : null}
              <TextInput
                style={{
                  flex: 1,
                  fontSize: 13,
                  lineHeight: 20,
                  color: "#333",
                  textAlignVertical: "top",
                }}
                multiline
                editable={false}
                value={
                  loading || sendingUserResponse
                    ? `Spark AI generiert Lösungsvorschlag${loadingDots}`
                    : llmResponse
                }
              />
            </View>
          </LinearGradient>
        </View>}
        {hasStartedSpark && <View
          style={{
            flexDirection: "row",
            alignItems: "stretch",
            gap: 12,
            marginBottom: 24,
            width: "100%",
          }}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: "white",
              borderRadius: 16,
              padding: 20,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.06,
              shadowRadius: 12,
              elevation: 4,
            }}
          >
            <View style={{ position: "relative" }}>
              {emptyTicketNotes.trim().length === 0 ? (
                <View
                  pointerEvents="none"
                  style={{ position: "absolute", left: 16, right: 16, top: 10, height: 20 }}
                >
                  <Svg width="100%" height="20">
                    <Defs>
                      <SvgLinearGradient
                        id="empty-ticket-gradient"
                        x1="0%"
                        y1="0%"
                        x2="100%"
                        y2="0%"
                      >
                        <Stop offset="0%" stopColor="#B93F4B" />
                        <Stop offset="100%" stopColor="#451268" />
                      </SvgLinearGradient>
                    </Defs>
                    <SvgText
                      fill="url(#empty-ticket-gradient)"
                      fontSize={13}
                      fontWeight="400"
                      x="0"
                      y={14}
                    >
                      Do you have any questions about Spark's answer?
                    </SvgText>
                  </Svg>
                </View>
              ) : null}
              <TextInput
                value={emptyTicketNotes}
                onChangeText={setEmptyTicketNotes}
                placeholder=""
                multiline
                style={{
                  width: "100%",
                  minHeight: 40,
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                  borderRadius: 12,
                  paddingHorizontal: 16,
                  paddingVertical: 2,
                  fontSize: 13,
                  color: "#333",
                  backgroundColor: "#F9FAFB",
                }}
              />
            </View>
          </View>

          <TouchableOpacity
            onPress={() => handleSendUserResponse(emptyTicketNotes)}
            disabled={sendingUserResponse}
            style={{
              width: 180,
              height: 50,
              borderRadius: 5,
              overflow: "hidden",
              marginTop: 18,
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
                <Text style={{ color: "white", fontWeight: "bold", fontSize: 12 }}>
                  Antwort senden
                </Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>}
        
          </ScrollView>
        </View>
      </View>

      <Modal
        visible={showFullscreenResponse}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowFullscreenResponse(false)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 40 }}>
          <View style={{ flex: 1, backgroundColor: "#F9F9FB", borderRadius: 16, padding: 24, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 5 }}>
            <View style={{ flexDirection: "row", justifyContent: "flex-end", marginBottom: 16 }}>
              <TouchableOpacity onPress={() => setShowFullscreenResponse(false)}>
                <MaterialCommunityIcons name="close" size={28} color="#666" />
              </TouchableOpacity>
            </View>
            <ScrollView
              ref={scrollViewRef}
              style={{ flex: 1, marginBottom: 16 }}
              onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
            >
              {messages.map((msg, index) => {
                const isUser = msg.role === "userMessage";
                const isSystemPrompt = isUser && msg.content.startsWith("Du bist SparkAI");
                const isLoading = msg.content === "__LOADING__";
                const displayContent = isSystemPrompt ? "Ticket Analysis Request" : msg.content;

                return (
                  <View
                    key={index}
                    style={{
                      flexDirection: "row",
                      justifyContent: isUser ? "flex-end" : "flex-start",
                      marginBottom: 12,
                    }}
                  >
                    {!isUser && (
                      <View style={{ marginRight: 8, marginTop: 4 }}>
                        <Svg width="24" height="24" viewBox="0 0 24 24">
                          <Defs>
                            <SvgLinearGradient id="bot-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                              <Stop offset="0%" stopColor="#B93F4B" />
                              <Stop offset="100%" stopColor="#451268" />
                            </SvgLinearGradient>
                          </Defs>
                          <Path
                            d="M17.7530511,13.999921 C18.9956918,13.999921 20.0030511,15.0072804 20.0030511,16.249921 L20.0030511,17.1550008 C20.0030511,18.2486786 19.5255957,19.2878579 18.6957793,20.0002733 C17.1303315,21.344244 14.8899962,22.0010712 12,22.0010712 C9.11050247,22.0010712 6.87168436,21.3444691 5.30881727,20.0007885 C4.48019625,19.2883988 4.00354153,18.2500002 4.00354153,17.1572408 L4.00354153,16.249921 C4.00354153,15.0072804 5.01090084,13.999921 6.25354153,13.999921 L17.7530511,13.999921 Z M11.8985607,2.00734093 L12.0003312,2.00049432 C12.380027,2.00049432 12.6938222,2.2826482 12.7434846,2.64872376 L12.7503312,2.75049432 L12.7495415,3.49949432 L16.25,3.5 C17.4926407,3.5 18.5,4.50735931 18.5,5.75 L18.5,10.254591 C18.5,11.4972317 17.4926407,12.504591 16.25,12.504591 L7.75,12.504591 C6.50735931,12.504591 5.5,11.4972317 5.5,10.254591 L5.5,5.75 C5.5,4.50735931 6.50735931,3.5 7.75,3.5 L11.2495415,3.49949432 L11.2503312,2.75049432 C11.2503312,2.37079855 11.5324851,2.05700336 11.8985607,2.00734093 L12.0003312,2.00049432 L11.8985607,2.00734093 Z M9.74928905,6.5 C9.05932576,6.5 8.5,7.05932576 8.5,7.74928905 C8.5,8.43925235 9.05932576,8.99857811 9.74928905,8.99857811 C10.4392523,8.99857811 10.9985781,8.43925235 10.9985781,7.74928905 C10.9985781,7.05932576 10.4392523,6.5 9.74928905,6.5 Z M14.2420255,6.5 C13.5520622,6.5 12.9927364,7.05932576 12.9927364,7.74928905 C12.9927364,8.43925235 13.5520622,8.99857811 14.2420255,8.99857811 C14.9319888,8.99857811 15.4913145,8.43925235 15.4913145,7.74928905 C15.4913145,7.05932576 14.9319888,6.5 14.2420255,6.5 Z"
                            fill="url(#bot-gradient)"
                          />
                        </Svg>
                      </View>
                    )}
                    {isUser ? (
                      <View
                        style={{
                          backgroundColor: "#E5E7EB",
                          borderRadius: 12,
                          padding: 12,
                          maxWidth: "80%",
                          borderBottomRightRadius: 0,
                          borderBottomLeftRadius: 12,
                        }}
                      >
                        <Text style={{ fontSize: 14, lineHeight: 22, color: "#333" }}>
                          {displayContent}
                        </Text>
                      </View>
                    ) : isLoading ? (
                      <LinearGradient
                        colors={["#B93F4B", "#451268"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={{
                          borderRadius: 12,
                          padding: 1.5,
                          maxWidth: "80%",
                          borderBottomLeftRadius: 0,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <View
                          style={{
                            backgroundColor: "white",
                            borderRadius: 10.5,
                            padding: 12,
                            borderBottomLeftRadius: 0,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <ActivityIndicator color="#B93F4B" size="small" />
                        </View>
                      </LinearGradient>
                    ) : (
                      <LinearGradient
                        colors={["#B93F4B", "#451268"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={{
                          borderRadius: 12,
                          padding: 1.5,
                          maxWidth: "80%",
                          borderBottomLeftRadius: 0,
                        }}
                      >
                        <View
                          style={{
                            backgroundColor: "white",
                            borderRadius: 10.5,
                            padding: 12,
                            borderBottomLeftRadius: 0,
                          }}
                        >
                          <Text style={{ fontSize: 14, lineHeight: 22, color: "#333" }}>
                            {displayContent}
                          </Text>
                        </View>
                      </LinearGradient>
                    )}
                  </View>
                );
              })}
              {loading && (
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "flex-start",
                    marginBottom: 12,
                  }}
                >
                  <View style={{ marginRight: 8, marginTop: 4 }}>
                    <Svg width="24" height="24" viewBox="0 0 24 24">
                      <Defs>
                        <SvgLinearGradient id="bot-gradient-loading" x1="0%" y1="0%" x2="100%" y2="100%">
                          <Stop offset="0%" stopColor="#B93F4B" />
                          <Stop offset="100%" stopColor="#451268" />
                        </SvgLinearGradient>
                      </Defs>
                      <Path
                        d="M17.7530511,13.999921 C18.9956918,13.999921 20.0030511,15.0072804 20.0030511,16.249921 L20.0030511,17.1550008 C20.0030511,18.2486786 19.5255957,19.2878579 18.6957793,20.0002733 C17.1303315,21.344244 14.8899962,22.0010712 12,22.0010712 C9.11050247,22.0010712 6.87168436,21.3444691 5.30881727,20.0007885 C4.48019625,19.2883988 4.00354153,18.2500002 4.00354153,17.1572408 L4.00354153,16.249921 C4.00354153,15.0072804 5.01090084,13.999921 6.25354153,13.999921 L17.7530511,13.999921 Z M11.8985607,2.00734093 L12.0003312,2.00049432 C12.380027,2.00049432 12.6938222,2.2826482 12.7434846,2.64872376 L12.7503312,2.75049432 L12.7495415,3.49949432 L16.25,3.5 C17.4926407,3.5 18.5,4.50735931 18.5,5.75 L18.5,10.254591 C18.5,11.4972317 17.4926407,12.504591 16.25,12.504591 L7.75,12.504591 C6.50735931,12.504591 5.5,11.4972317 5.5,10.254591 L5.5,5.75 C5.5,4.50735931 6.50735931,3.5 7.75,3.5 L11.2495415,3.49949432 L11.2503312,2.75049432 C11.2503312,2.37079855 11.5324851,2.05700336 11.8985607,2.00734093 L12.0003312,2.00049432 L11.8985607,2.00734093 Z M9.74928905,6.5 C9.05932576,6.5 8.5,7.05932576 8.5,7.74928905 C8.5,8.43925235 9.05932576,8.99857811 9.74928905,8.99857811 C10.4392523,8.99857811 10.9985781,8.43925235 10.9985781,7.74928905 C10.9985781,7.05932576 10.4392523,6.5 9.74928905,6.5 Z M14.2420255,6.5 C13.5520622,6.5 12.9927364,7.05932576 12.9927364,7.74928905 C12.9927364,8.43925235 13.5520622,8.99857811 14.2420255,8.99857811 C14.9319888,8.99857811 15.4913145,8.43925235 15.4913145,7.74928905 C15.4913145,7.05932576 14.9319888,6.5 14.2420255,6.5 Z"
                        fill="url(#bot-gradient-loading)"
                      />
                    </Svg>
                  </View>
                  <LinearGradient
                    colors={["#B93F4B", "#451268"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{
                      borderRadius: 12,
                      padding: 1.5,
                      maxWidth: "80%",
                      borderBottomLeftRadius: 0,
                    }}
                  >
                    <View
                      style={{
                        backgroundColor: "#F3F4F6",
                        borderRadius: 10.5,
                        padding: 12,
                        borderBottomLeftRadius: 0,
                      }}
                    >
                      <Text style={{ fontSize: 14, lineHeight: 22, color: "#333" }}>
                        Spark AI generiert Lösungsvorschlag{loadingDots}
                      </Text>
                    </View>
                  </LinearGradient>
                </View>
              )}
            </ScrollView>
            
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 12, marginTop: 24, paddingHorizontal: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 25 }}>
                <View style={{ width: 40, height: 15 }}>
                  <Svg width="100%" height="100%">
                    <Defs>
                      <SvgLinearGradient id="prio-fullscreen-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <Stop offset="0%" stopColor="#B93F4B" />
                        <Stop offset="100%" stopColor="#451268" />
                      </SvgLinearGradient>
                    </Defs>
                    <SvgText
                      fill="url(#prio-fullscreen-gradient)"
                      fontSize="12"
                      fontWeight="bold"
                      x="0"
                      y="11"
                    >
                      Prio:
                    </SvgText>
                  </Svg>
                </View>
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
                  <Text style={{ fontSize: 12, fontWeight: "bold", color: priorityFromEndpoint ? "white" : "#666" }}>
                    {showRightBadges ? priorityTextUpper || "--" : "--"}
                  </Text>
                  {showRightBadges && showPriorityConfidence ? (
                    <Text style={{ fontSize: 10, color: "white" }}>
                      ({Math.round((priorityConfidence ?? 0) * 100)}%)
                    </Text>
                  ) : null}
                </View>
              </View>

              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 25,marginLeft: 40 }}>
                <View style={{ width: 75, height: 15 }}>
                  <Svg width="100%" height="100%">
                    <Defs>
                      <SvgLinearGradient id="abteilung-fullscreen-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <Stop offset="0%" stopColor="#B93F4B" />
                        <Stop offset="100%" stopColor="#451268" />
                      </SvgLinearGradient>
                    </Defs>
                    <SvgText
                      fill="url(#abteilung-fullscreen-gradient)"
                      fontSize="12"
                      fontWeight="bold"
                      x="0"
                      y="11"
                    >
                      Abteilung:
                    </SvgText>
                  </Svg>
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
                  <Text style={{ fontSize: 12, color: "#333" }}>
                    {showRightBadges ? currentTicket?.department || "Unbekannt" : "--"}
                  </Text>
                </View>
              </View>
            </View>
            
            <View style={{ gap: 12, borderTopWidth: 1, borderTopColor: "#F3F4F6", paddingTop: 16 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "stretch",
                  gap: 12,
                  width: "100%",
                }}
              >
                <View
                  style={{
                    flex: 1,
                    backgroundColor: "white",
                    borderRadius: 16,
                    padding: 20,
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 6 },
                    shadowOpacity: 0.06,
                    shadowRadius: 12,
                    elevation: 4,
                  }}
                >
                  <View style={{ position: "relative" }}>
                    {emptyTicketNotes.trim().length === 0 ? (
                      <View
                        pointerEvents="none"
                        style={{ position: "absolute", left: 16, right: 16, top: 10, height: 20 }}
                      >
                        <Svg width="100%" height="20">
                          <Defs>
                            <SvgLinearGradient
                              id="empty-ticket-modal-gradient"
                              x1="0%"
                              y1="0%"
                              x2="100%"
                              y2="0%"
                            >
                              <Stop offset="0%" stopColor="#B93F4B" />
                              <Stop offset="100%" stopColor="#451268" />
                            </SvgLinearGradient>
                          </Defs>
                          <SvgText
                            fill="url(#empty-ticket-modal-gradient)"
                            fontSize={13}
                            fontWeight="400"
                            x="0"
                            y={14}
                          >
                            Do you have any questions about Spark's answer?
                          </SvgText>
                        </Svg>
                      </View>
                    ) : null}
                    <TextInput
                      value={emptyTicketNotes}
                      onChangeText={setEmptyTicketNotes}
                      placeholder=""
                      multiline
                      style={{
                        width: "100%",
                        minHeight: 40,
                        borderWidth: 1,
                        borderColor: "#E5E7EB",
                        borderRadius: 12,
                        paddingHorizontal: 16,
                        paddingVertical: 2,
                        fontSize: 13,
                        color: "#333",
                        backgroundColor: "#F9FAFB",
                      }}
                    />
                  </View>
                </View>

                <TouchableOpacity
                  onPress={() => handleSendUserResponse(emptyTicketNotes)}
                  disabled={sendingUserResponse}
                  style={{
                    width: 180,
                    height: 44,
                    borderRadius: 5,
                    overflow: "hidden",
                    marginTop: 20,
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
                      <Text style={{ color: "white", fontWeight: "bold", fontSize: 12 }}>
                        Antwort senden
                      </Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
