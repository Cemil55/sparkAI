import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Image, Text, TouchableOpacity, View, type ImageSourcePropType } from "react-native";
import Svg, { Defs, Path, Stop, LinearGradient as SvgLinearGradient, Text as SvgText } from "react-native-svg";

export type TopbarProps = {
  userName?: string;
  onMenuPress?: () => void;
  userAvatarSource?: ImageSourcePropType;
};

const gradientColors = ["#B93F4B", "#451268"] as const;
const defaultAvatar = require("../assets/images/Sam.png");

export const Topbar: React.FC<TopbarProps> = ({
  userName = "Sam Singh",
  onMenuPress,
  userAvatarSource = defaultAvatar,
}) => {
  return (
    <View
      style={{
        paddingVertical: 12,
        paddingHorizontal: 32,
        borderBottomWidth: 1,
        borderBottomColor: "#F3F4F6",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: "white",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 18 }}>
        <TouchableOpacity activeOpacity={0.85} onPress={onMenuPress} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
          <Svg width="24" height="24" viewBox="0 0 24 24">
            <Defs>
              <SvgLinearGradient id="menu-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor="#B93F4B" />
                <Stop offset="100%" stopColor="#451268" />
              </SvgLinearGradient>
            </Defs>
            <Path
              d="M3 12H21M3 6H21M3 18H21"
              stroke="url(#menu-gradient)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </TouchableOpacity>

        <View style={{ height: 28, width: 250 }}>
          <Svg width="100%" height="100%">
            <Defs>
              <SvgLinearGradient id="welcome-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                <Stop offset="0%" stopColor="#B93F4B" />
                <Stop offset="100%" stopColor="#451268" />
              </SvgLinearGradient>
            </Defs>
            <SvgText
              fill="url(#welcome-grad)"
              fontSize="20"
              fontWeight="400"
              x="0"
              y="20"
            >
           
            </SvgText>
          </Svg>
        </View>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 18 }}>
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ padding: 2, borderRadius: 28 }}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: "white",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MaterialCommunityIcons name="bell-outline" size={22} color="#451268" />
          </View>
        </LinearGradient>

        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ padding: 2, borderRadius: 999 }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "white",
              borderRadius: 999,
              paddingHorizontal: 14,
              paddingVertical: 6,
              gap: 10,
            }}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                overflow: "hidden",
                backgroundColor: "#F2EAFF",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {userAvatarSource ? (
                <Image
                  source={userAvatarSource}
                  style={{ width: 36, height: 36, borderRadius: 18, resizeMode: "cover" }}
                />
              ) : (
                <LinearGradient
                  colors={gradientColors}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
                >
                  <Text style={{ color: "white", fontWeight: "700" }}>
                    {userName?.[0] ?? "S"}
                  </Text>
                </LinearGradient>
              )}
            </View>

            <View style={{ height: 20, width: 120 }}>
              <Svg width="100%" height="100%">
                <Defs>
                  <SvgLinearGradient id="username-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <Stop offset="0%" stopColor="#B93F4B" />
                    <Stop offset="100%" stopColor="#451268" />
                  </SvgLinearGradient>
                </Defs>
                <SvgText
                  fill="url(#username-grad)"
                  fontSize="16"
                  fontWeight="400"
                  x="0"
                  y="14"
                >
                  {userName}
                </SvgText>
              </Svg>
            </View>

            <MaterialCommunityIcons name="chevron-down" size={22} color="#451268" />
          </View>
        </LinearGradient>
      </View>
    </View>
  );
};

export default Topbar;
