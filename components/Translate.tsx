import React from "react";
import { Text, View } from "react-native";

type Props = {
  subject: string;
  description: string;
  loading?: boolean;
  result?: string | null;
  error?: string | null;
};

const Translate: React.FC<Props> = ({ subject, description, loading, result, error }) => {
  // Presentational: parent component performs the API call and passes in state
  // Do not show a loading indicator under the ticket description — only show errors.
  if (!error) return null;

  return (
    <View style={{ marginTop: 12 }}>
      <Text style={{ color: "#B93F4B" }}>{error}</Text>
    </View>
  );
};

export default Translate;
