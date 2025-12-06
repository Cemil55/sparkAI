import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from 'expo-linear-gradient';
import React from "react";
import { ActivityIndicator, Alert, Text, TextInput, TextStyle, TouchableOpacity, View } from "react-native";
import Svg, { Defs, Stop, LinearGradient as SvgLinearGradient, Text as SvgText } from 'react-native-svg';

type Props = {
  fromOptions?: string[];
  toOptions?: string[];
  addonsOptions?: string[];
  onChange?: (from: string, to: string, addon: string | null) => void;
};

const defaultFrom = ["R9C", "R10","R11","R14A","R14B","R16B", "R18"];
const defaultTo = ["R9C", "R10","R11","R14A","R14B","R16B", "R18"];
const defaultAddons = ["None", "ALS", "Hardening", "FO's", "DIRAC"];

const Dropdown: React.FC<{
  label?: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  style?: any;
}> = ({ label, options, value, onChange, style }) => {
  const [open, setOpen] = React.useState(false);
  return (
    <View style={{ minWidth: 120 }}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => setOpen((s) => !s)}
        style={{
          borderWidth: 1,
          borderColor: "#E5E7EB",
          borderRadius: 8,
          paddingHorizontal: 12,
          paddingVertical: 10,
          backgroundColor: "white",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          ...style,
        }}
      >
        <Text style={{ color: value ? "#111827" : "#9CA3AF", fontWeight: "600" }}>{value || label || "Select"}</Text>
        <MaterialCommunityIcons name={open ? "chevron-up" : "chevron-down"} size={20} color="#6B7280" />
      </TouchableOpacity>

      {open && (
        <View style={{ position: "absolute", top: 56, left: 0, right: 0, zIndex: 100, backgroundColor: "white", borderRadius: 8, borderWidth: 1, borderColor: "#E5E7EB", padding: 6, shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 6 }}>
          {options.map((o) => (
            <TouchableOpacity
              key={o}
              onPress={() => {
                onChange(o);
                setOpen(false);
              }}
              style={{ paddingVertical: 8, paddingHorizontal: 8, borderRadius: 6 }}
            >
              <Text style={{ color: o === value ? "#111827" : "#374151", fontWeight: o === value ? "700" : "500" }}>{o}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
};

const UpgradePath: React.FC<Props> = ({ fromOptions, toOptions, addonsOptions, onChange }) => {
  const fromList = fromOptions ?? defaultFrom;
  const toList = toOptions ?? defaultTo;
  const addonsList = addonsOptions ?? defaultAddons;

  const [from, setFrom] = React.useState<string>(fromList[0] ?? "");
  const [to, setTo] = React.useState<string>(toList[0] ?? "");
  const [addon, setAddon] = React.useState<string | null>(addonsList[0] ?? null);
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<any | null>(null);
  const [contentHeight, setContentHeight] = React.useState<number | undefined>(undefined);
  const [showRaw, setShowRaw] = React.useState(false);

  const extractText = (obj: any): string => {
    if (!obj && obj !== 0) return "";

    const topCandidates = ["text", "answer", "response", "output", "message", "generated_text"];

    // 1) direct top-level string candidates
    for (const key of topCandidates) {
      if (typeof obj[key] === "string" && obj[key].trim()) return obj[key].trim();
    }

    // 2) data array first-item
    if (Array.isArray(obj.data) && obj.data.length > 0) {
      const first = obj.data[0];
      if (typeof first === "string" && first.trim()) return first.trim();
      if (first && typeof first === "object") {
        for (const k of topCandidates) {
          if (typeof first[k] === "string" && first[k].trim()) return first[k].trim();
        }
        if (typeof first.output === "string" && first.output.trim()) return first.output.trim();
        if (typeof first.data === "string" && first.data.trim()) return first.data.trim();
      }
    }

    // 3) data as object
    if (obj.data && typeof obj.data === "object") {
      for (const k of topCandidates) {
        if (typeof obj.data[k] === "string" && obj.data[k].trim()) return obj.data[k].trim();
      }
      if (typeof obj.data.output === "string" && obj.data.output.trim()) return obj.data.output.trim();
    }

    // 4) top-level fallback keys
    if (typeof obj.text === "string" && obj.text.trim()) return obj.text.trim();
    if (typeof obj.answer === "string" && obj.answer.trim()) return obj.answer.trim();
    if (typeof obj.response === "string" && obj.response.trim()) return obj.response.trim();
    if (typeof obj.generated_text === "string" && obj.generated_text.trim()) return obj.generated_text.trim();
    if (typeof obj.data === "string" && obj.data.trim()) return obj.data.trim();

    // 5) deep search (limited depth) for first textual pieces
    const visited = new WeakSet<object>();
    const collect = (node: any, depth = 0): string[] => {
      if (node === null || node === undefined) return [];
      if (typeof node === "string") return node.trim() ? [node.trim()] : [];
      if (typeof node === "number" || typeof node === "boolean") return [String(node)];
      if (Array.isArray(node)) {
        if (depth > 3) return [];
        return node.flatMap((item) => collect(item, depth + 1));
      }
      if (typeof node === "object") {
        if (visited.has(node)) return [];
        visited.add(node);
        if (depth > 3) return [];
        return Object.values(node).flatMap((v) => collect(v, depth + 1));
      }
      return [];
    };

    const extracted = collect(obj);
    const unique = Array.from(new Set(extracted)).filter(Boolean);
    return unique.join("\n\n");
  };

  React.useEffect(() => {
    onChange?.(from, to, addon);
  }, [from, to, addon]);

  const labelStyle: TextStyle = { color: "#6B7280", fontWeight: "700", marginBottom: 6 };

  const GradientText: React.FC<{ text: string; fontSize?: number; fontWeight?: string; style?: any }> = ({ text, fontSize = 16, fontWeight = '700', style }) => {
    // Small svg gradient title for inline labels
    return (
      <Svg width="120" height={fontSize + 6} style={style}>
        <Defs>
          <SvgLinearGradient id={`upgrade-path-grad-sm-${fontSize}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor="#B93F4B" />
            <Stop offset="100%" stopColor="#451268" />
          </SvgLinearGradient>
        </Defs>
        <SvgText fill={`url(#upgrade-path-grad-sm-${fontSize})`} fontSize={fontSize} fontWeight={fontWeight} x="0" y={fontSize}>
          {text}
        </SvgText>
      </Svg>
    );
  };

  return (
    <View style={{ width: "100%", gap: 10 }}>
      {/* Gradient title (SVG for reliable gradient fill) */}
      <Svg width="100%" height={38} style={{ marginBottom: 30 }}>
        <Defs>
          <SvgLinearGradient id="upgrade-path-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor="#B93F4B" />
            <Stop offset="100%" stopColor="#451268" />
          </SvgLinearGradient>
        </Defs>
        <SvgText fill="url(#upgrade-path-grad)" fontSize="30" fontWeight="700" x="0" y={28}>
          {`FOXMAN-UN / UNEM Upgrade Path Assistant`}
        </SvgText>
      </Svg>

      <View style={{ flexDirection: "row", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
           <GradientText text="From" fontSize={23} style={{ marginRight: -40 }} />
          <Dropdown options={fromList} value={from} onChange={setFrom} />

          <GradientText text="to" fontSize={23} style={{ marginLeft: 100, marginRight: 0 }} />

          <View style={{ marginLeft: -70 }}>
            <Dropdown options={toList} value={to} onChange={setTo} />
          </View>

 <GradientText text="Add-ons" fontSize={23} style={{ marginLeft: 150, marginRight: -10 }} />
          <Dropdown options={addonsList} value={addon ?? ""} onChange={(v) => setAddon(v)} />

            
 <TouchableOpacity activeOpacity={0.9} onPress={async () => {
            // compose question exactly as required
            const question = `From ${from} to ${to} Add ons: ${addon ?? 'None'}`;
            const payload = { question };
            setLoading(true);
            setResult(null);
            try {
              const response = await fetch(
                "https://fhnwbai-fw-team-b.hf.space/api/v1/prediction/c8052497-8650-4fee-a802-64a3b4963646",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(payload),
                }
              );

              if (!response.ok) {
                const text = await response.text();
                throw new Error(`HTTP ${response.status}: ${text}`);
              }

              const json = await response.json();
              setResult(json);
              console.log('Upgrade path response', json);
              Alert.alert('Antwort erhalten', 'Upgrade Path Antwort erhalten (siehe Konsole oder Vorschau)');
            } catch (err: any) {
              console.warn('Upgrade path request failed', err);
              Alert.alert('Fehler', String(err?.message ?? err));
            } finally {
              setLoading(false);
            }
          }}>
          <LinearGradient
            colors={["#B93F4B", "#451268"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ borderRadius: 12, marginLeft: 300, overflow: 'hidden' }}
          >
            <View style={{ paddingVertical: 12, paddingHorizontal: 20 , alignItems: 'center' }}>
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={{ color: 'white', fontWeight: '600', fontSize: 16 }}>Show Upgrade Path</Text>
              )}
            </View>
          </LinearGradient>
        </TouchableOpacity>
      





      </View>






    </View>
{result ? (
        <View style={{ marginTop: 30, padding: 12, borderRadius: 8 ,marginLeft: -10 }}>
        
          {(() => {
            const text = typeof result === 'string' ? result : extractText(result);
            const display = text && text.length ? text : JSON.stringify(result, null, 2);
              return (
                <LinearGradient
                  colors={["#B93F4B", "#451268"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{ marginTop: 30, borderRadius: 10, padding: 2 }}
                >
                  <View style={{ borderRadius: 8, backgroundColor: '#FFF', overflow: 'hidden' }}>
                    <TextInput
                      value={display}
                      editable={false}
                      multiline
                      onContentSizeChange={(e) => setContentHeight(e.nativeEvent.contentSize.height)}
                      style={{ color: '#111827', padding: 20, height: Math.max(80, Math.min(contentHeight ?? 80, 800)) }}
                    />
                  </View>
                </LinearGradient>
              );
          })()}

        
        </View>
      ) : null}
       </View>

  );
};

export default UpgradePath;
