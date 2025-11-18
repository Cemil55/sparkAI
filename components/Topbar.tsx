import { MaterialCommunityIcons } from "@expo/vector-icons";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Image, Text, TouchableOpacity, View, type ImageSourcePropType } from "react-native";

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
    <LinearGradient
      colors={["#FFFFFF", "#FBF8FF"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        borderRadius: 28,
        paddingVertical: 20,
        paddingHorizontal: 28,
        marginBottom: 28,
        shadowColor: "#451268",
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.08,
        shadowRadius: 18,
        elevation: 8,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 18 }}>
        <TouchableOpacity activeOpacity={0.85} onPress={onMenuPress}>
          <LinearGradient
            colors={gradientColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MaterialCommunityIcons name="menu" size={22} color="white" />
          </LinearGradient>
        </TouchableOpacity>

        <MaskedView
          maskElement={
            <Text style={{ fontSize: 20, fontWeight: "700" }}>{`Welcome! ${userName}`}</Text>
          }
        >
          <LinearGradient
            colors={gradientColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Text style={{ fontSize: 20, fontWeight: "700", color: "transparent" }}>
              {`Welcome! ${userName}`}
            </Text>
          </LinearGradient>
        </MaskedView>
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

            <MaskedView
              maskElement={<Text style={{ fontSize: 16, fontWeight: "600" }}>{userName}</Text>}
            >
              <LinearGradient
                colors={gradientColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={{ fontSize: 16, fontWeight: "600", color: "transparent" }}>{userName}</Text>
              </LinearGradient>
            </MaskedView>

            <MaterialCommunityIcons name="chevron-down" size={22} color="#451268" />
          </View>
        </LinearGradient>
      </View>
    </LinearGradient>
  );
};

export default Topbar;
