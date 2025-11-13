import { Stack } from "expo-router";
import { Image, View } from "react-native";

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerTitle: "",
        headerLeft: () => (
          <View style={{ marginLeft: 22 }}>
            <Image
              source={require("../assets/images/spark-logo.png")}
              style={{ width: 140, height: 40, resizeMode: "contain" }}
            />
          </View>
        ),
      }}
    />
  );
}
