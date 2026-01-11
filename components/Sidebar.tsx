import { MaterialCommunityIcons } from "@expo/vector-icons";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";
import Svg, { Defs, Path, Stop, LinearGradient as SvgLinearGradient, Text as SvgText } from "react-native-svg";

const SIDEBAR_WIDTH = 240;

const items: Array<{
  key: string;
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}> = [
  { key: "dashboard", label: "Dashboard", icon: "view-grid-outline" },
  { key: "users", label: "Users", icon: "account-group-outline" },
  { key: "tickets", label: "Tickets", icon: "ticket-confirmation-outline" },
  { key: "officials", label: "Upgrade Path", icon: "badge-account-outline" },
  { key: "sparkChat", label: "Spark Chat", icon: "chat-outline" },
];

export type SidebarProps = {
  activeKey?: string;
  onSelect?: (value: string) => void;
};

export const Sidebar: React.FC<SidebarProps> = ({ activeKey = "tickets", onSelect }) => {
  return (
    <View
      style={{
        width: SIDEBAR_WIDTH,
        paddingTop: 32,
        paddingBottom: 32,
        borderRightWidth: 1,
        borderRightColor: "#F3F4F6",
        backgroundColor: "white",
      }}
    >
      <View style={{ paddingHorizontal: 28 }}>
        <Image
          source={require("../assets/images/spark-logo.png")}
          style={{ width: 140, height: 40, resizeMode: "contain" }}
        />
      </View>

      <View style={{ marginTop: 40 }}>
        {items.map((item) => {
          const isActive = item.key === activeKey;
          const isDisabled = item.key === 'dashboard' || item.key === 'users';
          const baseTextColor = "#2E2C34";
          const iconColor = isActive ? "#B93F4B" : "#7A7A8D";

          if (isDisabled) {
            // Render a visually normal but non-interactive item for disabled menu entries
            // Use TouchableOpacity with a no-op handler and activeOpacity=1 so the item
            // looks identical and does not provide press feedback or navigation.
            return (
              <TouchableOpacity key={item.key} style={{ paddingHorizontal: 20, marginBottom: 6 }} activeOpacity={1} onPress={() => {}}>
                {isActive ? (
                  <LinearGradient
                    colors={["#F9EFFD", "#FDEDF6"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{
                      borderRadius: 16,
                      paddingVertical: 14,
                      paddingHorizontal: 18,
                      flexDirection: "row",
                      alignItems: "center",
                    }}
                  >
                    {/* keep the same left spacing as non-active items: small spacer + icon */}
                    <View style={{ width: 4, height: 32, marginRight: 14 }} />
                    <MaterialCommunityIcons name={item.icon} size={20} color={iconColor} style={{ marginRight: 14 }} />
                    <Text style={{ fontSize: 16, fontWeight: "600", color: baseTextColor }}>{item.label}</Text>
                  </LinearGradient>
                ) : (
                    <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingVertical: 14,
                      paddingHorizontal: 18,
                      borderRadius: 12,
                    }}
                  >
                    <View style={{ width: 4, height: 32, marginRight: 14 }} />
                    <MaterialCommunityIcons name={item.icon} size={20} color={iconColor} style={{ marginRight: 14 }} />
                    <Text style={{ fontSize: 16, fontWeight: "500", color: baseTextColor }}>{item.label}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          }

          return (
            <TouchableOpacity
              key={item.key}
              activeOpacity={0.85}
              onPress={() => onSelect?.(item.key)}
              style={{ paddingHorizontal: 20, marginBottom: 6 }}
            >
                {isActive ? (
                  <LinearGradient
                    colors={["#F9EFFD", "#FDEDF6"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{
                      borderRadius: 16,
                      paddingVertical: 14,
                      paddingHorizontal: 18,
                      flexDirection: "row",
                      alignItems: "center",
                    }}
                  >
                    {/* keep the same left spacing as non-active items: small spacer + icon */}
                    <View style={{ width: 4, height: 32, marginRight: 14 }} />
                    <MaterialCommunityIcons name={item.icon} size={20} color={iconColor} style={{ marginRight: 14 }} />
                    {item.label === "Tickets" ? (
                      <MaskedView
                        maskElement={
                          <Text style={{ fontSize: 16, fontWeight: "600", color: "#B93F4B" }}>
                            {item.label}
                          </Text>
                        }
                      >
                        <LinearGradient
                          colors={["#B93F4B", "#451268"]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                        >
                          <Text style={{ fontSize: 16, fontWeight: "600", color: "transparent" }}>
                            {item.label}
                          </Text>
                        </LinearGradient>
                      </MaskedView>
                    ) : (
                      <Text style={{ fontSize: 16, fontWeight: "600", color: baseTextColor }}>
                        {item.label}
                      </Text>
                    )}
                  </LinearGradient>
                ) : (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 14,
                    paddingHorizontal: 18,
                    borderRadius: 12,
                  }}
                >
                  <View style={{ width: 4, height: 32, marginRight: 14 }} />
                  <MaterialCommunityIcons
                    name={item.icon}
                    size={20}
                    color={iconColor}
                    style={{ marginRight: 14 }}
                  />
                  <Text
                    style={{ fontSize: 16, fontWeight: "500", color: baseTextColor }}
                  >
                    {item.label}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* English language indicator at the bottom (gradient icon + gradient text) */}
      <View style={{ position: "absolute", bottom: 40, left: 0, right: 0, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}>
        <Svg width={26} height={26} viewBox="0 0 24 24" style={{ marginBottom: 6 }}>
          <Defs>
            <SvgLinearGradient id="lang-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor="#B93F4B" />
              <Stop offset="100%" stopColor="#451268" />
            </SvgLinearGradient>
          </Defs>
          <Path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm6.93 6h-2.95c-.32-1.25-.78-2.45-1.38-3.56 1.84.63 3.37 1.91 4.33 3.56zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14C4.1 13.36 4 12.69 4 12s.1-1.36.26-2h3.38c-.08.66-.14 1.32-.14 2 0 .68.06 1.34.14 2H4.26zm.82 2h2.95c.32 1.25.78 2.45 1.38 3.56-1.84-.63-3.37-1.9-4.33-3.56zm2.95-8H5.08c.96-1.66 2.49-2.93 4.33-3.56C8.81 5.55 8.35 6.75 8.03 8zM12 19.96c-.83-1.2-1.48-2.53-1.91-3.96h3.82c-.43 1.43-1.08 2.76-1.91 3.96zM14.34 14H9.66c-.09-.66-.16-1.32-.16-2 0-.68.07-1.35.16-2h4.68c.09.65.16 1.32.16 2 0 .68-.07 1.34-.16 2zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95c-.96 1.65-2.49 2.93-4.33 3.56zM16.36 14c.08-.66.14-1.32.14-2 0-.68-.06-1.34-.14-2h3.38c.16.64.26 1.31.26 2s-.1 1.36-.26 2h-3.38z" fill="url(#lang-grad)" />
        </Svg>

        <Svg width={36} height={20} viewBox="0 0 36 20" style={{ marginLeft: 2 }}>
          <Defs>
            <SvgLinearGradient id="lang-text-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor="#B93F4B" />
              <Stop offset="100%" stopColor="#451268" />
            </SvgLinearGradient>
          </Defs>
          <SvgText fill="url(#lang-text-grad)" fontSize={18} fontWeight="200" x={0} y={14}>EN</SvgText>
        </Svg>
      </View>
    </View>
  );
};

export default Sidebar;
