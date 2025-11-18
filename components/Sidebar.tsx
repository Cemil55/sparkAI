import { MaterialCommunityIcons } from "@expo/vector-icons";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";

const SIDEBAR_WIDTH = 240;

const items: Array<{
  key: string;
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}> = [
  { key: "dashboard", label: "Dashboard", icon: "view-grid-outline" },
  { key: "users", label: "Users", icon: "account-group-outline" },
  { key: "tickets", label: "Tickets", icon: "ticket-confirmation-outline" },
  { key: "officials", label: "Officials", icon: "badge-account-outline" },
  { key: "settings", label: "Site Settings", icon: "cog-outline" },
];

export type SidebarProps = {
  activeKey?: string;
  onSelect?: (value: string) => void;
};

export const Sidebar: React.FC<SidebarProps> = ({ activeKey = "tickets", onSelect }) => {
  return (
    <LinearGradient
      colors={["#FFFFFF", "#F5ECFF"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={{
        width: SIDEBAR_WIDTH,
        paddingTop: 48,
        paddingBottom: 32,
        borderRightWidth: 1,
        borderRightColor: "#ECE5F5",
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
          const baseTextColor = "#2E2C34";
          const iconColor = isActive ? "#451268" : "#7A7A8D";

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
                    <View
                      style={{
                        width: 4,
                        height: 32,
                        borderRadius: 4,
                        backgroundColor: "#451268",
                        marginRight: 14,
                      }}
                    />
                    <MaterialCommunityIcons
                      name={item.icon}
                      size={20}
                      color={iconColor}
                      style={{ marginRight: 14 }}
                    />
                    {item.label === "Tickets" ? (
                      <MaskedView
                        maskElement={
                          <Text style={{ fontSize: 16, fontWeight: "600", color: "#451268" }}>
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
    </LinearGradient>
  );
};

export default Sidebar;
