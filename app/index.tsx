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
import { SparkAILogo } from "../components/SparkAILogo";
import SparkChatHome from "../components/SparkChatHome";
import TicketLanding from "../components/TicketLanding";
import TicketList from "../components/TicketList";
import Topbar from "../components/Topbar";
import UpgradePath from "../components/UpgradePath";
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

const demoTicketData = require("../assets/data/ticket_demo.json") as DemoTicket[];

export default function Index() {
  // Allow the demo data file to be an array — landing will allow picking which demo ticket is used.
  const [showLanding, setShowLanding] = useState(true);
  const [selectedDemoTicket, setSelectedDemoTicket] = useState<DemoTicket | null>(null);
  const [activeSidebarKey, setActiveSidebarKey] = useState<string>("tickets");

  const demoTicket: DemoTicket = (selectedDemoTicket ?? (Array.isArray(demoTicketData) && demoTicketData.length > 0 ? demoTicketData[0] : (demoTicketData as unknown as DemoTicket))) as DemoTicket;

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
  // Separate controllers for user-initiated calls vs lightweight/background demo calls.
  // This prevents background computations (demo-previews, on-demand hints) from
  // cancelling an active user-initiated Spark AI request.
  const sparkUserAbortControllerRef = useRef<AbortController | null>(null);
  const sparkBackgroundAbortControllerRef = useRef<AbortController | null>(null);

  const startSparkUserCall = () => {
    // abort any previous *user* call
    try {
      sparkUserAbortControllerRef.current?.abort();
    } catch (e) {
      // ignore
    }
    const c = new AbortController();
    sparkUserAbortControllerRef.current = c;
    return c.signal;
  };

  const startSparkBackgroundCall = () => {
    // abort any previous background call
    try {
      sparkBackgroundAbortControllerRef.current?.abort();
    } catch (e) {
      // ignore
    }
    const c = new AbortController();
    sparkBackgroundAbortControllerRef.current = c;
    return c.signal;
  };
  const { tickets, loading: ticketsLoading, getTicketById, error, updateTicket } = useTicketData();

  // local state for demo ticket card (so compose sends can update the demo display)
  const [demoTicketStatus, setDemoTicketStatus] = useState<string>(demoTicket.Status);
  const [demoTicketPriority, setDemoTicketPriority] = useState<string>(normalizePriorityLabel(demoTicket.Priority));
  // demo department — demo JSON doesn't include this so default to General support
  const [demoTicketDepartment, setDemoTicketDepartment] = useState<string>(
    (demoTicket as any)?.department ?? "General support"
  );
  // ref to keep the latest demoTicketDepartment accessible inside async closures
  const demoTicketDepartmentRef = useRef<string>((demoTicket as any)?.department ?? "General support");
  // demo assigned (demo JSON includes assigned_to) - default to Michael Fischer
  const [demoTicketAssigned, setDemoTicketAssigned] = useState<string>(
    (demoTicket as any)?.assigned_to ?? "Michael Fischer"
  );
  // tracks where the compose modal was opened for — 'demo' or a ticket id
  const [composeTarget, setComposeTarget] = useState<string | "demo" | null>(null);
  // controls whether the mid-page compose/LLM area is visible
  const [showMiddleSection, setShowMiddleSection] = useState<boolean>(true);

  // demo computed values (auto-calculated on mount)
  const [demoComputedPriority, setDemoComputedPriority] = useState<string>("");
  const [demoPriorityLoading, setDemoPriorityLoading] = useState(false);
  const [demoPriorityConfidence, setDemoPriorityConfidence] = useState<number | null>(null);
  const [demoDepartmentLoading, setDemoDepartmentLoading] = useState(false);

  useEffect(() => {
    demoTicketDepartmentRef.current = demoTicketDepartment;
  }, [demoTicketDepartment]);

  // helper that ensures a promise takes at least `minMs` milliseconds
  const ensureMinDuration = async <T,>(fn: Promise<T>, minMs = 2000): Promise<T> => {
    const start = Date.now();
    const result = await fn;
    const elapsed = Date.now() - start;
    if (elapsed < minMs) {
      await new Promise((r) => setTimeout(r, minMs - elapsed));
    }
    return result;
  };
  const [demoComputedDepartment, setDemoComputedDepartment] = useState<string>("");
  const [departmentBlinkFast, setDepartmentBlinkFast] = useState(false);

  // Handler for opening a demo ticket from the landing page
  const handleLandingSelect = (t: DemoTicket) => {
    // start fresh when selecting a demo ticket — clear any previous Spark/LLM state
    resetSparkState();
    setSelectedDemoTicket(t);
    setShowLanding(false);

    setDemoTicketStatus(t.Status ?? "Open");
    setDemoTicketPriority(normalizePriorityLabel(t.Priority ?? ""));
    setDemoTicketDepartment((t as any).department ?? "General support");
    setDemoTicketAssigned(t.assigned_to ?? "Michael Fischer");

    const id = (t["Case Number"] || "").toString().split("#")[1] || String(t["Case Number"] || "");
    setTicketId(id);
  };

  // blinking/control flags — when computed differs from demo defaults these toggle
  const [priorityShouldBlink, setPriorityShouldBlink] = useState(false);
  const [departmentShouldBlink, setDepartmentShouldBlink] = useState(false);
  const [showPriorityGradient, setShowPriorityGradient] = useState(false);
  const [showDepartmentGradient, setShowDepartmentGradient] = useState(false);

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

  // Compute demo ticket priority & department only when a demo ticket is selected
  useEffect(() => {
    if (!selectedDemoTicket) return; // don't run until a ticket is chosen
    let mounted = true;

    // clear previous computed values so the UI reflects the newly-selected ticket
    setDemoComputedPriority("");
    setDemoPriorityConfidence(null);
    setDemoComputedDepartment("");
    setPriorityShouldBlink(false);
    setDepartmentShouldBlink(false);
    setShowPriorityGradient(false);
    setShowDepartmentGradient(false);

    const computeDemo = async () => {
      const dt = selectedDemoTicket as DemoTicket;
      // Immediately set a deterministic recommendation for the demo ticket,
      // and make it blink faster to draw attention (user requested immediate Hardware Support suggestion).
      if (!demoComputedDepartment) {
        // Recommend "Hardware Support" deterministically for the demo ticket
        // — but wait a short moment so the recommendation doesn't appear
        // instantly (UX requested a small pause so it doesn't feel too fast).
        const initialDept = "Hardware Support";

        // show loading for the department while we intentionally delay
        setDemoDepartmentLoading(true);
        try {
          // ensure the 'recommendation' appears no faster than 2s
          await ensureMinDuration(Promise.resolve(initialDept), 1000);

          // guard against unmounted component
          if (!mounted) return;

          setDemoComputedDepartment(initialDept);

          if (
            initialDept &&
            String(initialDept).trim().toLowerCase() !== String(demoTicketDepartmentRef.current).trim().toLowerCase()
          ) {
            setDepartmentShouldBlink(true);
            setDepartmentBlinkFast(true);
          } else {
            // if the demo already matches the recommendation, ensure we don't
            // blink (prevents the label from toggling color later)
            setDepartmentShouldBlink(false);
            setDepartmentBlinkFast(false);
          }
        } finally {
          setDemoDepartmentLoading(false);
        }
      }
      try {
        // priority
        const payload = {
          "Case Description": dt["Case Description"],
          Product: dt.Subject || "Unbekannt",
          "Support Type": "Technical Support",
          Status: dt.Status || "Open",
          // include other demo fields so the model receives the full ticket context
          "Case Number": dt["Case Number"],
          Subject: dt.Subject,
          created: dt.created,
          assigned_to: dt.assigned_to,
          Priority: dt.Priority,
          department: (dt as any)?.department ?? demoTicketDepartment,
        };

          const pr = await ensureMinDuration(
            predictPriority({
              ...payload,
              // include demo metadata explicitly for clarity
              "Case Number": dt["Case Number"],
              Subject: dt.Subject,
              created: dt.created,
              assigned_to: dt.assigned_to,
              Priority: dt.Priority,
              department: (dt as any)?.department ?? demoTicketDepartment,
            }).catch((e) => {
            console.warn("demo priority error", e);
            return { priority: "", confidence: null } as any;
          }),
          2000
        );

        const normalizedDemoPr = normalizePriorityLabel(String(pr?.priority || "")).trim();
        if (!mounted) return;
        setDemoComputedPriority(normalizedDemoPr || "");
        setDemoPriorityConfidence(typeof pr?.confidence === "number" ? pr.confidence : null);
        if (normalizedDemoPr && normalizedDemoPr !== demoTicketPriority) {
          setPriorityShouldBlink(true);
        }

        // department — ask SparkAI for a suggested department for the demo ticket
        const ticketContext = buildTicketContext(undefined, dt["Case Description"]);
        try {
          const session = await getSessionId();
          const aiSignal = startSparkBackgroundCall();
          try {
            const aiResponse = await ensureMinDuration(
              callSparkAI(buildInitialPrompt(ticketContext), session, [], aiSignal),
              1000
            );

            let suggestedDept = "";
            // Per request: always recommend "Hardware Support" for demo department
            if (aiResponse) {
              suggestedDept = "Hardware Support";
            }

            if (mounted) {
              const finalDept = suggestedDept || "Hardware Support";
              setDemoComputedDepartment(finalDept);
              if (
                finalDept &&
                String(finalDept).trim().toLowerCase() !== String(demoTicketDepartmentRef.current).trim().toLowerCase()
              ) {
                setDepartmentShouldBlink(true);
              }
              setAnalysisTicket((prev: any) => ({ ...(prev ?? {}), id: dt["Case Number"], department: finalDept || prev?.department }));
            }
          } catch (err: any) {
            // If the request was aborted because a new call started, ignore silently
            if (err?.name === "AbortError") return;
            console.warn("demo department analysis failed", err);
          }
        } catch (err) {
          console.warn("demo department analysis failed", err);
        }
      } catch (e) {
        console.warn("demo compute error", e);
      }
    };

    computeDemo();

    return () => {
      mounted = false;
    };
  }, [selectedDemoTicket]);

  // Blink toggles for priority — respect departmentBlinkFast so both priority
  // and department blink at the same rate when department is set to fast.
  useEffect(() => {
    if (!priorityShouldBlink) {
      setShowPriorityGradient(false);
      return;
    }

    const intervalMs = departmentBlinkFast ? 350 : 700;
    const id = setInterval(() => setShowPriorityGradient((s) => !s), intervalMs);
    return () => clearInterval(id);
  }, [priorityShouldBlink, departmentBlinkFast]);

  // Blink toggles for department
  useEffect(() => {
    // Do not start or continue blinking when the current demo department
    // already equals SparkAI's recommendation -- this prevents accidental
    // re-enabling from async flows or stale closures.
    const deptMatches =
      demoComputedDepartment &&
      demoTicketDepartmentRef.current &&
      String(demoComputedDepartment).trim().toLowerCase() === String(demoTicketDepartmentRef.current).trim().toLowerCase();

    if (!departmentShouldBlink || deptMatches) {
      setShowDepartmentGradient(false);
      return;
    }

    const intervalMs = departmentBlinkFast ? 350 : 700;
    const id = setInterval(() => setShowDepartmentGradient((s) => !s), intervalMs);
    return () => clearInterval(id);
  }, [departmentShouldBlink, departmentBlinkFast, demoComputedDepartment]);

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

  // Reset Spark/LLM related UI and conversation state so the app returns to
  // a clean initial state when switching tickets or returning to the Tickets
  // landing screen.
  const resetSparkState = () => {
    // cancel any in-progress Spark requests (both user & background)
    try {
      sparkUserAbortControllerRef.current?.abort();
    } catch (e) {}
    try {
      sparkBackgroundAbortControllerRef.current?.abort();
    } catch (e) {}
    sparkUserAbortControllerRef.current = null;
    sparkBackgroundAbortControllerRef.current = null;
    setLlmResponse("");
    setUserResponse("");
    setSendingUserResponse(false);
    setHasSentInitialPrompt(false);
    conversationHistoryRef.current = [];
    setMessages([]);
    setLoading(false);
    setShowPriority(false);
    setPredictedPriority("");
    setPriorityConfidence(null);
    setPriorityLoading(false);
    setAnalysisTicket(null);
    setHasStartedSpark(false);
  };

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
          // If still not found, check whether the requested id matches the demo ticket
          // Only allow demo fallback when the user explicitly selected a demo ticket
          const demoCaseNumberRaw = String((selectedDemoTicket as any)?.["Case Number"] || "").replace(/^(Ticket)?#?/i, "").trim();
          if (!t && selectedDemoTicket && cleanId === demoCaseNumberRaw) {
            // construct a minimal ticket object for analysis using the selected demo ticket
            t = {
              id: demoCaseNumberRaw,
              description: String((selectedDemoTicket as any)["Case Description"] || ""),
              subject: String((selectedDemoTicket as any).Subject || ""),
            } as any;
          }
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
        // Build payload from the currently-analyzed ticket. If the analyzed
        // ticket is the selected demo ticket, use the selected demo payload;
        // otherwise use the activeTicket (database) fields.
        const specificCleanForDemo = specificId ? String(specificId).replace(/^(Ticket)?#?/i, "").trim() : undefined;
        const activeTicketIdClean = String(activeTicket.id || "").replace(/^(Ticket)?#?/i, "").trim();
        const demoCaseNumberRaw = String((selectedDemoTicket as any)?.["Case Number"] || "").replace(/^(Ticket)?#?/i, "").trim();
        const isDemoAnalyzed = selectedDemoTicket && ((specificCleanForDemo && specificCleanForDemo === demoCaseNumberRaw) || activeTicketIdClean === demoCaseNumberRaw);

        const payload = isDemoAnalyzed && selectedDemoTicket
          ? {
              "Case Description": (selectedDemoTicket as any)["Case Description"],
              Product: (selectedDemoTicket as any).Subject || "Unbekannt",
              "Support Type": "Technical Support",
              Status: (selectedDemoTicket as any).Status || "Open",
              "Case Number": (selectedDemoTicket as any)["Case Number"],
              Subject: (selectedDemoTicket as any).Subject,
              created: (selectedDemoTicket as any).created,
              assigned_to: (selectedDemoTicket as any).assigned_to,
              Priority: (selectedDemoTicket as any).Priority,
              department: (selectedDemoTicket as any)?.department ?? demoTicketDepartment,
            }
          : {
              "Case Description": activeTicket.description || "",
              Product: (activeTicket as any).product || "Unbekannt",
              "Support Type": "Technical Support",
              Status: activeTicket.status || "Open",
              "Case Number": activeTicket.id || "",
              Subject: activeTicket.subject || "",
              created: (activeTicket as any).creation || "",
              assigned_to: (activeTicket as any).assigned_to || "",
              Priority: (activeTicket as any).priority || "",
              department: (activeTicket as any).department || "",
            };
        ;

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
      const signal = startSparkUserCall();
      let response: string;
      try {
        response = await callSparkAI(messageForSpark, sessionForCall, [...conversationHistoryRef.current], signal);
      } catch (err: any) {
        // If the request was aborted because a newer Spark call started, ignore
        if (err?.name === "AbortError") {
          console.log("Spark call aborted (handleSendToLLM)");
          return;
        }
        throw err;
      }
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

  // Helper: send exact ticket info to the priority endpoint and log request/response.
  // Useful for ensuring the endpoint gets the precise ticket data (e.g. ticket 20200521-5022024).
  const sendTicketToPriority = async (ticketId: string) => {
    try {
      const cleaned = ticketId.replace(/^(Ticket)?#?/i, "");
      let t = getTicketById(cleaned);

      // If ticket not found in DB, allow calling the priority endpoint for
      // the demo ticket case number by using the demo payload (we still log a message).
      if (!t) {
        const demoCaseNumberRaw = String((selectedDemoTicket as any)?.["Case Number"] || "").replace(/^(Ticket)?#?/i, "").trim();
        if (!selectedDemoTicket || String(cleaned).trim() !== String(demoCaseNumberRaw).trim()) {
          throw new Error(`Ticket ${ticketId} nicht gefunden`);
        } else {
          // demo ticket is explicitly selected — use that payload
          console.log("sendTicketToPriority: using selected demo payload for", demoCaseNumberRaw);
        }
      }

      // The endpoint should be called with the demo ticket info shown at app load
      // to guarantee consistent predictions. Use the demo ticket payload here.
      const payload = {
        "Case Description": demoTicket["Case Description"],
        Product: demoTicket.Subject || "Unbekannt",
        "Support Type": "Technical Support",
        Status: demoTicket.Status || "Open",
        "Case Number": demoTicket["Case Number"],
        Subject: demoTicket.Subject,
        created: demoTicket.created,
        assigned_to: demoTicket.assigned_to,
        Priority: demoTicket.Priority,
        department: (demoTicket as any)?.department ?? demoTicketDepartment,
      } as const;

      // If ticket not found in DB but selectedDemoTicket exists, substitute the payload
      const sendPayload = !t && selectedDemoTicket ? {
        "Case Description": (selectedDemoTicket as any)["Case Description"],
        Product: (selectedDemoTicket as any).Subject || "Unbekannt",
        "Support Type": "Technical Support",
        Status: (selectedDemoTicket as any).Status || "Open",
        "Case Number": (selectedDemoTicket as any)["Case Number"],
        Subject: (selectedDemoTicket as any).Subject,
        created: (selectedDemoTicket as any).created,
        assigned_to: (selectedDemoTicket as any).assigned_to,
        Priority: (selectedDemoTicket as any).Priority,
        department: (selectedDemoTicket as any)?.department ?? demoTicketDepartment,
      } : payload;

      console.log("[Priority] Sending payload:", sendPayload);

      const start = Date.now();
      const result = await predictPriority(sendPayload as any).catch((e) => {
        console.warn("Priority call failed", e);
        throw e;
      });
      const elapsed = Date.now() - start;
      console.log(`[Priority] Response (in ${elapsed}ms):`, result);

      // update UI state with the returned prediction/confidence
      const normalized = normalizePriorityLabel(String(result.priority || ""));
      setPredictedPriority(normalized);
      setPriorityConfidence(typeof result.confidence === "number" ? result.confidence : null);
      // If not found in the DB, we still want to show priority information
      // because we're sending the demo payload.
      setShowPriority(Boolean(t) || true);

      return result;
    } catch (err) {
      console.warn("sendTicketToPriority error", err);
      throw err;
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
      // Ensure any previous Spark call is cancelled when we start a new user query
      const signal = startSparkUserCall();
      // Sende nur die User-Nachricht und die History an SparkAI, kein Priority-Endpoint!
      let response: string;
      try {
        response = await callSparkAI(
          trimmedResponse,
          sessionForCall,
          conversationHistoryRef.current.filter((m) => m.content !== "__LOADING__"),
          signal
        );
      } catch (err: any) {
        if (err?.name === "AbortError") {
          // Request was cancelled due to a new Spark call; remove the loading marker and return.
          conversationHistoryRef.current = conversationHistoryRef.current.filter((m) => m.content !== "__LOADING__");
          setMessages([...conversationHistoryRef.current]);
          return;
        }
        throw err;
      }
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

      // For demo compose we want to respect exactly what the compose header
      // displayed (demoTicketPriority) rather than using predictions or the
      // heuristic. Compute a demo-specific normalized priority to use if
      // composeTarget === 'demo'.
      const normalizedPriorityForDemo = normalizePriorityLabel(String(demoTicketPriority || normalizedPriority));

      // Decide which target to update: explicit composeTarget if provided, otherwise prefer currentTicket
      if (composeTarget === "demo") {
        // Update demo card both status, priority and adopt the department currently shown in the compose header
        setDemoTicketStatus("Closed");
        // apply the priority visible in the compose header (demo ticket's priority)
        setDemoTicketPriority(normalizedPriorityForDemo);
        // choose the department displayed in the compose header — for demo compose
        // always use what the compose header shows (demoTicketDepartment). This
        // prevents Spark's analysis (which may set analysisTicket.department to
        // 'Hardware Support') from overwriting what the user sees and expects.
        const deptToApply = demoTicketDepartment ?? (demoTicket as any)?.department ?? "General support";
        setDemoTicketDepartment(String(deptToApply));
        // stop blinking once demo is updated via compose send
        setPriorityShouldBlink(false);
        setShowPriorityGradient(false);
        setDepartmentShouldBlink(false);
        setShowDepartmentGradient(false);
        // also clear the fast-blink flag so the department stops the fast interval
        setDepartmentBlinkFast(false);
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
      setDemoTicketPriority(composeTarget === "demo" ? normalizedPriorityForDemo : normalizedPriority);
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
      setEditDraftValue(selectedDemoTicket ? String((selectedDemoTicket as any)["Status"] ?? "") : demoTicketStatus);
    } else if (field === "priority") {
      setEditDraftValue(selectedDemoTicket ? String((selectedDemoTicket as any)["Priority"] ?? "") : demoTicketPriority);
    } else if (field === "department") {
      setEditDraftValue(selectedDemoTicket ? String((selectedDemoTicket as any)["department"] ?? "") : demoTicketDepartment);
    } else if (field === "assigned") {
      setEditDraftValue(selectedDemoTicket ? String((selectedDemoTicket as any)["assigned_to"] ?? "") : demoTicketAssigned);
    } else {
      setEditDraftValue("");
    }
    setEditModalVisible(true);

    // If opening the priority editor for the demo ticket and we don't yet have
    // a computed recommendation, request it on demand so the modal shows useful info.
    // Only allow on-demand demo calculations if a demo ticket was explicitly selected.
    if (field === "priority" && !currentTicket && selectedDemoTicket && !demoComputedPriority && !demoPriorityLoading) {
      setDemoPriorityLoading(true);
      (async () => {
        try {
          const dt = selectedDemoTicket as DemoTicket;

          const payload = {
            "Case Description": dt["Case Description"],
            Product: dt.Subject || "Unbekannt",
            "Support Type": "Technical Support",
            Status: dt.Status || "Open",
          };

          const pr = await ensureMinDuration(
            predictPriority({
              ...payload,
              // include demo metadata when doing on-demand demo compute
              "Case Number": dt["Case Number"],
              Subject: dt.Subject,
              created: dt.created,
              assigned_to: dt.assigned_to,
              Priority: dt.Priority,
              department: (dt as any)?.department ?? demoTicketDepartment,
            }).catch((e) => {
              console.warn("on-demand demo priority error", e);
              return { priority: "", confidence: null } as any;
            }),
            2000
          );

          const normalizedDemoPr = normalizePriorityLabel(String(pr?.priority || "")).trim();
          setDemoPriorityConfidence(typeof pr?.confidence === "number" ? pr.confidence : null);
          setDemoComputedPriority(normalizedDemoPr || "");
          if (normalizedDemoPr && normalizedDemoPr !== demoTicketPriority) {
            setPriorityShouldBlink(true);
          }
        } catch (err) {
          console.warn("on-demand demo priority failed", err);
        } finally {
          setDemoPriorityLoading(false);
        }
      })();
    }
    // If opening the department editor for the demo ticket and we don't yet have
    // a computed recommendation, request it on demand so the modal shows useful info.
    // require the demo to be explicitly selected before asking SparkAI on demand
    if (field === "department" && !currentTicket && selectedDemoTicket && !demoComputedDepartment && !demoDepartmentLoading) {
      setDemoDepartmentLoading(true);
      (async () => {
        try {
          const dt = selectedDemoTicket as DemoTicket;
          const ticketContext = buildTicketContext(undefined, dt["Case Description"]);
          const session = await getSessionId();
          const signal = startSparkBackgroundCall();
          try {
            const aiResponse = await ensureMinDuration(callSparkAI(buildInitialPrompt(ticketContext), session, [], signal), 1000);

            // Per request: always recommend "Hardware Support" for demo department when asked on demand
            const finalDept = "Hardware Support";
            setDemoComputedDepartment(finalDept);
            if (
              finalDept &&
              String(finalDept).trim().toLowerCase() !== String(demoTicketDepartmentRef.current).trim().toLowerCase()
            ) {
              setDepartmentShouldBlink(true);
            }
          } catch (err: any) {
            if (err?.name === "AbortError") {
              // aborted by a newer Spark call, ignore
              return;
            }
            console.warn("on-demand demo department failed", err);
          }
        } catch (err) {
          console.warn("on-demand demo department failed", err);
        } finally {
          setDemoDepartmentLoading(false);
        }
      })();
    }
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
        if (editField === "priority") {
          setDemoTicketPriority(normalized || demoTicketPriority);
          // user saved priority -> stop blinking
          setPriorityShouldBlink(false);
          setShowPriorityGradient(false);
        }
        if (editField === "department") {
          setDemoTicketDepartment(normalized || demoTicketDepartment);
          // Per request: when the demo ticket's department changes, reset Assigned to "Unbekannt"
          setDemoTicketAssigned("Unbekannt");
          // user saved department -> stop blinking
          setDepartmentShouldBlink(false);
          setShowDepartmentGradient(false);
          // also clear the fast blink flag if it was set
          setDepartmentBlinkFast(false);
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

  // helper booleans — true when the demo's shown value already equals Spark's recommendation
  const demoPriorityMatchesRecommendation = Boolean(
    // match if demo computed recommendation equals current demo value
    (demoComputedPriority && demoTicketPriority && demoComputedPriority.trim().toLowerCase() === demoTicketPriority.trim().toLowerCase())
    // OR if the endpoint's latest predictedPriority equals the demo value
    || (predictedPriority && demoTicketPriority && predictedPriority.trim().toLowerCase() === demoTicketPriority.trim().toLowerCase())
  );

  const demoDepartmentMatchesRecommendation = Boolean(
    demoComputedDepartment && demoTicketDepartment && demoComputedDepartment.trim().toLowerCase() === demoTicketDepartment.trim().toLowerCase()
  );

  // Only show the SparkAI logo next to labels once we have a finished
  // recommendation for that field. This prevents the logo from appearing
  // while async calculations are still running.
  const priorityHasRecommendation = Boolean(
    (demoComputedPriority && !demoPriorityLoading) || (predictedPriority && !priorityLoading)
  );

  const departmentHasRecommendation = Boolean(demoComputedDepartment && !demoDepartmentLoading);

  // Defensive: ensure blinking is disabled any time the shown demo department
  // already matches SparkAI's recommendation. This prevents any asynchronous
  // updates elsewhere from accidentally re-enabling the blink after a match.
  useEffect(() => {
    if (demoDepartmentMatchesRecommendation) {
      setDepartmentShouldBlink(false);
      setShowDepartmentGradient(false);
      setDepartmentBlinkFast(false);
    }
  }, [demoDepartmentMatchesRecommendation]);

  return (
    <View style={{ flex: 1, backgroundColor: "white" }}>
      <View style={{ 
        flex: 1, 
        flexDirection: "row", 
        backgroundColor: "white"
      }}>
        <Sidebar
          activeKey={activeSidebarKey}
          onSelect={(key) => {
            setActiveSidebarKey(key);
            if (key === "tickets") {
              // always open the landing ticket list when 'Tickets' is clicked
              setShowLanding(true);
              setSelectedDemoTicket(null);
              // clear any previously-run Spark analysis so Tickets returns to initial screen
              resetSparkState();
            }
            if (key === "sparkChat") {
              // show the Spark Chat area
              setShowLanding(false);
            }
          }}
        />
        <View style={{ flex: 1, backgroundColor: activeSidebarKey === "sparkChat" ? "#F9F9FB" : "#F9F9FB" }}>
          {activeSidebarKey !== "sparkChat" && <Topbar userName="Sam Singh" />}
          {activeSidebarKey === "sparkChat" ? (
            <SparkChatHome userName="Sam" />
          ) : activeSidebarKey === "officials" ? (
            <View style={{ padding: 32 }}>
              <UpgradePath onChange={(from, to, addon) => console.log("upgrade-path", { from, to, addon })} />
            </View>
          ) : showLanding ? (
            <TicketLanding onSelect={handleLandingSelect} />
          ) : (
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
            position: 'relative',
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

              {/* empty space reserved where the logo would have been — logo is positioned fixed at bottom-left */}
              <View style={{ height: 56 }} />
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
                  <View style={{ width: 80, alignItems: 'flex-end' }}>
                    {/* hide the logo entirely if the current priority already matches Spark's recommendation */}
                    {priorityShouldBlink && showPriorityGradient ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                        {(function () {
                          // Only render the logo once we actually have a recommendation
                          // (either demo-computed or the endpoint result) and when the
                          // current value doesn't already match it.
                          if (!priorityHasRecommendation || demoPriorityMatchesRecommendation) return null;
                          return (
                            <View style={{ opacity: 1, transform: [{ scale: 0.6 }], marginRight: -10 }}>
                              <SparkAILogo />
                            </View>
                          );
                        })()}
                        <Text style={{ fontSize: 12, fontWeight: "600", textAlign: "right", color: "#B93F4B" }}>Priority</Text>
                      </View>
                    ) : (
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                        {(function () {
                          if (!priorityHasRecommendation || demoPriorityMatchesRecommendation) return null;
                          return (
                            <View style={{ opacity: 0.18, transform: [{ scale: 0.6 }], marginRight: -10 }}>
                              <SparkAILogo />
                            </View>
                          );
                        })()}
                        <Text style={{ fontSize: 12, color: "#7D7A92", textAlign: "right" }}>Priority</Text>
                      </View>
                    )}
                  </View>
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
                  <View style={{ width: 80, alignItems: 'flex-end' }}>
                    {departmentShouldBlink && showDepartmentGradient ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                        {(function () {
                          if (!departmentHasRecommendation || demoDepartmentMatchesRecommendation) return null;
                          return (
                            <View style={{ opacity: 1, transform: [{ scale: 0.6 }], marginRight: -12 }}>
                              <SparkAILogo />
                            </View>
                          );
                        })()}
                        <Text style={{ fontSize: 12, fontWeight: "600", textAlign: "right", color: "#B93F4B" }}>Department</Text>
                      </View>
                    ) : (
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                        {(function () {
                          if (!departmentHasRecommendation || demoDepartmentMatchesRecommendation) return null;
                          return (
                            <View style={{ opacity: 0.18, transform: [{ scale: 0.6 }], marginRight: -12 }}>
                              <SparkAILogo />
                            </View>
                          );
                        })()}
                        <Text style={{ fontSize: 12, color: "#7D7A92", textAlign: "right" }}>Department</Text>
                      </View>
                    )}
                  </View>
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

            {/* Fixed bottom-left logo — absolute so it doesn't shift with text */}
            <View
              style={{
                position: "absolute",
                left: 4,
                bottom: 3,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
              }}
            >
              <Image source={require("../assets/images/SBB.png")} style={{ width: 40, height: 40, borderRadius: 20 }} />
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#727272" }}>SBB CFF FFS</Text>
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
            onPress={async () => {
              // run sparkAI analysis for this ticket but DON'T switch the UI focus (won't change department/current ticket)
              // Also explicitly send the exact ticket payload to the priority endpoint so we know exactly what it receives.
              // Ensure demo department recommendation is always Hardware Support when the
              // Spark AI button is clicked (per UX requirement). Update the computed
              // department and analysisTicket so inline badges reflect this.
              const forcedDept = "Hardware Support";
              // keep analysisTicket id updated so inline badges reflect which
              // ticket we're analyzing, but delay showing the department
              // recommendation itself so it doesn't appear instantly.
              // only allow demo-mode analysis when a demo ticket has been selected
              if (!selectedDemoTicket) {
                // nothing to do — there's no selected demo ticket to analyze
                alert("Bitte wählen Sie zuerst ein Demo-Ticket aus der Liste aus.");
                return;
              }
              setAnalysisTicket((prev: any) => ({ ...(prev ?? {}), id: selectedDemoTicket["Case Number"] }));

              // Start the external calls immediately so the backend work begins
              // right away — the UI will still intentionally delay showing the
              // recommendation label by 2s so it doesn't appear too fast.
              (async () => {
                try {
                  // determine the demo case number (clean form)
                  const demoCaseRaw = String((demoTicket as any)["Case Number"] || "").replace(/^(Ticket)?#?/i, "").trim();

                  // fire-and-forget the priority call — non-blocking
                  sendTicketToPriority(demoCaseRaw).catch((err) =>
                    console.warn("sendTicketToPriority failed", err)
                  );
                } catch (err) {
                  console.warn("sendTicketToPriority scheduling failed", err);
                }
              })();

              // Call Spark AI analysis immediately (keep focus=false so UI doesn't change)
              // tell the LLM to analyze the currently-displayed demo ticket
                // if a demo is selected, analyze it; otherwise, nothing
                if (!selectedDemoTicket) {
                  alert("Bitte wählen Sie zuerst ein Demo-Ticket aus der Liste aus.");
                } else {
                  const demoCaseForLLM = String((selectedDemoTicket as any)["Case Number"] || "").trim();
                  handleSendToLLM(demoCaseForLLM, { focus: false });
                }
              setHasStartedSpark(true);

              // Keep the UX delay for showing the computed department — we intentionally
              // don't toggle the global demoDepartmentLoading here so the SparkAI
              // logo remains visible while the backend work runs.
              (async () => {
                try {
                  await ensureMinDuration(Promise.resolve(forcedDept), 2000);

                  setDemoComputedDepartment(forcedDept);
                  // reveal the recommendation in the analysisTicket after the delay
                  setAnalysisTicket((prev: any) => ({ ...(prev ?? {}), department: forcedDept }));

                  if (
                    forcedDept &&
                    String(forcedDept).trim().toLowerCase() !== String(demoTicketDepartmentRef.current).trim().toLowerCase()
                  ) {
                    setDepartmentShouldBlink(true);
                    setDepartmentBlinkFast(true);
                  } else {
                    setDepartmentShouldBlink(false);
                    setDepartmentBlinkFast(false);
                  }
                } finally {
                  setDemoDepartmentLoading(false);
                }
              })();
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
        {/* Priority & Department inline badges removed per request (no longer needed). */}
        
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
                minHeight: 300,
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
          )}
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
            
            {/* Fullscreen Prio & Abteilung badges intentionally hidden per request */}
            
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
              <View>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
                {[["Critical","#C21B1B"],["High","#FF6C6C"],["Medium","#E8B931"],["Low","#53A668"]].map(([val,color]) => (
                  <TouchableOpacity key={String(val)} onPress={() => setEditDraftValue(String(val))} style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 6, backgroundColor: editDraftValue === val ? String(color) : "#F3F4F6", borderWidth: editDraftValue === val ? 0 : 1, borderColor: "#E5E7EB" }}>
                    <Text style={{ color: editDraftValue === val ? "white" : "#333", fontWeight: editDraftValue === val ? "700" : "600" }}>{String(val)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {/* If editing demo (no currentTicket) show either loading or recommendation */}
              {!currentTicket ? (
                demoPriorityLoading ? (
                  <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <ActivityIndicator color="#B93F4B" />
                    <Text style={{ fontSize: 12, color: '#666' }}>Berechnung läuft...</Text>
                  </View>
                ) : demoComputedPriority ? (
                  <View style={{ marginTop: 40 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                      <View style={{ opacity: 1, transform: [{ scale: 0.6 }], marginLeft: -18, marginRight: -18 }}>
                        <SparkAILogo />
                      </View>
                      <Text style={{ fontSize: 12, color: "#666" }}>empfiehlt:</Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                      <View style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: getPriorityColor(demoComputedPriority) === "#C21B1B" || demoComputedPriority.toLowerCase().includes("high") ? "#FFEAEA" : getPriorityColor(demoComputedPriority) === "#E8B931" ? "#FFF7D6" : getPriorityColor(demoComputedPriority) === "#53A668" ? "#E8F7EE" : "#E5E7EB" }}>
                        <Text style={{ color: getPriorityColor(demoComputedPriority), fontWeight: "700" }}>{demoComputedPriority || "--"}</Text>
                      </View>
                      {typeof demoPriorityConfidence === 'number' ? (
                        <Text style={{ fontSize: 10, color: '#666', alignSelf: 'center' }}>({Math.round((demoPriorityConfidence ?? 0) * 100)}%)</Text>
                      ) : null}
                      <TouchableOpacity
                        onPress={() => {
                          // accept recommendation into the edit draft and stop blinking
                          setEditDraftValue(demoComputedPriority);
                          setPriorityShouldBlink(false);
                          setShowPriorityGradient(false);
                          // also clear demo priority confidence highlight
                          setDemoPriorityConfidence(null);
                        }}
                        activeOpacity={0.9}
                      >
                        <LinearGradient
                          colors={["#B93F4B", "#451268"]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 6 }}
                        >
                          <Text style={{ color: 'white', fontWeight: '600' }}>Übernehmen</Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : null
              ) : null}
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
                {/* If editing demo (no currentTicket) show either loading or recommendation */}
                {!currentTicket ? (
                  demoDepartmentLoading ? (
                    <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <ActivityIndicator color="#B93F4B" />
                      <Text style={{ fontSize: 12, color: '#666' }}>Berechnung läuft...</Text>
                    </View>
                  ) : demoComputedDepartment ? (
                    <View style={{ marginTop: 40}}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <View style={{ opacity: 1, transform: [{ scale: 0.6 }], marginLeft: -18, marginRight: -18 }}>
                          <SparkAILogo/>
                        </View>
                        <Text style={{ fontSize: 12, color: "#666" }}>empfiehlt:</Text>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center',marginTop: 20 }}>
                        <View style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#F3F4F6' }}>
                          <Text style={{ color: '#2E2C34', fontWeight: '700' }}>{demoComputedDepartment || '--'}</Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => {
                            // accept recommendation into the edit draft and stop blinking
                            setEditDraftValue(demoComputedDepartment);
                            setDepartmentShouldBlink(false);
                            setShowDepartmentGradient(false);
                            // ensure fast blink is cleared when accepting
                            setDepartmentBlinkFast(false);
                          }}
                          activeOpacity={0.9}
                        >
                          <LinearGradient
                            colors={["#B93F4B", "#451268"]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 6 }}
                          >
                            <Text style={{ color: 'white', fontWeight: '600' }}>Übernehmen</Text>
                          </LinearGradient>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : null
                ) : null}
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
                {/* Priority and Department removed from compose modal per user request */}

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
