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
import TicketList from "../components/TicketList";
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

    // be generous: match common variants like "High Priority", "critical - urgent", etc.
    if (trimmed.includes("critical")) return "Critical";
    if (trimmed.includes("high")) return "High";
    if (trimmed.includes("medium")) return "Medium";
    if (trimmed.includes("low")) return "Low";

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
  const [showComposeModal, setShowComposeModal] = useState(false);
  // last ticket object we asked SparkAI to analyze (used for inline badges when we don't switch UI focus)
  const [analysisTicket, setAnalysisTicket] = useState<any | null>(null);
  const [composeTo, setComposeTo] = useState("Support@SBB.ch");
  const [composeCc, setComposeCc] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  // composeStatus now supports Open (default), In Progress, Closed
  const [composeStatus, setComposeStatus] = useState<"Open" | "In Progress" | "Closed">("Open");
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const conversationHistoryRef = useRef<FlowiseHistoryMessage[]>([]);
  const scrollViewRef = useRef<ScrollView>(null);
  const { tickets, loading: ticketsLoading, getTicketById, error, updateTicket } = useTicketData();

  // local state for demo ticket card (so compose sends can update the demo display)
  const [demoTicketStatus, setDemoTicketStatus] = useState<string>(demoTicket.Status);
  const [demoTicketPriority, setDemoTicketPriority] = useState<string>(normalizePriorityLabel(demoTicket.Priority));
  // demo department — demo JSON doesn't include this so default to General support
  const [demoTicketDepartment, setDemoTicketDepartment] = useState<string>(
    (demoTicket as any)?.department ?? "General support"
  );
  // demo assigned (demo JSON includes assigned_to) - default to Michael Fischer
  const [demoTicketAssigned, setDemoTicketAssigned] = useState<string>(
    (demoTicket as any)?.assigned_to ?? "Michael Fischer"
  );
  // tracks where the compose modal was opened for — 'demo' or a ticket id
  const [composeTarget, setComposeTarget] = useState<string | "demo" | null>(null);
  // controls whether the mid-page compose/LLM area is visible
  const [showMiddleSection, setShowMiddleSection] = useState<boolean>(true);

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

  // overrideTicketId: optional id to analyze
  // opts.focus: when false, we run analysis for the id but DO NOT switch the UI to that ticket
  const handleSendToLLM = async (overrideTicketId?: string | any, opts?: { focus?: boolean }) => {
    const focus = opts?.focus ?? true;
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
        // remember what ticket was analyzed so the inline badges can show info
        setAnalysisTicket(t);
        activeTicket = t;
        activeDescription = t.description;
        // By default we focus the found ticket in the UI, but callers can opt out
        if (focus) {
          setSearchTicketId(t.id);
          setDescription(t.description);
          setHasSentInitialPrompt(false);
          conversationHistoryRef.current = [];
          setMessages([]);
        }
      } else {
        // no ticket found, clear analysisTicket so inline badges don't stick
        setAnalysisTicket(null);
      }
    }

    // if no specific id provided, analyze the current ticket and remember it
    if (!specificId && activeTicket) {
      setAnalysisTicket(activeTicket);
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

  const openComposeModal = (initialSubject?: string, target?: string | "demo") => {
    if (initialSubject) setComposeSubject(initialSubject);
    setComposeBody("");
    setShowComposeModal(true);
    setComposeTarget(typeof target === "string" ? target : null);
  };

  const ignoreFocusRef = useRef(false);

  const closeComposeModal = () => {
    // Hide modal and reset compose form fields so next open starts fresh
    // Also set a short flag so underlying inputs don't re-open the modal immediately
    setShowComposeModal(false);
    setComposeTo("Support@SBB.ch");
    setComposeCc("");
    setComposeSubject("");
    setComposeBody("");
    // Reset to default Open so the next compose shows Open (with color)
    setComposeStatus("Open");

    ignoreFocusRef.current = true;
    setTimeout(() => (ignoreFocusRef.current = false), 300);
    setComposeTarget(null);
  };

  const sendCompose = async () => {
    // capture current body before clearing form
    const bodyToSend = composeBody?.trim() ?? "";
    if (!bodyToSend) {
      // no body, just close
      closeComposeModal();
      return;
    }

    // IMPORTANT: messages created from the Compose modal must NOT be forwarded to Spark AI
    // (per product request) — we insert the message locally into the conversation only.
    const userMsg: FlowiseHistoryMessage = { role: "userMessage", content: bodyToSend };
    conversationHistoryRef.current = [...conversationHistoryRef.current, userMsg];
    setMessages([...conversationHistoryRef.current]);

    // Mark the associated ticket as Closed and update priority on the start screen
    try {
      // Compute new priority for the ticket.
      // Preference order:
      // 1) predictedPriority from earlier LLM/endpoint
      // 2) simple local heuristic based on the compose body text
      // 3) currentTicket priority (if available)
      // 4) demo fallback
      const heuristicFromText = (text: string) => {
        const t = String(text || "").toLowerCase();
        if (!t) return "";
        if (t.includes("krit") || t.includes("urgent") || t.includes("sehr dringend") || t.includes("sofort")) return "Critical";
        if (t.includes("hoch") || t.includes("wichtig") || t.includes("dringend")) return "High";
        if (t.includes("mittel") || t.includes("normal")) return "Medium";
        if (t.includes("niedrig") || t.includes("low")) return "Low";
        return "";
      };

      let newPriorityRaw = predictedPriority || heuristicFromText(bodyToSend) || currentTicket?.priority || demoTicketPriority || "Medium";
      const normalizedPriority = normalizePriorityLabel(String(newPriorityRaw));

      // Decide which target to update: explicit composeTarget if provided, otherwise prefer currentTicket
      if (composeTarget === "demo") {
        // Update demo card both status, priority and adopt the department currently shown in the compose header
        setDemoTicketStatus("Closed");
        setDemoTicketPriority(normalizedPriority);
        // choose the department displayed in the compose header (prefer analysisTicket, then currentTicket, then demo fallback)
        const deptToApply = analysisTicket?.department ?? currentTicket?.department ?? demoTicketDepartment ?? (demoTicket as any)?.department ?? "General support";
        setDemoTicketDepartment(String(deptToApply));
      } else if (typeof composeTarget === "string" && composeTarget) {
        // a specific ticket id was provided as composeTarget
        if (typeof updateTicket === "function") {
          (updateTicket as any)?.(composeTarget, { status: "Closed", priority: normalizedPriority });
        }
        // also fallback to currentTicket if it matches
        else if (currentTicket && String(currentTicket.id) === String(composeTarget) && typeof updateTicket === "function") {
          (updateTicket as any)?.(currentTicket.id, { status: "Closed", priority: normalizedPriority });
        }
      } else if (currentTicket && typeof updateTicket === "function") {
        // no explicit composeTarget, update the current ticket if present
        (updateTicket as any)?.(currentTicket.id, { status: "Closed", priority: normalizedPriority });
      } else {
        // fallback demo path
        setDemoTicketStatus("Closed");
        setDemoTicketPriority(normalizedPriority);
      }
      // Always update demo card so the start page reflects the change regardless of where compose was opened
      setDemoTicketStatus("Closed");
      setDemoTicketPriority(normalizedPriority);
    } catch (e) {
      console.warn("Failed to update ticket after compose send:", e);
    }

    closeComposeModal();

    // hide the mid-page compose/LLM area (between the demo input and Last Tickets)
    setShowMiddleSection(false);

    // show feedback modal only when Spark AI actually produced a solution suggestion
    // (not when it's still loading or returned an error)
    const llmText = String(llmResponse || "").trim();
    const isLLMPlaceholder = llmText === "Spark AI generiert Lösungsvorschlag" || llmText === "__LOADING__";
    const isLLMError = llmText.startsWith("Fehler");
    if (llmText && !loading && !isLLMPlaceholder && !isLLMError) {
      setShowFeedbackModal(true);
    }
  };

  // feedback modal state
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState<number | null>(null);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  const closeFeedback = () => {
    setShowFeedbackModal(false);
    setFeedbackRating(null);
    setFeedbackSubmitted(false);
  };

  const submitFeedback = () => {
    // For now we only show a thank-you state; real submission can be added later
    setFeedbackSubmitted(true);
    // auto-close after a moment
    setTimeout(() => closeFeedback(), 900);
  };

  const insertLastSparkResponse = () => {
    // prefer the last apiMessage from the conversation history (excluding loading markers)
    const reversed = [...conversationHistoryRef.current].slice().reverse();
    const found = reversed.find((m) => m.role === "apiMessage" && m.content && m.content !== "__LOADING__");
    const text = found?.content ?? llmResponse ?? "";
    setComposeBody(text);
  };

  // edit UI/modal state for Status / Priority / Department
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editField, setEditField] = useState<"status" | "priority" | "department" | "assigned" | null>(null);
  const [editDraftValue, setEditDraftValue] = useState<string>("");

  const openEdit = (field: "status" | "priority" | "department" | "assigned") => {
    setEditField(field);
    // decide initial value (prefer currentTicket when available)
    if (currentTicket) {
      setEditDraftValue(String((currentTicket as any)[field] ?? ""));
    } else if (field === "status") {
      setEditDraftValue(demoTicketStatus);
    } else if (field === "priority") {
      setEditDraftValue(demoTicketPriority);
    } else if (field === "department") {
      setEditDraftValue(demoTicketDepartment);
    } else if (field === "assigned") {
      setEditDraftValue(demoTicketAssigned);
    } else {
      setEditDraftValue("");
    }
    setEditModalVisible(true);
  };

  const saveEdit = () => {
    if (!editField) return setEditModalVisible(false);
    const value = editDraftValue?.trim() ?? "";

    // normalize priority if needed
    const normalized = editField === "priority" ? normalizePriorityLabel(value) : value;

    try {
      if (currentTicket && typeof updateTicket === "function") {
        // call updateTicket on the current ticket
        // map local editField 'assigned' to backend 'assigned_to'
        if (editField === "assigned") {
          (updateTicket as any)(currentTicket.id, { assigned_to: normalized });
        } else {
          (updateTicket as any)(currentTicket.id, { [editField]: normalized });
        }
      } else {
        // update demo state only
        if (editField === "status") setDemoTicketStatus(normalized || demoTicketStatus);
        if (editField === "priority") setDemoTicketPriority(normalized || demoTicketPriority);
        if (editField === "department") {
          setDemoTicketDepartment(normalized || demoTicketDepartment);
          // Per request: when the demo ticket's department changes, reset Assigned to "Unbekannt"
          setDemoTicketAssigned("Unbekannt");
        }
        if (editField === "assigned") setDemoTicketAssigned(normalized || demoTicketAssigned);
      }
    } catch (e) {
      console.warn("Failed saving edit", e);
    }

    setEditModalVisible(false);
    setEditField(null);
    setEditDraftValue("");
  };

  const cancelEdit = () => {
    setEditModalVisible(false);
    setEditField(null);
    setEditDraftValue("");
  };

  const inputWrapperStyle: StyleProp<ViewStyle> = description
    ? { marginTop: 20, marginBottom: 20, alignItems: "flex-start" }
    : { flex: 1, justifyContent: "center", alignItems: "center", marginBottom: 20 };
  // Show inline badges when we have an analyzed ticket (analysisTicket) or a focused ticket (currentTicket)
  // -- remove requirement on `description` so analysis without switching focus still shows badges
  const showRightBadges = Boolean(showPriority && llmResponse && !loading);

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
            gap: 10,
          }}
        >
          <View style={{ flexDirection: "row", gap: 20, alignItems: "flex-start" }}>
            {/* left column: keep the original left side content (ticket number, subject, description, avatar) */}
            <View style={{ flex: 1, gap: 8 }}>
              <Text
                style={{ fontSize: 16, fontWeight: "700", color: "#27253D" }}
                numberOfLines={1}
              >
                {demoTicket["Case Number"]}
              </Text>

              <Text style={{ fontSize: 20, fontWeight: "400", color: "#2E2C34" }}>
                {demoTicket.Subject}
              </Text>

              <Text style={{ fontSize: 13, lineHeight: 20, color: "#5E5B73" }}>
                {demoTicket["Case Description"]}
              </Text>

              <View style={{ flexDirection: "row", justifyContent: "flex-start", alignItems: "center", marginTop: 50 }}>
                <Image
                  source={require("../assets/images/SBB.png")}
                  style={{ width: 40, height: 40, borderRadius: 20, marginRight: 18 }}
                />
                <View>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: "#727272" }}>
                    SBB CFF FFS
                  </Text>
                </View>
              </View>
            </View>

            {/* right column: dedicated stacked block for Created / Abteilung / Status / Prio */}
            <View style={{ width: 240, alignItems: "flex-start" }}>
              <View style={{ marginTop: 0, alignItems: "flex-start" }}>
                {/* Created row (top) */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 30 }}>
                  <Text style={{ width: 80, fontSize: 12, color: "#7D7A92", textAlign: "right" }}>Created</Text>
                  <Text style={{ fontSize: 12, color: "#7D7A92", marginLeft: 8 }}>{demoTicket.created ?? ""}</Text>
                </View>

                {/* Status row (moved up) */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 30 }}>
                  <Text style={{ width: 80, fontSize: 12, color: "#7D7A92", textAlign: "right" }}>Status</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    {/* Status pill - match TicketList style */}
                    <View style={{ backgroundColor: demoTicketStatus === "Closed" ? "#B7E2B7" : demoTicketStatus === "In Progress" ? "#D1D5DB" : "#5B60FF", borderRadius: 8, width: 120, paddingVertical: 8, alignItems: "center", justifyContent: "center", marginRight: 6 }}>
                      <Text style={{ color: demoTicketStatus === "Closed" ? "#185C1E" : demoTicketStatus === "In Progress" ? "#666" : "white", fontWeight: "600", fontSize: 15, textAlign: "center", width: "100%" }}>{demoTicketStatus}</Text>
                    </View>
                    <TouchableOpacity onPress={() => openEdit("status")} style={{ padding: 6 }}>
                      <MaterialCommunityIcons name="pencil-outline" size={14} color="#666" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Priority row (now after status) */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 30 }}>
                  <Text style={{ width: 80, fontSize: 12, color: "#7D7A92", textAlign: "right" }}>Priority</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      {/* Priority pill - use TicketList pill sizing; pale background with colored text per priority */}
                      {(function renderPriorityPill() {
                        const p = String(demoTicketPriority || "").toLowerCase();
                        const textColor = getPriorityColor(demoTicketPriority);
                        const bg = p.includes("critical") || p.includes("high")
                          ? "#FFEAEA"
                          : p.includes("medium")
                          ? "#FFF7D6"
                          : p.includes("low")
                          ? "#E8F7EE"
                          : "#E5E7EB";

                        return (
                          <View style={{ backgroundColor: bg, borderRadius: 8, width: 120, paddingVertical: 8, alignItems: "center", justifyContent: "center" }}>
                            <Text style={{ color: textColor, fontWeight: "600", fontSize: 15, textAlign: "center", width: "100%" }}>{demoTicketPriority || "--"}</Text>
                          </View>
                        );
                      })()}
                    <TouchableOpacity onPress={() => openEdit("priority")} style={{ padding: 6 }}>
                      <MaterialCommunityIcons name="pencil-outline" size={14} color="#666" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Department (moved after prio) */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 30 }}>
                  <Text style={{ width: 80, fontSize: 12, color: "#7D7A92", textAlign: "right" }}>Department</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: "#2E2C34" }}>{currentTicket?.department ?? demoTicketDepartment ?? "General support"}</Text>
                    <TouchableOpacity onPress={() => openEdit("department")} style={{ padding: 6 }}>
                      <MaterialCommunityIcons name="pencil-outline" size={14} color="#666" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Assigned row */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ width: 80, fontSize: 12, color: "#7D7A92", textAlign: "right" }}>Assigned</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: "#2E2C34" }}>{(currentTicket as any)?.assigned_to ?? demoTicketAssigned ?? (demoTicket as any)?.assigned_to ?? "Michael Fischer"}</Text>
                    <TouchableOpacity onPress={() => openEdit("assigned")} style={{ padding: 6 }}>
                      <MaterialCommunityIcons name="pencil-outline" size={14} color="#666" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </View>
        
        {showMiddleSection && (<> 
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
              onFocus={() => { if (ignoreFocusRef.current) { ignoreFocusRef.current = false; return; } openComposeModal(`RE: ${demoTicket.Subject}`, "demo"); }}
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
              // run sparkAI analysis for this ticket but DON'T switch the UI focus (won't change department/current ticket)
              handleSendToLLM("Ticket#20200521-5022024", { focus: false });
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
        {hasStartedSpark && (
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 20, marginTop: 32 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 32 }}>
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
                  paddingVertical: 10,
                  borderRadius: 20,
                  backgroundColor: showRightBadges ? priorityBadgeColor : "#E5E7EB",
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: "bold", color: showRightBadges ? (priorityFromEndpoint ? "white" : "#666") : "#333" }}>
                  {showRightBadges ? priorityTextUpper || "--" : "--"}
                </Text>
                {/* priority edit removed for inline badges */}
                {showRightBadges && showPriorityConfidence ? (
                  <Text style={{ fontSize: 10, color: "white" }}>
                    ({Math.round((priorityConfidence ?? 0) * 100)}%)
                  </Text>
                ) : null}
              </View>
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 32, marginLeft: 44 }}>
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
                  paddingVertical: 10,
                  borderRadius: 20,
                  backgroundColor: showRightBadges ? "#F3F4F6" : "#E5E7EB",
                }}
              >
                <Text style={{ fontSize: 12, color: "#333" }}>
                  {showRightBadges
                    ? (analysisTicket?.department ?? currentTicket?.department ?? demoTicketDepartment ?? "Unbekannt")
                    : "--"}
                </Text>
                {/* inline department edit icon removed per UX request (keeps fullscreen/modal editor intact) */}
              </View>
            </View>
          </View>)}
        
        {hasStartedSpark && (
        <View
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
                minHeight: 230,
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
        </View>)}
        {hasStartedSpark && (
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
                onFocus={() => {
                  // Do not open compose modal when clicking this follow-up input.
                  if (ignoreFocusRef.current) {
                    ignoreFocusRef.current = false;
                    return;
                  }
                  // keep focus but intentionally don't trigger compose modal
                }}
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
        </View>)}
        </>)}
        
          {/* TicketList ganz unten anzeigen */}
          <TicketList />
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
            
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 20, marginTop: 32, paddingHorizontal: 10,marginLeft: -50 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 32 }}>
                <View style={{ width: 80, height: 15 }}>
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
                      x="100%"
                      textAnchor="end"
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
                    paddingVertical: 10,
                    borderRadius: 20,
                    backgroundColor: showRightBadges ? priorityBadgeColor : "#E5E7EB",
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "bold", color: showRightBadges ? (priorityFromEndpoint ? "white" : "#666") : "#333" }}>
                    {showRightBadges ? priorityTextUpper || "--" : "--"}
                  </Text>
                  {showRightBadges && showPriorityConfidence ? (
                    <Text style={{ fontSize: 10, color: "white" }}>
                      ({Math.round((priorityConfidence ?? 0) * 100)}%)
                    </Text>
                  ) : null}
                </View>
              </View>

              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 32, marginLeft: 0 }}>
                <View style={{ width: 80, height: 15 }}>
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
                      x="100%"
                      textAnchor="end"
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
                    {showRightBadges
                      ? (analysisTicket?.department ?? currentTicket?.department ?? demoTicketDepartment ?? "Unbekannt")
                      : "--"}
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

      {/* Edit modal for Status / Priority / Department */}
      <Modal
        visible={editModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={cancelEdit}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 24 }}>
          <View style={{ backgroundColor: "white", borderRadius: 8, padding: 18, maxWidth: 720, width: "100%", alignSelf: "center" }}>
            <Text style={{ fontSize: 16, fontWeight: "700", marginBottom: 12 }}>{editField ? `Edit ${editField.charAt(0).toUpperCase() + editField.slice(1)}` : "Edit"}</Text>

            {editField === "status" ? (
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
                {[["Open","#5B60FF"],["In Progress","#D1D5DB"],["Closed","#CFF5D1"]].map(([val,color]) => (
                  <TouchableOpacity key={String(val)} onPress={() => setEditDraftValue(String(val))} style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 6, backgroundColor: editDraftValue === val ? String(color) : "#F3F4F6", borderWidth: editDraftValue === val ? 0 : 1, borderColor: "#E5E7EB" }}>
                    <Text style={{ color: editDraftValue === val ? (val === "In Progress" ? "#666" : val === "Closed" ? "#166534" : "white") : "#333", fontWeight: editDraftValue === val ? "700" : "600" }}>{String(val)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : editField === "priority" ? (
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
                {[["Critical","#C21B1B"],["High","#FF6C6C"],["Medium","#E8B931"],["Low","#53A668"]].map(([val,color]) => (
                  <TouchableOpacity key={String(val)} onPress={() => setEditDraftValue(String(val))} style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 6, backgroundColor: editDraftValue === val ? String(color) : "#F3F4F6", borderWidth: editDraftValue === val ? 0 : 1, borderColor: "#E5E7EB" }}>
                    <Text style={{ color: editDraftValue === val ? "white" : "#333", fontWeight: editDraftValue === val ? "700" : "600" }}>{String(val)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : editField === "department" ? (
              <View style={{ marginBottom: 12 }}>
                {/* Department dropdown — show two choices for demo */}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {['Hardware Support', 'IT Development'].map((name) => {
                    const selected = editDraftValue === name;
                    return (
                      <TouchableOpacity
                        key={name}
                        onPress={() => setEditDraftValue(name)}
                        style={{
                          paddingVertical: 10,
                          paddingHorizontal: 14,
                          borderRadius: 6,
                          backgroundColor: selected ? '#5B60FF' : '#F3F4F6',
                          borderWidth: selected ? 0 : 1,
                          borderColor: '#E5E7EB',
                        }}
                      >
                        <Text style={{ color: selected ? 'white' : '#333', fontWeight: selected ? '700' : '600' }}>{name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ) : editField === "assigned" ? (
              <View style={{ marginBottom: 12 }}>
                {/* Assigned dropdown — show two choices for demo */}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {['Sam Singh', 'Roland Fischer'].map((name) => {
                    const selected = editDraftValue === name;
                    return (
                      <TouchableOpacity
                        key={name}
                        onPress={() => setEditDraftValue(name)}
                        style={{
                          paddingVertical: 10,
                          paddingHorizontal: 14,
                          borderRadius: 6,
                          backgroundColor: selected ? '#5B60FF' : '#F3F4F6',
                          borderWidth: selected ? 0 : 1,
                          borderColor: '#E5E7EB',
                        }}
                      >
                        <Text style={{ color: selected ? 'white' : '#333', fontWeight: selected ? '700' : '600' }}>{name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ) : (
              <View style={{ marginBottom: 12 }}>
                <TextInput value={editDraftValue} onChangeText={setEditDraftValue} placeholder="Value" style={{ borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8 }} />
              </View>
            )}

            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 12, marginTop: 6 }}>
              <TouchableOpacity onPress={cancelEdit} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: "#E5E7EB" }}>
                <Text>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveEdit} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6, backgroundColor: "#2F80ED" }}>
                <Text style={{ color: "white", fontWeight: "600" }}>Speichern</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Compose modal - opens when clicking the "Type your response here" inputs */}
      <Modal
        visible={showComposeModal}
        animationType="fade"
        transparent={true}
        onRequestClose={closeComposeModal}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 24 }}>
          <View style={{ backgroundColor: "white", borderRadius: 8, padding: 18, maxHeight: "90%" }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
                {/* Ticket number on the left */}
                <Text style={{ fontWeight: "700", fontSize: 16 }}>{currentTicket?.id ?? demoTicket["Case Number"]}</Text>
                <View style={{ width: 12 }} />
                {/* Prio */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={{ width: 80, height: 16 }}>
                    <Svg width="100%" height="100%">
                      <SvgText fill="#6f6f6fff" fontSize="13" x="100%" textAnchor="end" y="12">Priority:</SvgText>
                    </Svg>
                  </View>

                  {(() => {
                    // Prefer demo target when composing from demo input. Otherwise prefer analysisTicket (if present), then current ticket.
                    // Prefer the model prediction if available (predictedPriority), otherwise fall back
                    // - if composing to demo: prefer predictedPriority then demoTicketPriority
                    // - otherwise prefer predictedPriority then analyzed/current ticket then demo fallback
                    const headerPrioRaw = predictedPriority || (composeTarget === "demo"
                      ? (demoTicketPriority || "")
                      : ((analysisTicket?.priority as string) ?? (currentTicket?.priority as string) ?? demoTicketPriority ?? ""));
                    const headerPrioLabel = normalizePriorityLabel(String(headerPrioRaw || "")).trim();
                    // match the start-screen badge color for High (line ~66) which uses #FF6C6C
                    const headerPrioColor = headerPrioLabel
                      ? headerPrioLabel.toLowerCase().includes("high")
                        ? "#FF6C6C"
                        : getPriorityColor(headerPrioLabel)
                      : "#E5E7EB";
                    const showPrio = Boolean(headerPrioLabel);

                    // Render the priority pill to match the demo card style: pale background with colored text
                    return (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        {(function () {
                          const p = String(headerPrioLabel || "").toLowerCase();
                          const textColor = getPriorityColor(headerPrioLabel);
                          const bg = p.includes("critical") || p.includes("high")
                            ? "#FFEAEA"
                            : p.includes("medium")
                            ? "#FFF7D6"
                            : p.includes("low")
                            ? "#E8F7EE"
                            : "#E5E7EB";

                          const show = Boolean(headerPrioLabel);

                          return (
                            <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: show ? bg : "#E5E7EB" }}>
                              <Text style={{ color: show ? textColor : "#666", fontWeight: "700", fontSize: 12 }}>{show ? headerPrioLabel : "--"}</Text>
                            </View>
                          );
                        })()}

                        <TouchableOpacity onPress={() => openEdit("priority")} style={{ padding: 6 }}>
                          <MaterialCommunityIcons name="pencil-outline" size={12} color="#666" />
                        </TouchableOpacity>
                      </View>
                    );
                  })()}

                </View>

                {/* Abteilung */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={{ width: 80, height: 16,marginLeft:20 }}>
                    <Svg width="100%" height="100%">
                      <SvgText fill="#6f6f6fff" fontSize="13" x="100%" textAnchor="end" y="12">Department:</SvgText>
                    </Svg>
                  </View>

                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 }}>
                    {(function () {
                      const deptLabel = composeTarget === "demo"
                        ? (analysisTicket && llmResponse && !loading
                            ? (analysisTicket?.department ?? demoTicketDepartment)
                            : demoTicketDepartment)
                        : analysisTicket?.department ?? currentTicket?.department ?? (demoTicket as any)?.department ?? (demoTicket as any)?.product ?? "Unbekannt";

                      // Use a pale background + darker text so department looks like a pill similar to priority
                      return (
                        <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: showRightBadges ? "#F3F4F6" : "#E5E7EB" }}>
                          <Text style={{ fontSize: 12, color: "#2E2C34", fontWeight: "600" }}>{deptLabel}</Text>
                        </View>
                      );
                    })()}
                    
                    <TouchableOpacity onPress={() => openEdit("department")} style={{ padding: 6 }}>
                      <MaterialCommunityIcons name="pencil-outline" size={12} color="#666" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* small spacer is already above */}
              </View>

              <Text style={{ fontSize: 12, color: "#888" }}>{currentTicket?.creation ?? demoTicket.created}</Text>
            </View>

            <View style={{ marginBottom: 8 }}>
              <Text style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>An:</Text>
              <TextInput value={composeTo} onChangeText={setComposeTo} style={{ borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8 }} />
            </View>

            <View style={{ marginBottom: 8 }}>
              <Text style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>CC:</Text>
              <TextInput value={composeCc} onChangeText={setComposeCc} style={{ borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8 }} />
            </View>

            <View style={{ marginBottom: 10, flexDirection: "row", gap: 8, alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>Betreff:</Text>
                <TextInput value={composeSubject} onChangeText={setComposeSubject} style={{ borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8 }} />
              </View>
              <TouchableOpacity onPress={() => { insertLastSparkResponse(); }} style={{ marginLeft: 8 }}>
                <Image source={require("../assets/images/spark-logo.png")} style={{ width: 72, height: 36, marginTop: 20, resizeMode: "contain" }} />
              </TouchableOpacity>
            </View>

            <View style={{ marginBottom: 10 }}>
              <Text style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>Beschreibung</Text>

              {/* Put formatting toolbar inside the description field container */}
              <View style={{ borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 6, backgroundColor: "white" }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    paddingVertical: 6,
                    paddingHorizontal: 8,
                    borderBottomWidth: 1,
                    borderBottomColor: "#F3F4F6",
                    backgroundColor: "#FAFBFC",
                    borderTopLeftRadius: 6,
                    borderTopRightRadius: 6,
                  }}
                >
                  <MaterialCommunityIcons name="format-bold" size={18} color="#444" />
                  <MaterialCommunityIcons name="format-italic" size={18} color="#444" />
                  <MaterialCommunityIcons name="format-underline" size={18} color="#444" />
                  <MaterialCommunityIcons name="format-font" size={18} color="#444" />
                  <MaterialCommunityIcons name="format-size" size={18} color="#444" />
                  <MaterialCommunityIcons name="format-list-bulleted" size={18} color="#444" />
                  <MaterialCommunityIcons name="format-list-numbered" size={18} color="#444" />
                  <MaterialCommunityIcons name="format-indent-increase" size={18} color="#444" />
                  <MaterialCommunityIcons name="format-indent-decrease" size={18} color="#444" />
                  <MaterialCommunityIcons name="link-variant" size={18} color="#444" />
                  <MaterialCommunityIcons name="emoticon-outline" size={18} color="#444" />
                  <View style={{ flex: 1 }} />
                  <MaterialCommunityIcons name="undo" size={16} color="#888" />
                  <MaterialCommunityIcons name="redo" size={16} color="#888" />
                </View>

                <TextInput
                  value={composeBody}
                  onChangeText={setComposeBody}
                  multiline
                  style={{ minHeight: 180, padding: 12 }}
                />
              </View>
            </View>

            <View style={{ marginBottom: 10 }}>
              <Text style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>Anhänge:</Text>
              <View style={{ borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 6, padding: 10 }}>
                <Text style={{ color: "#888" }}>
                  Dateien <Text style={{ color: "#2F80ED" }}>durchsuchen</Text> oder hierher ziehen
                </Text>
              </View>
            </View>

            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>Anfragestatus aktualisieren zu:</Text>
              <View style={{ flexDirection: "row", gap: 8, alignItems: "center", position: "relative" }}>
                {/* Status pill (default Open) - click to open options */}
                <TouchableOpacity
                  onPress={() => setShowStatusDropdown((s) => !s)}
                  style={{
                    minWidth: 120,
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    // keep Open purple, In Progress should match TicketList gray, Closed stays green
                    backgroundColor: composeStatus === "Open" ? "#5B60FF" : composeStatus === "In Progress" ? "#D1D5DB" : "#CFF5D1",
                    borderRadius: 6,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: composeStatus === "In Progress" || composeStatus === "Closed" ? (composeStatus === "In Progress" || composeStatus === "Closed" ? 1 : 0) : 0,
                    borderColor: composeStatus === "In Progress" ? "#4F46E5" : composeStatus === "Closed" ? "#16A34A" : "transparent",
                    shadowColor: composeStatus === "In Progress" ? "#4F46E5" : composeStatus === "Closed" ? "#16A34A" : "transparent",
                    elevation: composeStatus === "In Progress" || composeStatus === "Closed" ? 2 : 0,
                  }}
                >
                  <Text style={{ color: composeStatus === "Open" ? "white" : composeStatus === "Closed" ? "#166534" : "#666", textAlign: "center", fontWeight: composeStatus === "Open" ? "700" : "600" }}>{composeStatus}</Text>
                </TouchableOpacity>

                {/* Dropdown - choose In Progress or Closed */}
                {showStatusDropdown ? (
                  <View style={{ position: "absolute", top: 48, left: 0, backgroundColor: "white", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 6, padding: 6, width: 160, zIndex: 40 }}> 
                    <TouchableOpacity
                      onPress={() => { setComposeStatus("In Progress"); setShowStatusDropdown(false); }}
                      style={{ paddingVertical: 10, paddingHorizontal: 8, borderRadius: 6, backgroundColor: composeStatus === "In Progress" ? "#D1D5DB" : "transparent", marginBottom: 6 }}
                    >
                      <Text style={{ color: composeStatus === "In Progress" ? "#666" : "#333", fontWeight: composeStatus === "In Progress" ? "700" : "600" }}>In Progress</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => { setComposeStatus("Closed"); setShowStatusDropdown(false); }}
                      style={{ paddingVertical: 10, paddingHorizontal: 8, borderRadius: 6, backgroundColor: composeStatus === "Closed" ? "#CFF5D1" : "transparent" }}
                    >
                      <Text style={{ color: composeStatus === "Closed" ? "#166534" : "#333", fontWeight: composeStatus === "Closed" ? "700" : "600" }}>Closed</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 12 }}>
              <TouchableOpacity onPress={() => { closeComposeModal(); }} style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 6, borderWidth: 1, borderColor: "#E5E7EB" }}>
                <Text>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={sendCompose} style={{ backgroundColor: "#2F80ED", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 6 }}>
                <Text style={{ color: "white", fontWeight: "600" }}>Senden</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Feedback modal that appears after sending a compose message */}
      <Modal
        visible={showFeedbackModal}
        animationType="fade"
        transparent={true}
        onRequestClose={closeFeedback}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: 'white', borderRadius: 8, padding: 26, alignItems: 'center', width: '92%', maxWidth: 920, alignSelf: 'center', minHeight: 520 }}>
            <Image source={require('../assets/images/spark-logo.png')} style={{ width: 150, height: 46, resizeMode: 'contain', marginBottom: 20 }} />

            <Text style={{ textAlign: 'center', color: '#333', fontSize: 17, marginBottom: 12 }}>
              Damit der SPARK künftig noch bessere Antworten liefern kann, nimm dir bitte ein paar
              Sekunden Zeit und gib kurz Feedback:
            </Text>

            <Text style={{ fontWeight: '700', color: '#9E2F5B', fontSize: 18, marginTop: 12, marginBottom: 50 }}>
              Wie hilfreich war die Antwort von SPARK?
            </Text>

            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 18 }}>
              {Array.from({ length: 10 }).map((_, idx) => {
                const val = idx + 1;
                const isSelected = feedbackRating === val;
                return (
                  <TouchableOpacity
                    key={val}
                    onPress={() => setFeedbackRating(val)}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      borderWidth: 1,
                      borderColor: isSelected ? '#9E2F5B' : '#E6E6E6',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: isSelected ? '#FFF1F6' : 'transparent',
                    }}
                  >
                    <Text style={{ color: isSelected ? '#9E2F5B' : '#9E2F5B', fontWeight: isSelected ? '700' : '500', fontSize: 13 }}>{val}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'center', width: '60%', alignSelf: 'center', paddingHorizontal: 12, marginBottom: 16, marginTop: 50 }}>
              <Text style={{ color: '#9E2F5B', fontSize: 13, marginRight: 10 }}>1 = Sehr schlecht</Text>
              <Text style={{ color: '#7C2F6B', fontSize: 13 }}>10 = Sehr hilfreich</Text>
            </View>

            {!feedbackSubmitted ? (
              feedbackRating ? (
                <TouchableOpacity onPress={() => submitFeedback()} style={{ paddingHorizontal: 36, paddingVertical: 12, borderRadius: 6, backgroundColor: '#9E2F5B' }}>
                  <Text style={{ fontSize: 16, color: 'white' }}>Senden</Text>
                </TouchableOpacity>
                ) : (
                <TouchableOpacity onPress={() => closeFeedback()} style={{ paddingHorizontal: 42, paddingVertical: 14, borderRadius: 6, borderWidth: 1, marginTop: 30, borderColor: '#E5E5E5' }}>
                  <Text style={{ fontSize: 16 }}>Überspringen</Text>
                </TouchableOpacity>
              )
            ) : (
              <View style={{ paddingVertical: 22 }}>
                <Text style={{ fontSize: 16, fontWeight: '600' }}>Danke für dein Feedback</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}
