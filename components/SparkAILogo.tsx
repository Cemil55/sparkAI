import React from "react";
import { Text, View } from "react-native";

export const SparkAILogo = () => {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Text
        style={{
          fontSize: 24,
          fontWeight: "900",
          color: "#A91D63",
          letterSpacing: -1,
        }}
      >
        SPARK
      </Text>
      <View
        style={{
          backgroundColor: "#8B1A5E",
          paddingHorizontal: 8,
          paddingVertical: 4,
          borderRadius: 6,
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: "bold", color: "white" }}>
          Ai
        </Text>
      </View>
    </View>
  );
};
